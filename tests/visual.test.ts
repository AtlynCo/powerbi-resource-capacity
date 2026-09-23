import { afterEach, describe, expect, it, vi } from "vitest";
import { Visual } from "../src/visual";
import { makeHost, makeSelectionId, makeUpdate, makeView } from "./fixtures";
import type powerbi from "powerbi-visuals-api";
import config from "../pbiviz.json";

// Vite transpiles without the SDK const-enum inlining used by the real package compiler.
vi.mock("powerbi-visuals-api", () => ({ default: { VisualUpdateType: { Data: 2, Style: 16 } } }));

const visuals: Visual[] = [];
afterEach(() => {
  visuals.forEach(v => v.destroy());
  visuals.length = 0;
  document.body.replaceChildren();
  vi.useRealTimers();
});
function setup() {
  const mocks = makeHost();
  const root = document.createElement("div");
  document.body.append(root);
  const visual = new Visual({ element: root, host: mocks.host });
  visuals.push(visual);
  const view = makeView({ metadata: { objects: { analysis: { unit: "hours" } } } });
  visual.update(makeUpdate(view));
  return { ...mocks, root, visual, view };
}

describe("native host lifecycle", () => {
  it("shows a bounded type-only key diagnostic and version without exposing data, including tiny tiles", () => {
    const { root, visual, view } = setup();
    view.categorical.categories[0].values = ["PRIVATE_RESOURCE", "PRIVATE_RESOURCE"];
    view.categorical.categories[1].source.type = { dateTime: true };
    view.categorical.categories[1].values = [new Date(2026, 7, 3), "PRIVATE_DATE_VALUE"];
    visual.update(makeUpdate(view));
    const message = root.querySelector(".status")?.textContent;
    expect(message).toContain(`Input diagnostic: visual ${config.visual.version}; row 2; role Period; type string; expected Date.`);
    expect(message?.length).toBeLessThan(400);
    expect(root.textContent).not.toContain("PRIVATE_");
    expect(root.querySelector(".cell")).toBeNull();
    visual.update(makeUpdate(view, { viewport: { width: 80, height: 80 } }));
    expect(root.querySelector(".tiny-summary")?.getAttribute("aria-label")).toBe(message);
    visual.update(makeUpdate(makeView({ metadata: { objects: { analysis: { unit: "hours" } } } })));
    expect(root.querySelector(".status")?.textContent).not.toContain("Input diagnostic");
    expect(root.querySelectorAll(".cell")).toHaveLength(2);
  });

  it("requires real host constructor options", () => {
    expect(() => new Visual()).toThrow("constructor options");
  });
  it("reports completed renders and preserves cells on size-only updates", () => {
    const { root, visual, eventService } = setup();
    const cell = root.querySelector(".cell");
    visual.update({ dataViews: [], viewport: { width: 280, height: 180 }, type: 4 });
    expect(root.querySelector(".cell")).toBe(cell);
    expect(root.querySelector(".atlyn-capacity")?.getAttribute("style")).toContain("280px");
    expect(eventService.renderingStarted).toHaveBeenCalledTimes(2);
    expect(eventService.renderingFinished).toHaveBeenCalledTimes(2);
    expect(eventService.renderingFailed).not.toHaveBeenCalled();
  });
  it("reports rendering failures visibly and never reports success for the failed render", () => {
    const { root, visual, view, createSelectionIdBuilder, eventService } = setup();
    createSelectionIdBuilder.mockImplementation(() => { throw new Error("Host unavailable"); });
    visual.update(makeUpdate(view));
    expect(root.querySelector(".status")?.textContent).toContain("could not render");
    expect(root.querySelector(".cell")).toBeNull();
    expect(eventService.renderingFinished).toHaveBeenCalledTimes(1);
    expect(eventService.renderingFailed).toHaveBeenCalledTimes(1);
  });
  it("honors host-disabled interactions without disabling read-only navigation", () => {
    const { root, visual, view, hostCapabilities, selectionManager } = setup();
    hostCapabilities.allowInteractions = false;
    visual.update(makeUpdate(view));
    expect(root.querySelector(".status")?.textContent).toContain("disabled by this host");
    const cell = root.querySelector<HTMLElement>(".cell")!;
    cell.click();
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(selectionManager.select).not.toHaveBeenCalled();
    expect(selectionManager.showContextMenu).not.toHaveBeenCalled();
    const toolbar = root.querySelector<HTMLElement>(".toolbar")!;
    toolbar.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(selectionManager.showContextMenu).not.toHaveBeenCalled();
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement?.getAttribute("data-col")).toBe("1");
  });
  it("invokes native context menu on empty space above and around the visual", () => {
    const { root, visual, selectionManager } = setup();
    const toolbar = root.querySelector<HTMLElement>(".toolbar")!;
    toolbar.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 20 }));
    expect(selectionManager.showContextMenu).toHaveBeenCalledWith(expect.anything(), { x: 50, y: 20 });
    selectionManager.showContextMenu.mockClear();

    const caption = root.querySelector<HTMLElement>(".caption")!;
    caption.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 60, clientY: 40 }));
    expect(selectionManager.showContextMenu).toHaveBeenCalledWith(expect.anything(), { x: 60, y: 40 });
    selectionManager.showContextMenu.mockClear();

    // Context menu in empty / onboarding state
    visual.update({ dataViews: [], type: 2, viewport: { width: 400, height: 300 } });
    root.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 150 }));
    expect(selectionManager.showContextMenu).toHaveBeenCalledWith(expect.anything(), { x: 100, y: 150 });
    selectionManager.showContextMenu.mockClear();

    // Keyboard Shift+F10 on empty space / non-cell
    root.firstElementChild!.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
    expect(selectionManager.showContextMenu).toHaveBeenCalledTimes(1);
  });
  it("surfaces native selection rejection", async () => {
    const { root, selectionManager } = setup();
    selectionManager.select.mockRejectedValueOnce(new Error("Selection failed"));
    root.querySelector<HTMLElement>(".cell")!.click();
    await Promise.resolve();
    expect(root.querySelector(".status")?.textContent).toContain("Host interaction failed");
  });
  it("keeps an accepted load pending until host data arrives and explains a long wait", () => {
    vi.useFakeTimers();
    const { root, visual, view, fetchMoreData } = setup();
    view.metadata.segment = {};
    visual.update(makeUpdate(view));
    const more = [...root.querySelectorAll("button")].find(b => b.textContent === "Load more")!;
    more.click();
    expect(fetchMoreData).toHaveBeenCalledWith(true);
    expect(more.disabled).toBe(true);
    vi.advanceTimersByTime(15000);
    expect(root.querySelector(".status")?.textContent).toContain("Still waiting");
    delete view.metadata.segment;
    visual.update(makeUpdate(view));
    expect(more.hidden).toBe(true);
    expect(root.querySelector(".status")?.textContent).not.toContain("PARTIAL");
  });
  it("provides a bound-unit landing message and all modern format cards", () => {
    const { root, visual } = setup();
    visual.update(makeUpdate(makeView()));
    expect(root.querySelector(".status")?.textContent).toContain("Compatible unit");
    expect(root.querySelector(".cell")).toBeNull();
    expect(visual.getFormattingModel().cards).toHaveLength(2);
    visual.update({ dataViews: [], type: 2, viewport: { width: 400, height: 300 } });
    expect(root.querySelector(".status")?.textContent).toContain("Bind one stable Resource");
  });
  it("displays empty state onboarding when mandatory roles are missing or incomplete", () => {
    const { root, visual } = setup();
    const partialRoleConfigs = [
      // Only resource
      {
        categories: [{ source: { displayName: "Resource", roles: { resource: true } }, values: ["Ada"] }],
        values: []
      },
      // Resource + Period, missing allocated and capacity
      {
        categories: [
          { source: { displayName: "Resource", roles: { resource: true } }, values: ["Ada"] },
          { source: { displayName: "Period", roles: { period: true } }, values: ["Week 1"] }
        ],
        values: []
      },
      // Resource + Period + Allocated, missing capacity
      {
        categories: [
          { source: { displayName: "Resource", roles: { resource: true } }, values: ["Ada"] },
          { source: { displayName: "Period", roles: { period: true } }, values: ["Week 1"] }
        ],
        values: [
          { source: { displayName: "Allocated", roles: { allocated: true } }, values: [40] }
        ]
      },
      // Missing resource category
      {
        categories: [
          { source: { displayName: "Period", roles: { period: true } }, values: ["Week 1"] }
        ],
        values: [
          { source: { displayName: "Allocated", roles: { allocated: true } }, values: [40] },
          { source: { displayName: "Capacity", roles: { capacity: true } }, values: [40] }
        ]
      }
    ];

    for (const categorical of partialRoleConfigs) {
      visual.update(makeUpdate({ metadata: { columns: [] }, categorical } as unknown as powerbi.DataView));
      expect(root.querySelector(".status")?.textContent).toContain("Bind one stable Resource");
      expect(root.querySelector(".onboarding")).not.toBeNull();
      expect(root.querySelector(".cell")).toBeNull();
      expect(root.querySelector<HTMLButtonElement>(".next-exception")?.disabled).toBe(true);
      expect(root.querySelector<HTMLButtonElement>(".details-button")?.disabled).toBe(true);
    }
  });
  it("releases matrix DOM and ignores late selection callbacks after destruction", () => {
    const { root, visual, emitSelection, view } = setup();
    const scroller = root.querySelector(".scroller");
    visual.destroy();
    emitSelection([]);
    visual.update(makeUpdate(view));
    expect(scroller?.childElementCount).toBe(0);
    expect(root.childElementCount).toBe(0);
  });
  it("preserves native dates and model amount formats through DOM and tooltips", () => {
    const { root, visual } = setup();
    const view = makeView({
      periods: [new Date(2026, 8, 10), new Date(2026, 8, 9)],
      sources: { period: { type: { dateTime: true }, format: "yyyy-MM-dd" }, allocated: { format: "#,0.00" } },
      metadata: { objects: { analysis: { unit: "hours" } } }
    });
    visual.update(makeUpdate(view));
    expect(root.querySelectorAll("thead th")[1]?.textContent).toBe("2026-09-09");
    expect(root.querySelector(".cell")?.textContent).toContain("8.00");
  });
  it("rejects malformed host identities rather than silently clearing selection", () => {
    const { root, emitSelection } = setup();
    emitSelection([{} satisfies powerbi.extensibility.ISelectionId]);
    expect(root.querySelector(".status")?.textContent).toContain("Host interaction failed");
  });
  it("updates format/bookmark properties on Style without losing unit validation", () => {
    const { root, visual, view } = setup();
    view.metadata.objects = { analysis: { unit: "FTE", additiveTotals: false }, layout: { rtl: true, cellWidth: 250 } };
    visual.update(makeUpdate(view, { type: 16 }));
    expect(root.querySelector(".caption")?.textContent).toContain("Unit: FTE");
    expect(root.querySelector(".atlyn-capacity")?.getAttribute("dir")).toBe("rtl");
    expect(root.querySelector(".atlyn-capacity")?.getAttribute("style")).toContain("250px");
    view.metadata.objects = { analysis: { unit: " ".repeat(2) } };
    visual.update(makeUpdate(view, { type: 16 }));
    expect(root.querySelector<HTMLDivElement>(".status")?.hidden).toBe(false);
    expect(root.querySelector(".cell")).toBeNull();
  });
  it("preserves data when a palette-only Style update supplies no replacement view", () => {
    const { root, visual, colorPalette } = setup();
    const cell = root.querySelector(".cell");
    colorPalette.isHighContrast = true;
    visual.update({ dataViews: [], viewport: { width: 900, height: 600 }, type: 16 });
    expect(root.querySelector(".cell")).toBe(cell);
    expect(root.querySelector(".atlyn-capacity")?.classList.contains("high-contrast")).toBe(true);
  });
  it("requires an actual true assertion for additive totals, not truthy malformed metadata", () => {
    const { root, visual, view } = setup();
    view.metadata.objects = { analysis: { unit: "FTE", additiveTotals: "false" }, layout: { rtl: "false" } };
    visual.update(makeUpdate(view));
    expect(root.querySelectorAll(".total")).toHaveLength(0);
    expect(root.querySelector(".atlyn-capacity")?.getAttribute("dir")).toBe("ltr");
  });
  it("reconciles changed host interaction policy on resize", () => {
    const { root, visual, hostCapabilities } = setup();
    hostCapabilities.allowInteractions = false;
    visual.update({ dataViews: [], viewport: { width: 300, height: 200 }, type: 4 });
    expect(root.querySelector(".status")?.textContent).toContain("disabled by this host");
    expect(root.querySelector<HTMLButtonElement>(".multi-select")?.disabled).toBe(true);
  });
  it("does not let an old selection promise override a later selection or a bookmark", async () => {
    const { root, selectionManager, emitSelection } = setup();
    const [first, second] = root.querySelectorAll<HTMLElement>(".cell");
    let resolveOld!: (ids: powerbi.extensibility.ISelectionId[]) => void;
    selectionManager.select.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    first!.click();
    second!.click();
    await Promise.resolve();
    expect(second!.getAttribute("aria-selected")).toBe("true");
    resolveOld([makeSelectionId("obsolete")]);
    await Promise.resolve();
    expect(second!.getAttribute("aria-selected")).toBe("true");
    selectionManager.select.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    first!.click();
    emitSelection([]);
    resolveOld([makeSelectionId("obsolete")]);
    await Promise.resolve();
    expect(root.querySelectorAll(".dimmed")).toHaveLength(0);
  });
  it("ignores an old failed request after a new data context", async () => {
    const { root, visual, view, selectionManager } = setup();
    let rejectOld!: (reason: Error) => void;
    selectionManager.select.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
    root.querySelector<HTMLElement>(".cell")!.click();
    visual.update(makeUpdate(view));
    rejectOld(new Error("Obsolete request"));
    await Promise.resolve();
    expect(root.querySelector(".status")?.textContent).not.toContain("Host interaction failed");
  });
  it("surfaces synchronous selection, tooltip, context and fetch host failures", () => {
    const { root, visual, view, selectionManager, tooltipService, fetchMoreData } = setup();
    const fail = () => { throw new Error("Host unavailable"); };
    selectionManager.select.mockImplementationOnce(fail);
    root.querySelector<HTMLElement>(".cell")!.click();
    expect(root.querySelector<HTMLDivElement>(".status")?.hidden).toBe(false);
    expect(root.querySelector(".status")?.textContent).toContain("Host interaction failed");
    tooltipService.show.mockImplementationOnce(fail);
    root.querySelector<HTMLElement>(".cell")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    selectionManager.showContextMenu.mockImplementationOnce(fail);
    root.querySelector<HTMLElement>(".cell")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    view.metadata.segment = {};
    visual.update(makeUpdate(view));
    fetchMoreData.mockImplementationOnce(fail);
    [...root.querySelectorAll("button")].find(b => b.textContent === "Load more")!.click();
    expect(root.querySelector(".status")?.textContent).toContain("Host interaction failed");
    expect(root.querySelector(".status")?.textContent).toContain("PARTIAL");
  });
  it("replaces stale tiny-tile success labels with binding and render failures", () => {
    const { root, visual, view } = setup();
    visual.update(makeUpdate(view, { viewport: { width: 80, height: 80 } }));
    expect(root.querySelector(".tiny-summary")?.getAttribute("aria-label")).toContain("overloaded");
    visual.update(makeUpdate(makeView(), { viewport: { width: 80, height: 80 } }));
    expect(root.querySelector(".tiny-summary")?.getAttribute("aria-label")).toContain("Compatible unit");
    visual.update(makeUpdate(view, { viewport: { width: NaN, height: 80 } }));
    expect(root.querySelector(".tiny-summary")?.getAttribute("aria-label")).toContain("could not render");
    expect(root.querySelector(".summary")?.textContent).toBe("");
  });
  it("puts tiny partial and empty states before the enlargement help", () => {
    const { root, visual, view } = setup();
    view.metadata.segment = {};
    visual.update(makeUpdate(view, { viewport: { width: 80, height: 80 } }));
    expect(root.querySelector(".tiny-summary")?.textContent).toMatch(/^Capacity\nPARTIAL\n/);
    visual.update(makeUpdate(makeView({ resources: [], periods: [], allocated: [], capacity: [],
      metadata: { objects: { analysis: { unit: "hours" } } } }), { viewport: { width: 80, height: 80 } }));
    expect(root.querySelector(".tiny-summary")?.textContent).toContain("No data");
    expect(root.querySelector(".tiny-summary")?.textContent).not.toContain("! 0");
  });
  it("navigates overloads without host selection and exposes full details", () => {
    const { root, visual, selectionManager } = setup();
    visual.update(makeUpdate(makeView({ allocated: [12, 5], capacity: [10, 0],
      metadata: { objects: { analysis: { unit: "hours" } } } })));
    root.querySelector<HTMLButtonElement>(".next-exception")!.click();
    expect(document.activeElement?.getAttribute("data-col")).toBe("1");
    expect(selectionManager.select).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>(".details-button")!.click();
    expect(root.querySelector(".inspector-body")?.textContent).toContain("Positive allocation against zero capacity");
    expect(root.querySelector(".inspector-body")?.textContent).toContain("hours");
    root.querySelector(".close-details")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector<HTMLElement>(".inspector")?.hidden).toBe(true);
    expect(selectionManager.clear).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { Visual } from "../src/visual";
import { makeHost, makeUpdate, makeView } from "./fixtures";
import type powerbi from "powerbi-visuals-api";

// Vite transpiles without the SDK const-enum inlining used by the real package compiler.
vi.mock("powerbi-visuals-api", () => ({ default: { VisualUpdateType: { Data: 2 } } }));

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
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement?.getAttribute("data-col")).toBe("1");
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
});

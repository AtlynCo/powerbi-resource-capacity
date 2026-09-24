/* global window, document, getComputedStyle, MutationObserver */
import { test as base, expect } from "@playwright/test";

// The server loads JS/CSS from the pbiviz archive. All host contracts below are mocks.
const test = base.extend({
  browserErrors: [async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await use(errors);
    expect(errors, "compiled plugin must not leak uncaught browser errors").toEqual([]);
  }, { auto: true }]
});
test.use({ viewport: { width: 1600, height: 1100 } });
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("grid")).toBeVisible();
});

const cellAt = (page, row, col) => page.locator(`.cell[data-row="${row}"][data-col="${col}"]`);
const selectedCells = page => page.locator('.cell[aria-selected="true"]');
const nextOverload = page => page.getByRole("button", { name: "Next overloaded cell (Alt+ArrowDown)", exact: true });
const mockCalls = (page, name) => page.evaluate(name => window.capacityTest.events.calls.filter(call => call === name).length, name);

async function expectFocus(page, row, col) {
  await expect(cellAt(page, row, col)).toBeFocused();
  await expect(page.locator('.cell[tabindex="0"]')).toHaveCount(1);
}
async function expectInside(inner, outer) {
  const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  expect(a.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(a.y).toBeGreaterThanOrEqual(b.y - 1);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width + 1);
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1);
}

for (const [width, height] of [[258, 198], [398, 298], [1280, 620], [1366, 768]]) {
  test(`${width}x${height} preserves readable grid, bounded controls and accessible scope`, async ({ page }) => {
    await page.evaluate(({ width, height }) => window.capacityTest.render({}, width, height), { width, height });
    const root = page.locator(".atlyn-capacity");
    const box = await root.boundingBox();
    expect([box.width, box.height]).toEqual([width, height]);
    await expect(page.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "31");
    await expect(page.getByRole("grid")).toHaveAttribute("aria-colcount", "15");
    await expect(page.locator(".summary")).toHaveAttribute("aria-label", /60 overloaded.*30 missing or invalid.*420 delivered records.*30 resources x 14 periods.*host-delivered report context/);
    await expect(page.locator(".caption")).toContainText("Unit: hours | allocated / capacity | Totals off");
    await expect(page.locator(".tiny-summary")).toBeHidden();
    for (const button of await page.locator(".toolbar button:visible").all()) await expectInside(button, root);
    await expectInside(page.locator(".scroller"), root);
    await expectInside(cellAt(page, 0, 0), page.locator(".scroller"));
    await cellAt(page, 0, 0).click();
    await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Cell details", exact: true }).click();
    await expectInside(page.locator(".inspector"), root);
    await expect(page.locator(".inspector")).toContainText("Allocated amount45.0Available capacity40.0Utilization112.5%Overload amount5.0");
    await page.keyboard.press("Escape");
    await expectFocus(page, 0, 0);
    await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(selectedCells(page)).toHaveCount(0);
  });
}

test("80x80 is an honest accessible summary, not a clipped interactive grid", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.render({}, 80, 80));
  await expect(page.locator(".atlyn-capacity")).toHaveClass(/tiny/);
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".tiny-summary")).toHaveText("Capacity\n! 60 | ? 30\nEnlarge to inspect cells.\n");
  await expect(page.getByRole("status")).toHaveAccessibleName(/60 overloaded.*30 missing or invalid.*420 delivered records/);
  await expectInside(page.locator(".tiny-summary"), page.locator(".atlyn-capacity"));
  await page.locator(".tiny-summary").focus();
  await expect(page.locator(".tiny-summary")).toBeFocused();
  await page.evaluate(() => window.capacityTest.render({ rows: 201, columns: 1 }, 80, 80));
  await expect.soft(page.locator(".tiny-summary")).toContainText("PARTIAL LIMIT");
  await expect(page.locator(".tiny-summary")).toHaveAttribute("aria-label", /200 overloaded/);
  await page.evaluate(() => window.capacityTest.render({ unit: "" }, 80, 80));
  await expect.soft(page.getByRole("status")).toHaveAccessibleName(/Compatible unit/);
  await expect(page.getByRole("grid")).toHaveCount(0);
  await page.evaluate(() => window.capacityTest.render({ rows: 0 }, 80, 80));
  await expect.soft(page.locator(".tiny-summary")).toContainText("No data");
});

test("resize across tiny and compact modes retains selected identity and table without rebuilding", async ({ page }) => {
  await cellAt(page, 0, 1).click();
  await page.evaluate(() => { window.beforeGrid = document.querySelector('[role="grid"]'); });
  for (const [width, height] of [[80, 80], [258, 198], [398, 298], [1280, 620], [1366, 768]]) {
    await page.evaluate(([width, height]) => window.capacityTest.resize(width, height), [width, height]);
    expect(await page.evaluate(() => window.beforeGrid === document.querySelector('[role="grid"]'))).toBe(true);
    await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
    if (width > 80) await expect(page.getByRole("grid")).toBeVisible();
  }
  expect(await mockCalls(page, "select")).toBe(1);
});

test("density clamps, long labels and two-axis offsets preserve pinned header geometry", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 30, columns: 20 });
    view.metadata.objects.layout = { cellWidth: 260, fontSize: 22 };
    view.categorical.categories[0].values = view.categorical.categories[0].values.map(v => `${v} ${"R".repeat(490)}`);
    view.categorical.categories[1].values = view.categorical.categories[1].values.map(v => `${v} ${"P".repeat(490)}`);
    window.capacityTest.updateView(view, 1280, 620);
    const scroller = document.querySelector(".scroller");
    scroller.scrollTop = 530; scroller.scrollLeft = 730;
  });
  await expect(page.locator(".resource").first()).toHaveAttribute("title", `Resource 001 ${"R".repeat(490)}`);
  await expect(page.locator("thead th").nth(1)).toHaveAttribute("title", `Week 01 ${"P".repeat(490)}`);
  expect((await page.locator("thead").boundingBox()).height).toBeLessThan(60);
  expect((await cellAt(page, 0, 0).boundingBox()).width).toBe(260);
  expect(await cellAt(page, 0, 0).evaluate(e => getComputedStyle(e).fontSize)).toBe("22px");
  const geometry = await page.evaluate(() => {
    const scroller = document.querySelector(".scroller"), corner = document.querySelector(".corner");
    const s = scroller.getBoundingClientRect(), c = corner.getBoundingClientRect();
    const row = document.querySelector(".resource").getBoundingClientRect(), header = document.querySelector("thead th:nth-child(4)").getBoundingClientRect();
    return { top: c.top - s.top, left: c.left - s.left, resourceLeft: row.left - s.left, headerTop: header.top - s.top, x: scroller.scrollLeft, y: scroller.scrollTop };
  });
  expect(geometry).toEqual({ top: 0, left: 0, resourceLeft: 0, headerTop: 0, x: 730, y: 530 });
  await page.evaluate(() => {
    const view = window.capacityTest.getView();
    view.metadata.objects.layout = { cellWidth: 1, fontSize: 100 };
    window.capacityTest.updateView(view, 398, 298, 16);
  });
  expect((await cellAt(page, 0, 0).boundingBox()).width).toBe(100);
  expect(await cellAt(page, 0, 0).evaluate(e => getComputedStyle(e).fontSize)).toBe("22px");
  await expect(page.locator(".resource").first()).toHaveAttribute("title", `Resource 001 ${"R".repeat(490)}`);
});

test("all amount states remain distinct and exposed without fabricated ratios or calendars", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 8 });
    view.categorical.values[0].values = [32, 40, 45, 8, 0, null, -1, 0];
    view.categorical.values[1].values = [40, 40, 40, 0, 0, 40, 40, 0];
    view.categorical.values[3].values[7] = 1;
    window.capacityTest.updateView(view, 1366, 768);
  });
  for (const [index, state, marker] of [[0, "available", "+"], [1, "full", "="], [2, "overload", "!"], [3, "overload", "!"], [4, "unavailable", "/"], [5, "missing", "?"], [6, "invalid", "X"], [7, "nonworking", "N"]]) {
    await expect(cellAt(page, 0, index)).toHaveClass(new RegExp(`state-${state}`));
    await expect(cellAt(page, 0, index).locator(".marker")).toHaveText(marker);
    await expect(cellAt(page, 0, index)).toHaveAttribute("aria-label", /Compatible unit: hours/);
  }
  await expect(cellAt(page, 0, 3)).toHaveAttribute("aria-label", /Utilization: Not defined.*Overload amount: 8.0.*Positive allocation against zero capacity/);
  await expect(cellAt(page, 0, 5)).toHaveAttribute("aria-label", /Allocated amount: -.*Utilization: Not defined/);
  await expect(cellAt(page, 0, 6)).toHaveAttribute("aria-label", /No invalid amounts are treated as zero/);
  await expect(cellAt(page, 0, 7)).toHaveAttribute("aria-label", /Model-supplied nonworking: Yes/);
  await expect(page.locator(".summary")).toContainText("2 overloaded | 2 missing or invalid | 8 delivered records");
  await expect(page.locator(".total")).toHaveCount(0);
  expect((await page.locator(".cell").allTextContents()).join(" ")).not.toMatch(/Infinity|NaN/);
});

test("missing Cartesian intersections and duplicate records cannot filter as invented cells", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 2, columns: 2 });
    for (const column of [...view.categorical.categories, ...view.categorical.values]) {
      column.values.splice(1, 1);
      column.identity?.splice(1, 1);
    }
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".state-absent")).toHaveCount(1);
  await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-label", /No delivered record \(missing or not yet loaded\)/);
  await cellAt(page, 0, 1).click();
  await page.keyboard.press("Shift+F10");
  expect(await mockCalls(page, "select")).toBe(0);
  expect(await mockCalls(page, "context")).toBe(0);
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
    view.categorical.categories[1].values[1] = "Week 01";
    view.categorical.values[2].values[1] = 0;
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".cell.state-duplicate")).toHaveCount(1);
  await expect(page.locator(".cell.state-duplicate .amounts")).toHaveText("? / ?");
  await page.locator(".cell.state-duplicate").click();
  await page.keyboard.press("Enter");
  expect(await mockCalls(page, "select")).toBe(0);
  await expect(page.locator(".summary")).toContainText("1 missing or invalid");
});

test("keyboard roving focus covers edges, row/viewport navigation and no-selection next overload", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.render({ rows: 30, columns: 14 }, 1280, 620));
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await expectFocus(page, 0, 0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expectFocus(page, 1, 1);
  await page.keyboard.press("End");
  await expectFocus(page, 1, 13);
  await page.keyboard.press("Home");
  await expectFocus(page, 1, 0);
  const pageStep = await cellAt(page, 1, 0).evaluate(td => Math.max(1, Math.floor(document.querySelector(".scroller").clientHeight / td.offsetHeight) - 1));
  await page.keyboard.press("PageDown");
  await expectFocus(page, 1 + pageStep, 0);
  await page.keyboard.press("PageUp");
  await expectFocus(page, 1, 0);
  await page.keyboard.press("Control+End");
  await expectFocus(page, 29, 13);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expectFocus(page, 29, 13);
  await page.keyboard.press("Alt+ArrowDown");
  await expectFocus(page, 0, 0);
  await nextOverload(page).click();
  await expectFocus(page, 0, 1);
  await page.keyboard.press("Alt+ArrowDown");
  await expectFocus(page, 1, 0);
  await expect(selectedCells(page)).toHaveCount(0);
  expect(await mockCalls(page, "select")).toBe(0);
  await page.keyboard.press("Enter");
  await expect(cellAt(page, 1, 0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+Space");
  await expect(selectedCells(page)).toHaveCount(2);
  await page.keyboard.press("ContextMenu");
  expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1).key)).toBe("Resource 002|Week 02");
  await page.keyboard.press("Escape");
  await expect(selectedCells(page)).toHaveCount(0);
});

test("details and guide preserve focus, raw precision, selection and partial warnings", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2, partial: true });
    view.categorical.values[0].values[0] = 45.123456789;
    window.capacityTest.updateView(view, 398, 298);
  });
  await cellAt(page, 0, 0).click();
  await page.getByRole("button", { name: "Cell details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close details", exact: true })).toBeFocused();
  await expect(page.getByRole("complementary", { name: "Cell details" })).toBeVisible();
  await expect(page.locator(".detail-warning")).toContainText("PARTIAL");
  await expect.soft(page.locator(".inspector-body")).toContainText("Unformatted allocated value45.123456789");
  await expect(page.locator(".inspector-body")).toContainText("Allocated amount45.1");
  await page.keyboard.press("Escape");
  await expectFocus(page, 0, 0);
  await expect(selectedCells(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Guide and legend", exact: true }).click();
  await expect.soft(page.getByRole("complementary", { name: "Guide and legend" })).toBeVisible();
  await expect(page.locator(".inspector")).toContainText("No automatic rebucketing.");
  await expect(page.locator(".inspector .legend-item")).toHaveCount(8);
  await page.getByRole("button", { name: "Close details", exact: true }).click();
  await expectFocus(page, 0, 0);
  await expect(selectedCells(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(selectedCells(page)).toHaveCount(0);
});

test("10,000 compiled cells retain ARIA and cached selection with no resize repaint churn", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.render({ rows: 200, columns: 50 }, 1366, 768));
  await expect(page.locator(".cell")).toHaveCount(10000);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "201");
  await expect(page.getByRole("grid")).toHaveAttribute("aria-colcount", "51");
  await expect(page.locator(".summary")).toHaveAttribute("aria-label", /10000 delivered records.*200 resources x 50 periods/);
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press("Control+End");
  await expectFocus(page, 199, 49);
  await expect(cellAt(page, 199, 49)).toHaveAttribute("aria-colindex", "51");
  await expect(cellAt(page, 199, 49).locator("..")).toHaveAttribute("aria-rowindex", "201");
  await page.keyboard.press("Space");
  await expect(selectedCells(page)).toHaveCount(1);
  await page.evaluate(() => {
    window.beforeGrid = document.querySelector('[role="grid"]');
    window.selectionMutations = [];
    window.selectionObserver = new MutationObserver(records => window.selectionMutations.push(...records.map(record => record.attributeName)));
    window.selectionObserver.observe(window.beforeGrid, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "class"] });
    window.capacityTest.resize(1280, 620);
    window.capacityTest.externalSelect(["Resource 200|Week 50"]);
  });

  expect(await page.evaluate(() => {
    window.selectionObserver.disconnect();
    return { sameGrid: window.beforeGrid === document.querySelector('[role="grid"]'), mutations: window.selectionMutations };
  })).toEqual({ sameGrid: true, mutations: [] });
  await page.evaluate(() => window.capacityTest.externalResourceSelect("Resource 199"));
  await expect(selectedCells(page)).toHaveCount(50);
  await expect(cellAt(page, 198, 49)).toHaveAttribute("aria-selected", "true");
  await expect(cellAt(page, 199, 49)).toHaveAttribute("aria-selected", "false");
  expect(await mockCalls(page, "select")).toBe(1);
});

test("dimming preserves cell border geometry instead of introducing new layout borders", async ({ page }) => {
  const borders = locator => locator.evaluate(e => ({
    top: getComputedStyle(e).borderTopWidth, start: getComputedStyle(e).borderInlineStartWidth,
    width: e.offsetWidth, height: e.offsetHeight
  }));
  const initial = await borders(cellAt(page, 0, 1));
  await cellAt(page, 0, 0).click();
  await expect(cellAt(page, 0, 1)).toHaveClass(/dimmed/);
  expect(await borders(cellAt(page, 0, 1))).toEqual(initial);
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  expect(await borders(cellAt(page, 0, 1))).toEqual(initial);
});

test("host high contrast and reduced motion retain non-color selection and keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.capacityTest.host.colorPalette.isHighContrast = true;
    window.capacityTest.render({ rows: 2, columns: 5, highlights: true }, 1280, 620);
  });
  await expect(page.locator(".atlyn-capacity")).toHaveClass(/high-contrast/);
  for (const locator of [page.locator(".corner"), cellAt(page, 0, 0), cellAt(page, 0, 1)]) {
    expect(await locator.evaluate(e => ({ color: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor }))).toEqual({ color: "rgb(255, 255, 0)", background: "rgb(0, 0, 0)" });
  }
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press("Space");
  await expect(cellAt(page, 0, 0)).toHaveClass(/selected/);
  const focus = await cellAt(page, 0, 0).evaluate(e => ({ style: getComputedStyle(e).outlineStyle, width: getComputedStyle(e).outlineWidth, color: getComputedStyle(e).outlineColor }));
  expect(focus.style).toMatch(/solid|dashed/);
  expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
  expect(focus.color).toBe("rgb(255, 255, 0)");
  await expect(cellAt(page, 0, 1)).toHaveClass(/dimmed/);
  expect(await cellAt(page, 0, 1).evaluate(e => ({ opacity: getComputedStyle(e).opacity, border: getComputedStyle(e).borderBottomStyle }))).toEqual({ opacity: "1", border: "dotted" });
  expect(await page.locator(".scroller").evaluate(e => ({
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    scroll: getComputedStyle(e).scrollBehavior, animation: getComputedStyle(e).animationName, transition: getComputedStyle(e).transitionDuration
  }))).toEqual({ reduced: true, scroll: "auto", animation: "none", transition: "0s" });
  await page.emulateMedia({ forcedColors: "active" });
  await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-selected", "true");
  const forcedFocus = await cellAt(page, 0, 0).evaluate(e => ({
    focus: getComputedStyle(e).outlineStyle,
    selection: getComputedStyle(e, "::after").borderTopStyle,
    selectionWidth: getComputedStyle(e, "::after").borderTopWidth
  }));
  expect(forcedFocus).toEqual({ focus: "dashed", selection: "solid", selectionWidth: "3px" });
});

test("RTL pins resource headers to the inline start and keeps opposite arrow semantics", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 20, columns: 20 });
    view.metadata.objects.layout.rtl = true;
    window.capacityTest.updateView(view, 1280, 620);
  });
  await expect(page.locator(".atlyn-capacity")).toHaveAttribute("dir", "rtl");
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press("ArrowLeft");
  await expectFocus(page, 0, 1);
  await page.keyboard.press("ArrowRight");
  await expectFocus(page, 0, 0);
  await page.keyboard.press("Control+End");
  await expectFocus(page, 19, 19);
  const geometry = await page.evaluate(() => {
    const s = document.querySelector(".scroller"), corner = document.querySelector(".corner").getBoundingClientRect();
    const resource = document.querySelector(".resource").getBoundingClientRect();
    const bounds = s.getBoundingClientRect();
    return { x: s.scrollLeft, y: s.scrollTop, cornerRight: bounds.right - corner.right, resourceRight: bounds.right - resource.right, top: corner.top - bounds.top };
  });
  expect(geometry.x).toBeLessThan(0); expect(geometry.y).toBeGreaterThan(0);
  expect(geometry.cornerRight).toBeLessThan(2); expect(geometry.resourceRight).toBeLessThan(2); expect(geometry.top).toBe(0);
  await page.getByRole("button", { name: "Cell details", exact: true }).click();
  const panel = await page.locator(".inspector").boundingBox(), root = await page.locator(".atlyn-capacity").boundingBox();
  expect(panel.x).toBe(root.x);
});

test("Style updates apply formatting and host capabilities without losing bookmark selections", async ({ page }) => {
  await page.evaluate(() => {
    window.capacityTest.host.localizedStrings.Analysis = "Analysis contract";
    window.capacityTest.externalSelect(["Resource 002|Week 02"]);
    const view = window.capacityTest.getView();
    view.metadata.objects.layout = { cellWidth: 180, fontSize: 16, rtl: true };
    view.metadata.objects.analysis.additiveTotals = true;
    window.capacityTest.updateView(view, 1280, 620, 16);
  });
  await expect(cellAt(page, 1, 1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".atlyn-capacity")).toHaveAttribute("dir", "rtl");
  expect((await cellAt(page, 0, 0).boundingBox()).width).toBe(180);
  await expect(page.locator(".total")).toHaveCount(30);
  const cards = await page.evaluate(() => window.capacityTest.formatModel().cards);
  expect(cards.map(card => card.displayName)).toEqual(["Analysis contract", "Layout"]);
  const descriptors = cards.flatMap(card => card.groups.flatMap(group => group.slices.map(slice => slice.control.properties.descriptor)));
  expect(descriptors.map(item => `${item.objectName}.${item.propertyName}`)).toEqual(["analysis.unit", "analysis.additiveTotals", "layout.cellWidth", "layout.fontSize", "layout.rtl"]);
  await page.evaluate(() => {
    window.capacityTest.host.hostCapabilities.allowInteractions = false;
    window.capacityTest.style(1280, 620);
  });
  await expect(page.locator(".status")).toContainText("interactions are disabled");
  for (const name of ["Clear selection", "Toggle multi-select for touch or pointer"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  await nextOverload(page).click();
  await expect(page.locator(".cell:focus")).toHaveClass(/state-overload/);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("Escape");
  expect(await mockCalls(page, "select")).toBe(0);
  expect(await mockCalls(page, "clear")).toBe(0);
  expect(await mockCalls(page, "context")).toBe(0);
  await expect(selectedCells(page)).toHaveCount(1);
  await page.evaluate(() => {
    window.capacityTest.host.hostCapabilities.allowInteractions = true;
    window.capacityTest.style(1280, 620);
  });
  await expect(page.getByRole("button", { name: "Clear selection", exact: true })).toBeEnabled();
  await expect(page.locator(".status")).not.toContainText("interactions are disabled");
});

test("missing identity suppresses mock selection/menu but preserves model inspection", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
    view.categorical.categories[0].identity[0] = undefined;
    window.capacityTest.updateView(view);
  });
  await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-label", /no native identity and cannot filter/);
  await expect(page.locator(".status")).toContainText("Some cells lack native identities");
  await cellAt(page, 0, 0).click();
  await page.keyboard.press("Shift+F10");
  expect(await mockCalls(page, "select")).toBe(0); expect(await mockCalls(page, "context")).toBe(0);
  await page.getByRole("button", { name: "Cell details", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("Allocated amount45.0Available capacity40.0");
  await page.keyboard.press("Escape");
  await cellAt(page, 0, 1).click();
  await expect(selectedCells(page)).toHaveCount(1);
  const categories = await page.evaluate(() => window.capacityTest.events.identityBuilds.at(-1));
  expect(categories).toEqual([
    { queryName: "Sample.resource", index: 1, identity: "Resource 001" },
    { queryName: "Sample.period", index: 1, identity: "Week 02" }
  ]);
});

test("interaction-disabled hosts retain read-only exploration but cannot select, clear, fetch or open menus", async ({ page }) => {
  await page.evaluate(() => {
    window.capacityTest.host.hostCapabilities.allowInteractions = false;
    window.capacityTest.render({ rows: 2, columns: 4, partial: true }, 398, 298);
  });
  await expect(page.locator(".status")).toContainText("interactions are disabled");
  for (const name of ["Clear selection", "Toggle multi-select for touch or pointer", "Load more"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await cellAt(page, 0, 0).click();
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("Escape");
  await nextOverload(page).click();
  await expectFocus(page, 0, 1);
  await page.getByRole("button", { name: "Cell details", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("Positive allocation against zero capacity");
  for (const name of ["select", "clear", "context", "fetch"]) expect(await mockCalls(page, name)).toBe(0);
  await expect(selectedCells(page)).toHaveCount(0);
});

test("independent instances isolate selection, formatting, callbacks, DOM and destruction", async ({ page }) => {
  await page.evaluate(() => {
    const second = window.capacityTest.createInstance("second-tile");
    const view = second.makeView({ rows: 2, columns: 3, unit: "FTE" });
    view.metadata.objects.layout.rtl = true;
    second.host.colorPalette.isHighContrast = true;
    second.updateView(view, 398, 298);
  });
  const first = page.locator("#tile"), second = page.locator("#second-tile");
  await first.locator(".cell").first().click();
  await expect(second.locator('.cell[aria-selected="true"]')).toHaveCount(0);
  await second.locator(".cell").nth(1).click();
  await expect(first.locator('.cell[aria-selected="true"]')).toHaveCount(1);
  await expect(second.locator('.cell[aria-selected="true"]')).toHaveCount(1);
  await expect(first.locator(".atlyn-capacity")).toHaveAttribute("dir", "ltr");
  await expect(second.locator(".atlyn-capacity")).toHaveAttribute("dir", "rtl");
  await expect(first.locator(".caption")).toContainText("hours");
  await expect(second.locator(".caption")).toContainText("FTE");
  await page.evaluate(() => {
    window.oldFirstCallback = window.capacityTest.captureCallback();
    window.capacityTest.destroy(); window.capacityTest.destroy();
    window.oldFirstCallback([]);
    window.capacityTest.externalSelect(["Resource 001|Week 02"]);
    window.capacityTest.resize(80, 80);
  });
  await expect(first.locator(".atlyn-capacity")).toHaveCount(0);
  await expect(second.locator(".atlyn-capacity")).toBeVisible();
  await expect(second.locator('.cell[aria-selected="true"]')).toHaveCount(1);
  await second.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(second.locator('.cell[aria-selected="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.capacityTest.events.registrations)).toBe(2);
});

for (const behavior of ["reject", "throw"]) {
  for (const operation of ["select", "clear", "context"]) {
    test(`mock ${operation} ${behavior} is recoverable without optimistic selection corruption`, async ({ page }) => {
      if (operation === "clear") await cellAt(page, 0, 0).click();
      await page.evaluate(({ operation, behavior }) => window.capacityTest.setBehavior(operation, behavior), { operation, behavior });
      if (operation === "select") await cellAt(page, 0, 1).click();
      if (operation === "clear") await page.getByRole("button", { name: "Clear selection", exact: true }).click();
      if (operation === "context") await cellAt(page, 0, 0).click({ button: "right" });
      await expect(page.locator(".status")).toContainText("Host interaction failed");
      await expect(selectedCells(page)).toHaveCount(operation === "clear" ? 1 : 0);
      await expect(page.getByRole("grid")).toBeVisible();
      expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
      await page.evaluate(operation => window.capacityTest.setBehavior(operation, undefined), operation);
      await cellAt(page, 0, 1).click();
      await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
    });
  }
}

test("synchronous tooltip and fetch failures surface locally and retain honest partial totals", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 1, partial: true });
    view.metadata.objects.analysis.additiveTotals = true;
    window.capacityTest.updateView(view);
    window.capacityTest.setBehavior("tooltip", "throw");
  });
  await cellAt(page, 0, 0).hover();
  await expect(page.locator(".status")).toContainText("Host interaction failed");
  await page.evaluate(() => window.capacityTest.setBehavior("fetch", "throw"));
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.locator(".status")).toContainText("PARTIAL");
  await expect(page.locator(".total")).toHaveText("Not defined");
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toBeEnabled();
});

test("late selection success and rejection cannot overwrite newer data or external bookmarks", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.setBehavior("select", "defer"));
  await cellAt(page, 0, 0).click();
  await expect(selectedCells(page)).toHaveCount(0);
  await page.evaluate(() => {
    window.capacityTest.render({ rows: 2, columns: 2 });
    window.capacityTest.settle();
  });
  await expect(selectedCells(page)).toHaveCount(0);
  await cellAt(page, 1, 0).click();
  await page.evaluate(() => {
    window.capacityTest.externalSelect(["Resource 001|Week 02"]);
    window.capacityTest.settle(0, true);
  });
  await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
  await expect.soft(page.locator(".status")).not.toContainText("Host interaction failed");
  await page.evaluate(() => window.capacityTest.externalInvalidSelection());
  await expect(page.locator(".status")).toContainText("Host interaction failed");
  await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
});

test("out-of-order selection responses and delayed clear preserve the latest mock callback", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.setBehavior("select", "defer"));
  await cellAt(page, 0, 0).click();
  await cellAt(page, 0, 1).click();
  await page.evaluate(() => window.capacityTest.settle(1));
  await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => window.capacityTest.settle(0));
  await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
  await expect(selectedCells(page)).toHaveCount(1);
  await page.evaluate(() => window.capacityTest.setBehavior("clear", "defer"));
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.evaluate(() => {
    window.capacityTest.externalSelect(["Resource 002|Week 02"]);
    window.capacityTest.settle();
  });
  await expect(cellAt(page, 1, 1)).toHaveAttribute("aria-selected", "true");
  await expect(selectedCells(page)).toHaveCount(1);
});

test("late context rejection from old data cannot contaminate a fresh render", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.setBehavior("context", "defer"));
  await cellAt(page, 0, 0).click({ button: "right" });
  await page.evaluate(() => {
    window.capacityTest.render({ rows: 2, columns: 2 });
    window.capacityTest.settle(0, true);
  });
  await expect(page.locator(".status")).not.toContainText("Host interaction failed");
});

test("destroy cancels pending work, stale callbacks, longpress and loading timeout", async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => {
    window.capacityTest.render({ partial: true });
    window.capacityTest.setBehavior("select", "defer");
  });
  await cellAt(page, 0, 0).click();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await cellAt(page, 0, 0).dispatchEvent("pointerdown", { pointerId: 21, pointerType: "touch", clientX: 180, clientY: 230 });
  const before = await page.evaluate(() => {
    window.oldCallback = window.capacityTest.captureCallback();
    const before = { starts: window.capacityTest.events.starts, finishes: window.capacityTest.events.finishes };
    window.capacityTest.destroy(); window.capacityTest.destroy();
    window.oldCallback([]);
    window.capacityTest.settle(0, true);
    window.capacityTest.render(); window.capacityTest.style(); window.capacityTest.resize(80, 80);
    return before;
  });
  await page.clock.runFor(16000);
  await expect(page.locator(".atlyn-capacity")).toHaveCount(0);
  expect(await mockCalls(page, "context")).toBe(0);
  expect(await page.evaluate(() => ({ starts: window.capacityTest.events.starts, finishes: window.capacityTest.events.finishes }))).toEqual(before);
});

test("render failures are reported once, clear old analysis and recover on a later update", async ({ page }) => {
  await page.getByRole("button", { name: "Cell details", exact: true }).click();
  const before = await page.evaluate(() => ({ starts: window.capacityTest.events.starts, finishes: window.capacityTest.events.finishes }));
  await page.evaluate(() => window.capacityTest.resize(Number.NaN, 500));
  await expect(page.locator(".status")).toHaveText("The visual could not render this data. Check field bindings and refresh.");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.locator(".inspector")).toBeHidden();
  await expect.soft(nextOverload(page)).toBeDisabled();
  await expect.soft(page.getByRole("button", { name: "Cell details", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => ({ starts: window.capacityTest.events.starts, finishes: window.capacityTest.events.finishes, failures: window.capacityTest.events.failures }))).toEqual({ starts: before.starts + 1, finishes: before.finishes, failures: ["Error"] });
  await page.evaluate(() => window.capacityTest.render({ rows: 1, columns: 1 }));
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".status")).toBeHidden();
  await expect(cellAt(page, 0, 0)).toHaveText("!45.0 / 40.0112.5%");
});

test("accepted partial loading remains pending through resize/Style, times out honestly, then finishes", async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => window.capacityTest.render({ rows: 1, columns: 1, partial: true }, 258, 198));
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("button", { name: "Loading more data...", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    window.capacityTest.resize(398, 298);
    window.capacityTest.style(398, 298);
  });
  await expect(page.getByRole("button", { name: "Loading more data...", exact: true })).toBeDisabled();
  await page.clock.runFor(15001);
  await expect(page.locator(".status")).toContainText("Still waiting for the host");
  await expect(page.locator(".status")).toContainText("PARTIAL");
  expect(await page.evaluate(() => window.capacityTest.events.fetches)).toEqual([true]);
  await page.evaluate(() => window.capacityTest.render({ rows: 1, columns: 2 }));
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  await expect(page.locator(".summary")).toContainText("2 delivered records");
  await page.clock.runFor(16000);
  await expect(page.locator(".status")).not.toContainText("Still waiting");
});

test("reduced and bounded deliveries cannot claim additive totals or continue unbounded fetching", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 1 });
    view.metadata.dataReduction = {};
    view.metadata.objects.analysis.additiveTotals = true;
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".status")).toContainText("Host reports data reduction");
  await expect(page.locator(".status")).toContainText("PARTIAL");
  await expect(page.locator(".total")).toHaveText("Not defined");
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.capacityTest.render({ rows: 200, columns: 51, partial: true }));
  await expect(page.locator(".cell")).toHaveCount(9996);
  await expect(page.locator(".status")).toContainText("Bound reached");
  await expect(page.locator(".status")).toContainText("PARTIAL");
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
});

test("malformed deliveries and incompatible settings never reuse an earlier valid grid", async ({ page }) => {
  for (const corruption of ["shape", "key", "order", "unit", "binding"]) {
    await page.evaluate(corruption => {
      const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
      if (corruption === "shape") view.categorical.values[0].values.pop();
      if (corruption === "key") view.categorical.categories[0].values[0] = " ";
      if (corruption === "order") view.categorical.values[2].values[1] = 0;
      if (corruption === "unit") view.metadata.objects.analysis.unit = "x".repeat(81);
      if (corruption === "binding") view.categorical.values[0].source.roles = {};
      window.capacityTest.updateView(view, 398, 298);
    }, corruption);
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(page.locator(".onboarding")).toBeVisible();
    await expect(page.locator(".status")).toBeVisible();
    await expect(page.locator(".summary")).toHaveText("Read-only capacity analysis");
    await expect(page.getByRole("button", { name: "Cell details", exact: true })).toBeDisabled();
    await expect(nextOverload(page)).toBeDisabled();
    await page.evaluate(() => window.capacityTest.render({ rows: 1, columns: 1 }));
    await expect(page.getByRole("grid")).toBeVisible();
  }
  expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
});

test("nonadditive metadata and numeric overflow suppress opt-in totals without changing supplied values", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
    view.metadata.objects.analysis.additiveTotals = true;
    view.categorical.values[1].source.discourageAggregationAcrossGroups = true;
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".total")).toHaveText("Not defined");
  await expect(page.locator(".status")).toContainText("nonadditive metadata");
  await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-label", /Allocated amount: 8.0.*Available capacity: 0.0/);
  await page.evaluate(() => {
    const view = window.capacityTest.getView();
    delete view.categorical.values[1].source.discourageAggregationAcrossGroups;
    view.categorical.values[0].values = [Number.MAX_VALUE, Number.MAX_VALUE];
    view.categorical.values[1].values = [Number.MAX_VALUE, Number.MAX_VALUE];
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".total")).toHaveText("Not defined");
  await expect(page.locator(".cell.state-full")).toHaveCount(2);
  await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-label", /Utilization: 100%/);
  expect((await page.locator(".cell").allTextContents()).join(" ")).not.toMatch(/Infinity|NaN/);
});

test("20,000 delivered records render only the 10,000-record budget with explicit partial scope", async ({ page }) => {
  const delivered = await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 200, columns: 100 });
    view.metadata.objects.analysis.additiveTotals = true;
    const before = window.capacityTest.events.identityBuilds.length;
    window.capacityTest.updateView(view, 1366, 768);
    return { records: view.categorical.values[0].values.length, identitiesBuilt: window.capacityTest.events.identityBuilds.length - before };
  });
  expect(delivered).toEqual({ records: 20000, identitiesBuilt: 10000 });
  await expect(page.locator(".cell")).toHaveCount(10000);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", "101");
  await expect(page.getByRole("grid")).toHaveAttribute("aria-colcount", "102");
  await expect(page.locator(".status")).toContainText("PARTIAL data: not all resource-period records are available");
  await expect(page.locator(".status")).toContainText("10,000 cells/source records maximum");
  await expect(page.locator(".summary")).toHaveAttribute("aria-label", /100 resources x 100 periods; 10000 loaded records/);
  await expect(page.locator(".total")).toHaveCount(100);
  expect(await page.locator(".total").allTextContents()).toEqual(Array(100).fill("Not defined"));
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  await cellAt(page, 0, 0).focus();
  await page.keyboard.press("Control+End");
  await expectFocus(page, 99, 99);
  await expect(cellAt(page, 99, 99)).toHaveAttribute("aria-label", /Resource: Resource 100.*Period: Week 100/);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.capacityTest.events.selections.at(-1))).toEqual(["Resource 100|Week 100"]);
  expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
});

test("16-digit safe integers retain exact supplied amounts and one-unit overloads despite rounded percentages", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
    view.categorical.values[0].values = [1234567890123456, Number.MAX_SAFE_INTEGER];
    view.categorical.values[1].values = [1234567890123455, Number.MAX_SAFE_INTEGER];
    view.categorical.values[0].source.format = "0";
    view.categorical.values[1].source.format = "0";
    window.capacityTest.updateView(view, 398, 298);
  });
  await expect(cellAt(page, 0, 0)).toHaveClass(/state-overload/);
  await expect(cellAt(page, 0, 0).locator(".amounts")).toHaveText("1234567890123456 / 1234567890123455");
  await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-label", /Allocated amount: 1234567890123456.*Available capacity: 1234567890123455.*Utilization: 100%.*Overload amount: 1/);
  await expect(cellAt(page, 0, 1)).toHaveClass(/state-full/);
  await expect(cellAt(page, 0, 1).locator(".amounts")).toHaveText("9007199254740991 / 9007199254740991");
  await cellAt(page, 0, 0).focus();
  expect(await page.evaluate(() => window.capacityTest.events.tooltips.at(-1).dataItems.filter(item => ["Allocated amount", "Available capacity", "Overload amount"].includes(item.displayName)))).toEqual([
    { displayName: "Allocated amount", value: "1234567890123456" },
    { displayName: "Available capacity", value: "1234567890123455" },
    { displayName: "Overload amount", value: "1" }
  ]);
  await page.getByRole("button", { name: "Cell details", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("Allocated amount1234567890123456Available capacity1234567890123455");
  await expectInside(page.locator(".inspector"), page.locator(".atlyn-capacity"));
});

test("excess numeric magnitudes, nonfinite values and numeric strings remain explicit invalid inputs", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 8 });
    view.categorical.values[0].values = [Number.MAX_VALUE, Number.MAX_VALUE, Infinity, -Infinity, NaN, "1234567890123456", null, 1e16];
    view.categorical.values[1].values = [1, Number.MIN_VALUE, 40, 40, 40, 40, 40, 1e16];
    view.metadata.objects.analysis.additiveTotals = true;
    window.capacityTest.updateView(view, 1366, 768);
  });
  await expect(page.locator(".cell.state-invalid")).toHaveCount(6);
  for (const index of [0, 1]) {
    await expect(cellAt(page, 0, index)).toHaveAttribute("aria-label", /Utilization: Not defined.*Overload amount: Not defined.*Numeric range exceeded/);
  }
  for (const index of [2, 3, 4, 5]) {
    await expect(cellAt(page, 0, index)).toHaveAttribute("aria-label", /Utilization: Not defined.*Amounts must be finite, nonnegative numbers or blank/);
  }
  await expect(cellAt(page, 0, 6)).toHaveClass(/state-missing/);
  await expect(cellAt(page, 0, 7)).toHaveClass(/state-full/);
  await expect(cellAt(page, 0, 7).locator(".ratio")).toHaveText("100%");
  await expect(page.locator(".total")).toHaveText("Not defined");
  await expect(page.locator(".summary")).toContainText("0 overloaded | 7 missing or invalid | 8 delivered records");
  expect((await page.locator(".ratio").allTextContents()).join(" ")).not.toMatch(/Infinity|NaN/);
  expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
});

test.describe("touch input (mock host services, real Edge pointer dispatch)", () => {
  test.use({ hasTouch: true });

  test("real touch taps select, toggle multiselect, deselect and supply touch tooltip metadata", async ({ page }) => {
    await page.evaluate(() => window.capacityTest.render({ rows: 2, columns: 4 }, 398, 298));
    await cellAt(page, 0, 0).tap();
    await expect(cellAt(page, 0, 0)).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => window.capacityTest.events.tooltips.at(-1).isTouchEvent)).toBe(true);
    await page.locator(".scroller").dispatchEvent("scroll");
    expect(await page.evaluate(() => window.capacityTest.events.hides.at(-1))).toEqual({ isTouchEvent: true, immediately: true });
    await page.getByRole("button", { name: "Toggle multi-select for touch or pointer", exact: true }).tap();
    await expect(page.locator(".multi-select")).toHaveAttribute("aria-pressed", "true");
    await cellAt(page, 0, 1).tap();
    await expect(selectedCells(page)).toHaveCount(2);
    await cellAt(page, 0, 0).tap();
    await expect(selectedCells(page)).toHaveCount(1);
    await expect(cellAt(page, 0, 1)).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Clear selection", exact: true }).tap();
    await expect(selectedCells(page)).toHaveCount(0);
    expect(await mockCalls(page, "context")).toBe(0);
  });

  test("empty space above and around the visual opens host context menu", async ({ page }) => {
    await page.evaluate(() => window.capacityTest.render({ rows: 2, columns: 4 }, 398, 298));
    await page.locator(".toolbar").click({ button: "right" });
    expect(await mockCalls(page, "context")).toBe(1);
    await page.locator(".caption").click({ button: "right" });
    expect(await mockCalls(page, "context")).toBe(2);
    // Onboarding / empty state context menu
    await page.evaluate(() => window.capacityTest.updateView({ metadata: { columns: [] }, categorical: {} }));
    await page.locator(".atlyn-capacity").click({ button: "right" });
    expect(await mockCalls(page, "context")).toBe(3);
  });

  test("real pointer right-click in reviewer blank zones and short-content whitespace opens context menu", async ({ page }) => {
    // Reviewer screenshot geometry: 3 rows x 5 periods in an oversized 1216x640 viewport
    await page.evaluate(() => window.capacityTest.render({ rows: 3, columns: 5 }, 1216, 640));
    const rootBox = await page.locator(".atlyn-capacity").boundingBox();
    expect(rootBox).not.toBeNull();
    expect([rootBox.width, rootBox.height]).toEqual([1216, 640]);

    const scrollerBox = await page.locator(".scroller").boundingBox();
    const tableBox = await page.locator("table").boundingBox();
    expect(scrollerBox).not.toBeNull();
    expect(tableBox).not.toBeNull();
    expect(tableBox.height).toBeLessThan(scrollerBox.height - 150);

    const toolbarBox = await page.locator(".toolbar").boundingBox();
    await page.mouse.click(toolbarBox.x + 100, toolbarBox.y + toolbarBox.height / 2, { button: "right" });
    expect(await mockCalls(page, "context")).toBe(1);
    expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1))).toMatchObject({ key: "", point: { x: toolbarBox.x + 100, y: toolbarBox.y + toolbarBox.height / 2 } });

    const legendBox = await page.locator(".legend").boundingBox();
    await page.mouse.click(legendBox.x + 150, legendBox.y + legendBox.height / 2, { button: "right" });
    expect(await mockCalls(page, "context")).toBe(2);
    expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1).key)).toBe("");

    const resourceHeader = page.locator("th.resource").first();
    const resourceBox = await resourceHeader.boundingBox();
    await page.mouse.click(resourceBox.x + resourceBox.width / 2, resourceBox.y + resourceBox.height / 2, { button: "right" });
    expect(await mockCalls(page, "context")).toBe(3);
    expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1).key)).toBe("");

    const cell = cellAt(page, 0, 1);
    const cellBox = await cell.boundingBox();
    const cellCenter = { x: Math.round(cellBox.x + cellBox.width / 2), y: Math.round(cellBox.y + cellBox.height / 2) };
    await page.mouse.click(cellCenter.x, cellCenter.y, { button: "right" });
    expect(await mockCalls(page, "context")).toBe(4);
    expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1))).toEqual({ key: "Resource 001|Week 02", point: cellCenter });

    const blankY = Math.round(tableBox.y + tableBox.height + 80);
    expect(blankY).toBeLessThan(scrollerBox.y + scrollerBox.height);
    await page.mouse.click(scrollerBox.x + 250, blankY, { button: "right" });
    expect(await mockCalls(page, "context")).toBe(5);
    expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1).key)).toBe("");

    const rightBlankX = Math.round(tableBox.x + tableBox.width + 100);
    expect(rightBlankX).toBeLessThan(scrollerBox.x + scrollerBox.width);
    await page.mouse.click(rightBlankX, tableBox.y + 50, { button: "right" });
    expect(await mockCalls(page, "context")).toBe(6);
    expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1).key)).toBe("");
  });

  test("longpress invokes one context menu and suppresses its compatibility click", async ({ page, context }) => {
    await page.evaluate(() => window.capacityTest.render({ rows: 2, columns: 4 }, 398, 298));
    const box = await cellAt(page, 0, 0).boundingBox();
    const session = await context.newCDPSession(page);
    const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await expect.poll(() => mockCalls(page, "context")).toBe(1);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(selectedCells(page)).toHaveCount(0);
    expect(await mockCalls(page, "select")).toBe(0);
    expect(await page.evaluate(() => window.capacityTest.events.contexts[0])).toEqual({ key: "Resource 001|Week 01", point });
    await page.waitForTimeout(850);
    await cellAt(page, 0, 0).tap();
    await expect(selectedCells(page)).toHaveCount(1);
    expect(await mockCalls(page, "context")).toBe(1);
    await session.detach();
  });

  test("real touch drag scrolls the tile and cancels the pending menu", async ({ page, context }) => {
    await page.evaluate(() => window.capacityTest.render({ rows: 30, columns: 4 }, 398, 298));
    const box = await cellAt(page, 1, 0).boundingBox();
    const session = await context.newCDPSession(page);
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (const distance of [20, 45, 70]) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - distance }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.locator(".scroller").evaluate(e => e.scrollTop)).toBeGreaterThan(0);
    await page.waitForTimeout(650);
    expect(await mockCalls(page, "context")).toBe(0);
    expect(await mockCalls(page, "select")).toBe(0);
    await expect(selectedCells(page)).toHaveCount(0);
    await session.detach();
  });

  for (const cancellation of ["pointerup", "pointercancel", "drag", "scroll", "update"]) {
    test(`${cancellation} cancels deterministic touch longpress without selection or menu`, async ({ page }) => {
      await page.clock.install();
      await page.evaluate(() => window.capacityTest.render({ rows: 10, columns: 4 }, 398, 298));
      const cell = cellAt(page, 0, 0);
      await cell.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: 150, clientY: 150 });
      if (cancellation === "pointerup" || cancellation === "pointercancel") await cell.dispatchEvent(cancellation, { pointerId: 7, pointerType: "touch" });
      if (cancellation === "drag") await cell.dispatchEvent("pointermove", { pointerId: 7, pointerType: "touch", clientX: 159, clientY: 150 });
      if (cancellation === "scroll") await page.locator(".scroller").dispatchEvent("scroll");
      if (cancellation === "update") await page.evaluate(() => window.capacityTest.render({ rows: 2, columns: 2 }));
      await page.clock.runFor(900);
      expect(await mockCalls(page, "context")).toBe(0);
      expect(await mockCalls(page, "select")).toBe(0);
      await expect(selectedCells(page)).toHaveCount(0);
    });
  }
});

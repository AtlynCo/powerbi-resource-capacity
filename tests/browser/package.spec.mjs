/* global window, document, getComputedStyle */
import { test, expect } from "@playwright/test";
import { readPackage } from "../../scripts/package-lib.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[role="grid"]')).toBeVisible();
});

test("compiled plugin renders authoritative amounts, exceptions and native interactions", async ({ page }) => {
  const first = page.locator(".cell").first();
  await expect(first).toHaveText("!45.0 / 40.0112.5%");
  await expect(page.locator(".cell").nth(1)).toHaveAttribute("aria-label", /Positive allocation against zero capacity/);
  await expect(page.locator(".cell").nth(2)).toHaveClass(/state-missing/);
  await expect(page.locator(".cell").nth(3)).toHaveClass(/state-unavailable/);
  await first.click();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await page.locator(".cell").nth(1).click({ modifiers: ["Control"] });
  expect(await page.evaluate(() => window.capacityTest.events.selections.at(-1))).toHaveLength(2);
  await first.click({ button: "right" });
  expect(await page.evaluate(() => window.capacityTest.events.contexts.at(-1).key)).toBe("Resource 001|Week 01");
  await first.hover();
  expect(await page.evaluate(() => window.capacityTest.events.tooltips.at(-1).dataItems.some(i => i.displayName === "Overload amount" && i.value === "5.0"))).toBe(true);
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(first).toHaveAttribute("aria-selected", "false");
  expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
  expect(await page.evaluate(() => window.capacityTest.events.finishes)).toBeGreaterThan(0);
});

test("grid navigation, sticky headers and scroll remain inside resized tile", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.render({ rows: 80, columns: 60 }, 640, 420));
  const cell = page.locator(".cell").first();
  await cell.focus();
  await page.keyboard.press("Control+End");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-row", "79");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-col", "59");
  const positions = await page.evaluate(() => {
    const s = document.querySelector(".scroller"), corner = document.querySelector(".corner");
    const a = s.getBoundingClientRect(), b = corner.getBoundingClientRect();
    return { top: Math.abs(a.top - b.top), left: Math.abs(a.left - b.left), scrollTop: s.scrollTop, scrollLeft: s.scrollLeft };
  });
  expect(positions.top).toBeLessThan(2); expect(positions.left).toBeLessThan(2);
  expect(positions.scrollTop).toBeGreaterThan(0); expect(positions.scrollLeft).toBeGreaterThan(0);
  await page.evaluate(() => window.capacityTest.resize(280, 180));
  const bounds = await page.locator(".atlyn-capacity").boundingBox();
  expect(bounds.width).toBe(280); expect(bounds.height).toBe(180);
  await expect(page.locator(".scroller")).toBeVisible();
  await page.keyboard.press("Control+Home");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-row", "0");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-col", "1");
  await page.keyboard.press("Space");
  await expect(page.locator(".cell:focus")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Shift+F10");
  expect(await page.evaluate(() => window.capacityTest.events.contexts.length)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".cell:focus")).toHaveAttribute("aria-selected", "false");
});

test("highlights, high contrast, RTL, external selection and modern formatting", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.capacityTest.host.colorPalette.isHighContrast = true;
    window.capacityTest.host.locale = "ar-SA";
    window.capacityTest.render({ rows: 3, columns: 5, highlights: true });
  });
  await expect(page.locator(".atlyn-capacity")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".cell").first()).toContainText("H ");
  await expect(page.locator(".cell").first()).not.toHaveClass(/dimmed/);
  await expect(page.locator(".cell").nth(1)).toHaveClass(/dimmed/);
  expect(await page.locator(".cell").first().evaluate(e => getComputedStyle(e).backgroundColor)).toBe("rgb(0, 0, 0)");
  expect(await page.locator(".cell").first().evaluate(e => getComputedStyle(e).color)).toBe("rgb(255, 255, 0)");
  await page.locator(".cell").first().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-col", "1");
  await page.evaluate(() => window.capacityTest.externalSelect(["Resource 002|Week 03"]));
  await expect(page.locator('[data-row="1"][data-col="2"]')).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.capacityTest.formatModel().cards.length)).toBe(2);
});

test("segmentation, host refusal, limits, missing unit and duplicate metadata are never success-shaped", async ({ page }) => {
  await page.evaluate(() => { window.capacityTest.setFetchAccepted(false); window.capacityTest.render({ partial: true }); });
  await expect(page.locator(".status")).toContainText("PARTIAL");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".status")).toContainText("Host refused");
  expect(await page.evaluate(() => window.capacityTest.events.fetches)).toEqual([true]);
  await page.evaluate(() => window.capacityTest.render({ rows: 201, columns: 1 }));
  await expect(page.locator(".status")).toContainText("Bound reached");
  expect(await page.locator(".cell").count()).toBe(200);
  await page.evaluate(() => window.capacityTest.render({ unit: "" }));
  await expect(page.locator(".status")).toContainText("Compatible unit");
  await expect(page.locator(".cell")).toHaveCount(0);
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
    view.categorical.categories[1].values[1] = view.categorical.categories[1].values[0];
    view.categorical.values[2].values[1] = 0;
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".state-duplicate")).toHaveCount(1);
  await expect(page.locator(".status")).toContainText("1 duplicate");
});

test("package is inert outside host services and safely renders hostile text", async ({ page }) => {
  const requests = [];
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:8793")) requests.push(request.url()); });
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 1 });
    view.categorical.categories[0].values[0] = '<img src="https://example.invalid/leak" onerror="alert(1)">';
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".resource")).toContainText("<img");
  await expect(page.locator("img")).toHaveCount(0);
  await page.evaluate(() => window.capacityTest.destroy());
  await expect(page.locator(".atlyn-capacity")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("opt-in totals are authoritative only for complete additive periods", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 1 });
    view.metadata.objects.analysis.additiveTotals = true;
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".total")).toHaveText("45.0 / 40.0");
  await page.evaluate(() => {
    const view = window.capacityTest.getView();
    view.metadata.segment = {};
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".total")).toHaveText("Not defined");
  await expect(page.locator(".status")).toContainText("PARTIAL");
  await page.evaluate(() => {
    window.capacityTest.setFetchAccepted(true);
  });
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("button", { name: "Loading more data..." })).toBeDisabled();
  await page.evaluate(() => {
    const view = window.capacityTest.getView();
    delete view.metadata.segment;
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".total")).toHaveText("45.0 / 40.0");
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("maximum Cartesian budget renders and refuses excess dimensions", async ({ page }) => {
  await page.evaluate(() => window.capacityTest.render({ rows: 200, columns: 50 }, 1200, 800));
  await expect(page.locator(".cell")).toHaveCount(10000);
  await expect(page.locator(".status")).toContainText("Bound reached");
  await page.locator(".cell").first().focus();
  await page.keyboard.press("Control+End");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-row", "199");
  await expect(page.locator(".cell:focus")).toHaveAttribute("data-col", "49");
  await page.evaluate(() => window.capacityTest.render({ rows: 2, columns: 105 }));
  await expect(page.locator(".status")).toContainText("PARTIAL");
  await expect(page.locator(".cell")).toHaveCount(208);
});

test("long model labels cannot expand pinned headers beyond a small tile", async ({ page }) => {
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 1 });
    view.categorical.categories[0].values[0] = "R".repeat(512);
    view.categorical.categories[1].values[0] = "P".repeat(512);
    window.capacityTest.updateView(view, 280, 180);
  });
  const header = await page.locator("thead").boundingBox();
  expect(header.height).toBeLessThan(60);
  await expect(page.locator(".cell")).toBeVisible();
  await expect(page.locator(".resource")).toHaveAttribute("title", "R".repeat(512));
});

test("compiled package handles native date axes and packaged French localization", async ({ page }) => {
  const { visual: packaged } = readPackage();
  await page.evaluate(strings => {
    const test = window.capacityTest;
    test.host.localizedStrings = strings;
    test.host.locale = "fr-FR";
    test.restart();
    const view = test.makeView({ rows: 1, columns: 2 });
    view.categorical.categories[1].values = [new Date(2026, 8, 10), new Date(2026, 8, 9)];
    view.categorical.categories[1].source.type = { dateTime: true };
    view.categorical.categories[1].source.format = "yyyy-MM-dd";
    test.updateView(view);
  }, packaged.stringResources["fr-FR"]);
  await expect(page.getByRole("button", { name: "Effacer la selection" })).toBeVisible();
  await expect(page.locator("thead th").nth(1)).toHaveText("2026-09-09");
  await expect(page.locator(".state-overload").first()).toHaveAttribute("aria-label", /Surcharge/);
  expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
});

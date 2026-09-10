/* global window, document, getComputedStyle */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readPackage } from "../../scripts/package-lib.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[role="grid"]')).toBeVisible();
});

test("key diagnostic shows compiled version and row/role/type only, without accepting invalid dates", async ({ page }) => {
  const { manifest } = readPackage();
  await page.evaluate(() => {
    const view = window.capacityTest.makeView({ rows: 1, columns: 2 });
    view.categorical.categories[0].values = ["PRIVATE_RESOURCE", "PRIVATE_RESOURCE"];
    view.categorical.categories[1].source.type = { dateTime: true };
    view.categorical.categories[1].values = [new Date(2026, 7, 3), "PRIVATE_DATE_VALUE"];
    window.capacityTest.updateView(view);
  });
  await expect(page.locator(".status")).toContainText(`Input diagnostic: visual ${manifest.visual.version}; row 2; role Period; type string; expected Date.`);
  await expect(page.locator(".status")).toContainText("Serialized date format: other; validity: invalid-or-unsupported.");
  await expect(page.locator(".atlyn-capacity")).not.toContainText("PRIVATE_");
  await expect(page.locator(".cell")).toHaveCount(0);
  await page.evaluate(() => window.capacityTest.resize(80, 80));
  await expect(page.locator(".tiny-summary")).toBeVisible();
  await expect(page.locator(".tiny-summary")).toHaveAttribute("aria-label", /row 2; role Period; type string; expected Date/);
});

for (const timezoneId of ["UTC", "America/New_York"]) {
  test.describe(`serialized native Periods in ${timezoneId}`, () => {
    test.use({ timezoneId, viewport: { width: 1366, height: 768 } });
    for (const sample of ["people-hours-by-week", "machine-hours-by-day"]) {
      for (const form of ["ISO-date", "ISO-datetime-no-zone", "ISO-datetimeZ", "ISO-datetime-offset"]) {
        test(`${sample} ${form} preserves model labels, amounts and original string identities`, async ({ page }, testInfo) => {
          const rows = readFileSync(`samples\\${sample}.csv`, "utf8").trim().split(/\r?\n/).slice(1).map(line => line.split(","));
          const result = await page.evaluate(({ rows, form }) => {
            const api = window.capacityTest, view = api.makeView({ rows: 1, columns: rows.length });
            const categories = view.categorical.categories;
            categories[0].values = rows.map(row => row[0]);
            categories[1].values = rows.map(row => form === "ISO-date" ? row[1] :
              form === "ISO-datetime-no-zone" ? `${row[1]}T00:00:00` :
                new Date(`${row[1]}T00:00:00`).toISOString().replace("Z", form === "ISO-datetime-offset" ? "+00:00" : "Z"));
            categories[1].source.type = { dateTime: true };
            categories[1].source.format = "yyyy-MM-dd";
            for (const category of categories) category.identity = category.values.map((_, index) => ({ key: `native-row-${index}` }));
            for (const [index, field] of [2, 3, 4, 5].entries()) view.categorical.values[index].values = rows.map(row => row[field] === "" ? null : Number(row[field]));
            const original = categories[1].values, before = [...original];
            api.updateView(view, 1280, 620);
            return {
              cells: document.querySelectorAll(".cell").length,
              status: document.querySelector(".status").textContent,
              untouched: original === api.getView().categorical.categories[1].values && original.every((value, index) => value === before[index]),
              selection: `${rows[1][0]}|${before[1]}`
            };
          }, { rows, form });
          expect(result.cells, result.status).toBe(rows.length);
          expect(result.untouched).toBe(true);
          await expect(page.locator("thead th").nth(1)).toHaveText(rows[0][1]);
          const cell = page.locator('.cell[data-row="0"][data-col="1"]');
          await expect(cell).toContainText(sample === "people-hours-by-week" ? "44.0 / 40.0" : "24.0 / 20.0");
          await cell.click();
          await expect(cell).toHaveAttribute("aria-selected", "true");
          expect(await page.evaluate(() => window.capacityTest.events.selections.at(-1))).toEqual([result.selection]);
          expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
          if (timezoneId === "UTC" && form === "ISO-datetimeZ") {
            await page.screenshot({ path: testInfo.outputPath(`${sample}-serialized-dates.png`) });
          }
        });
      }
    }
    if (timezoneId === "America/New_York") {
      test("rejects nonexistent local clock time without rolling into another period or exposing values", async ({ page }) => {
        await page.evaluate(() => {
          const view = window.capacityTest.makeView({ rows: 1, columns: 1 });
          view.categorical.categories[1].source.type = { dateTime: true };
          view.categorical.categories[1].values = ["2026-03-08T02:30:00"];
          window.capacityTest.updateView(view);
        });
        await expect(page.locator(".cell")).toHaveCount(0);
        await expect(page.locator(".status")).toContainText("ISO-datetime-no-zone; validity: invalid-or-unsupported");
        await expect(page.locator(".atlyn-capacity")).not.toContainText("2026-03-08");
      });
    }
  });
}

for (const [sample, rowCount, periodCount] of [["people-hours-by-week", 12, 4], ["machine-hours-by-day", 15, 5]]) {
  test(`cross-realm Dates render the exact ${sample} sample and retain host selections`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const rows = readFileSync(`samples\\${sample}.csv`, "utf8").trim().split(/\r?\n/).slice(1).map(line => line.split(","));
    const result = await page.evaluate(rows => {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      document.body.append(frame);
      const api = window.capacityTest, view = api.makeView({ rows: 1, columns: rows.length });
      const categories = view.categorical.categories;
      categories[0].values = rows.map(row => row[0]);
      categories[0].source.queryName = "NativeSample.Resource";
      categories[1].values = rows.map(row => new frame.contentWindow.Date(`${row[1]}T00:00:00`));
      categories[1].source.queryName = "NativeSample.Period";
      categories[1].source.type = { dateTime: true };
      categories[1].source.format = "yyyy-MM-dd";
      for (const category of categories) category.identity = category.values.map((_, index) => ({ key: `native-${category.source.queryName}-${index}` }));
      for (const [index, field] of [2, 3, 4, 5].entries()) view.categorical.values[index].values = rows.map(row => row[field] === "" ? null : Number(row[field]));
      const originalDate = categories[1].values[0], localInstance = originalDate instanceof Date;
      api.updateView(view, 1280, 620);
      return {
        localInstance, untouched: originalDate === api.getView().categorical.categories[1].values[0],
        cells: document.querySelectorAll(".cell").length, status: document.querySelector(".status").textContent
      };
    }, rows);
    expect(result.localInstance).toBe(false);
    expect(result.untouched).toBe(true);
    expect(result.cells, result.status).toBe(rowCount);
    await expect(page.locator("thead th:not(.corner)")).toHaveCount(periodCount);
    await expect(page.locator("thead th").nth(1)).toHaveText(rows[0][1]);
    await expect(page.locator(".resource").first()).toHaveText(rows[0][0]);
    const overloaded = page.locator(".cell.state-overload").first();
    await overloaded.click();
    await expect(overloaded).toHaveAttribute("aria-selected", "true");
    if (sample === "people-hours-by-week") await expect(overloaded).toContainText("44.0 / 40.0");
    const builds = await page.evaluate(() => window.capacityTest.events.identityBuilds.slice(-window.capacityTest.getView().categorical.categories[0].values.length));
    expect(builds[1]).toEqual([
      { queryName: "NativeSample.Resource", index: 1, identity: "native-NativeSample.Resource-1" },
      { queryName: "NativeSample.Period", index: 1, identity: "native-NativeSample.Period-1" }
    ]);
    expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${sample}-foreign-dates.png`) });
  });
}

test("compiled plugin renders authoritative amounts, exceptions and mocked host interactions", async ({ page }) => {
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
  await expect(page.locator(".cell.state-duplicate")).toHaveCount(1);
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
  await expect(page.locator(".cell.state-overload").first()).toHaveAttribute("aria-label", /Surcharge/);
  expect(await page.evaluate(() => window.capacityTest.events.failures)).toEqual([]);
});

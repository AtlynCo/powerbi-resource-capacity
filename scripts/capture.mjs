/* global window, document */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { startHarness } from "./serve-test.mjs";
import { readPackage } from "./package-lib.mjs";

const output = resolve(process.env.CAPACITY_CAPTURE_DIR ?? "dist\\screenshots");
mkdirSync(output, { recursive: true });
const temporary = resolve(".tmp", "browser-tmp");
mkdirSync(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".tmp", "browsers");
const { chromium } = await import("@playwright/test");
const server = startHarness();
await once(server, "listening");
const browser = await chromium.launch({ channel: process.env.CAPACITY_BROWSER_CHANNEL, headless: true });
const evidence = { packageSha256: createHash("sha256").update(readPackage().bytes).digest("hex"), browser: browser.version(), host: "local mock, NOT Power BI Desktop/service", captures: [] };
const describeFile = file => {
  const bytes = readFileSync(join(output, file));
  return { file: file.replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [width, height] of [[80, 80], [258, 198], [398, 298], [1280, 620], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:8793");
    await page.evaluate(({ width, height }) => window.capacityTest.render({ rows: 12, columns: 8, nonworking: true }, width, height), { width, height });
    await page.screenshot({ path: join(output, `capacity-${width}x${height}.png`) });
    evidence.captures.push({ ...describeFile(`capacity-${width}x${height}.png`), width, height, metrics: await page.evaluate(() => ({
      gridHeight: document.querySelector(".scroller").clientHeight,
      tinySummaryHeight: document.querySelector(".tiny-summary").clientHeight,
      mode: document.querySelector(".atlyn-capacity").classList.contains("tiny") ? "honest summary" : "interactive grid",
      bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight
    })) });
  }
  const listing = join(output, "listing");
  mkdirSync(listing, { recursive: true });
  evidence.listing = [];
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const sample of ["people-hours-by-week", "machine-hours-by-day"]) {
    const lines = readFileSync(join("samples", `${sample}.csv`), "utf8").trim().split(/\r?\n/);
    if (lines.some(line => line.includes('"'))) throw new Error("Screenshot fixture expects the sanitized, unquoted sample CSV schema");
    const rows = lines.slice(1).map(line => line.split(","));
    await page.evaluate(rows => {
      const api = window.capacityTest, view = api.makeView({ rows: 1, columns: rows.length, unit: "hours" });
      view.categorical.categories[0].values = rows.map(row => row[0]);
      view.categorical.categories[1].values = rows.map(row => new Date(`${row[1]}T00:00:00`));
      view.categorical.categories[1].source.type = { dateTime: true };
      view.categorical.categories[1].source.format = "yyyy-MM-dd";
      for (const [index, field] of [2, 3, 4, 5].entries()) view.categorical.values[index].values = rows.map(row => row[field] === "" ? null : Number(row[field]));
      const tooltip = {
        source: { displayName: "Assignments", queryName: "Sample.Assignments", roles: { tooltips: true }, format: "0", type: { numeric: true }, isMeasure: true },
        values: rows.map(row => Number(row[6]))
      };
      view.categorical.values.push(tooltip); view.metadata.columns.push(tooltip.source);
      api.updateView(view, 1366, 768);
    }, rows);
    const name = `${sample}-1366x768.png`;
    await page.screenshot({ path: join(listing, name) });
    evidence.listing.push({ ...describeFile(join("listing", name)), width: 1366, height: 768, sample, description: "Unaltered final-package browser capture using sanitized sample data; NOT a Power BI Desktop screenshot." });
    if (sample === "people-hours-by-week") {
      await page.locator(".cell.state-overload").first().focus();
      await page.getByRole("button", { name: "Cell details", exact: true }).click();
      await page.screenshot({ path: join(listing, "people-details-1366x768.png") });
      evidence.listing.push({ ...describeFile(join("listing", "people-details-1366x768.png")), width: 1366, height: 768, sample, description: "Final-package focused-cell inspector; local host mock, not native Desktop." });
      await page.getByRole("button", { name: "Close details", exact: true }).click();
    }
  }
  writeFileSync(join(output, "capture.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

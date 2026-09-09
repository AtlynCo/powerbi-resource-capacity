/* global window, document, requestAnimationFrame */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import os from "node:os";
import { startHarness } from "./serve-test.mjs";
import { readPackage } from "./package-lib.mjs";

const output = resolve(process.env.CAPACITY_BENCHMARK_DIR ?? "dist\\performance");
mkdirSync(output, { recursive: true });
const temporary = resolve(".tmp", "browser-tmp");
mkdirSync(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".tmp", "browsers");
const { chromium } = await import("@playwright/test");
const count = Number(process.env.CAPACITY_BENCHMARK_SAMPLES ?? 30);
if (!Number.isInteger(count) || count < 20 || count > 100) throw new Error("Use 20-100 benchmark samples");
const { bytes, visual } = readPackage();
const server = startHarness();
await once(server, "listening");
const browser = await chromium.launch({ channel: process.env.CAPACITY_BROWSER_CHANNEL, headless: true });
const evidence = {
  packageSha256: createHash("sha256").update(bytes).digest("hex"), version: visual.visual.version, timestamp: new Date().toISOString(),
  browser: browser.version(), node: process.version, platform: `${os.platform()} ${os.release()}`,
  cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30),
  samples: count, warmups: 5, viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
  host: "Local mock services; not Power BI Desktop/service", contention: "Shared machine; no CPU isolation. Background workload and GC affect tails. Re-run before comparing hardware or making a performance claim.",
  definitions: {
    renderCpu: "Synchronous visual.update on an already constructed host data view, including conversion, DOM and selection state.",
    renderFrame: "Same render start until two requestAnimationFrame callbacks; includes frame scheduling, not native host completion.",
    selectionCpu: "Cell click through host-mock Promise microtask, excluding subsequent frame scheduling.",
    selectionFrame: "Cell click until two animation frames, including scroll-to-focus and style update.",
    scrollFrame: "Programmatic two-axis scroll assignment until two animation frames; no claim about human input latency.",
    heap: "Chromium JSHeapUsedSize after CDP garbage collection; not whole-process/Power BI memory."
  }, cases: []
};
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1), samples: values };
};
try {
  const page = await browser.newPage({ viewport: evidence.viewport, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:8793");
  await page.evaluate(() => window.capacityTest.setInstrumentation(false));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  for (const [name, resources, periods] of [["typical", 40, 12], ["maximum", 200, 50]]) {
    const metrics = await page.evaluate(async ({ resources, periods, count }) => {
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const view = window.capacityTest.makeView({ rows: resources, columns: periods });
      const measurements = { renderCpu: [], renderFrame: [], selectionCpu: [], selectionFrame: [], scrollFrame: [] };
      for (let i = -5; i < count; i++) {
        const start = performance.now();
        window.capacityTest.updateView(view, 1366, 768);
        const cpu = performance.now() - start;
        await nextFrame();
        if (i >= 0) { measurements.renderCpu.push(cpu); measurements.renderFrame.push(performance.now() - start); }
        const cells = document.querySelectorAll(".cell");
        const selectionStart = performance.now();
        cells[(i + 5) % cells.length].click();
        await Promise.resolve();
        const selectionCpu = performance.now() - selectionStart;
        await nextFrame();
        if (i >= 0) { measurements.selectionCpu.push(selectionCpu); measurements.selectionFrame.push(performance.now() - selectionStart); }
        const scroller = document.querySelector(".scroller");
        const scrollStart = performance.now();
        scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * ((i + 5) % 5) / 4;
        scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) * ((i + 5) % 5) / 4;
        await nextFrame();
        if (i >= 0) measurements.scrollFrame.push(performance.now() - scrollStart);
      }
      return { measurements, cellCount: document.querySelectorAll(".cell").length };
    }, { resources, periods, count });
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = (await cdp.send("Performance.getMetrics")).metrics.find(metric => metric.name === "JSHeapUsedSize")?.value;
    const result = { name, resources, periods, deliveredRecords: resources * periods, cellCount: metrics.cellCount, heapBytesAfterGc: heap,
      timingMilliseconds: Object.fromEntries(Object.entries(metrics.measurements).map(([key, values]) => [key, distribution(values)])) };
    evidence.cases.push(result);
    console.log(JSON.stringify({ ...result, timingMilliseconds: Object.fromEntries(Object.entries(result.timingMilliseconds).map(([key, value]) => [key, { p50: value.p50, p95: value.p95, max: value.max }])) }));
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    await cdp.send("Tracing.start", { categories: "devtools.timeline,blink.user_timing", transferMode: "ReturnAsStream" });
    await page.evaluate(async ({ resources, periods }) => {
      window.capacityTest.updateView(window.capacityTest.makeView({ rows: resources, columns: periods }), 1366, 768);
      document.querySelector(".cell").click();
      await Promise.resolve();
      const scroller = document.querySelector(".scroller");
      scroller.scrollTop = scroller.scrollHeight; scroller.scrollLeft = scroller.scrollWidth;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { resources, periods });
    const { profile } = await cdp.send("Profiler.stop");
    writeFileSync(join(output, `${name}.cpuprofile`), JSON.stringify(profile));
    const tracingComplete = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    const { stream } = await tracingComplete;
    const chunks = [];
    let eof = false;
    while (!eof) {
      const next = await cdp.send("IO.read", { handle: stream });
      chunks.push(Buffer.from(next.data, next.base64Encoded ? "base64" : "utf8")); eof = next.eof;
    }
    await cdp.send("IO.close", { handle: stream });
    writeFileSync(join(output, `${name}.trace.json`), Buffer.concat(chunks));
    result.profiles = { cpu: `${name}.cpuprofile`, timeline: `${name}.trace.json`,
      scope: "Separate unmeasured render/select/scroll pass captured with Chromium DevTools Protocol; not native Power BI." };
  }
  writeFileSync(join(output, "benchmark.json"), JSON.stringify(evidence, null, 2) + "\n");
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

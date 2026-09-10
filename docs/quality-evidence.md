# Local quality evidence and performance method

The quality pass starts from merged `origin/main` (`115247c`) and produces candidate **1.0.1.0**, retaining GUID `AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2`. All work and execution stay in this worktree. GitHub Actions are disabled; no hosted CI is part of acceptance.

## Independent product corrections

The accounting oracle uses integer/BigInt comparisons independently of the visual's floating-point division. It exercises zero, large exact integers, unit scaling, partial-period/model-authoritative capacity, and an additive sum whose small contributions were previously lost. The production fix uses compensated summation; it still rejects nonfinite totals and does not make FTE/rates additive.

Date periods now ignore irrelevant blank label-order measures. Native selection-builder results without a real identity are not offered for report filtering. Distinct keys that collapse to the same formatted label produce a warning and remain inspectable by their raw values. Duplicate intersections discard arbitrary first-row nonworking/highlight metadata as well as amounts, tooltips and selection identity.

The visual now has delivered-context exception counts, next-overload navigation without filtering, full model-value details, touch multi-selection/long-press, and an honest tiny-tile summary. Selection promises cannot overwrite a later selection, bookmark callback or new data context. Style-only/palette updates, synchronous host failures, disabled interactions, and teardown are covered separately from accounting.

## Actual package, not a source-only preview

`scripts\serve-test.mjs` extracts JavaScript/CSS from the configured `.pbiviz`. Local Playwright tests, captures and measurements execute that plugin with explicitly mocked host services. The harness uses a restrictive CSP and no external assets. It does not prove real Desktop/service behavior.

The five required tile sizes are 80x80, 258x198, 398x298, 1280x620 and 1366x768. At 80x80 the intended output is a keyboard-focusable summary, not a zero-height matrix. The final capture manifest records dimensions, bytes, SHA-256 and package hash. Proposed listing images use sanitized people/machine data and are unaltered 1366x768 browser captures; they must not be described as Desktop screenshots.

Additional package checks exercise pinned headers at two-axis offsets, dense bounds, keyboard/focus/panels, host selection/highlighting, HC/RTL/reduced motion, touch, lifecycle and errors. Their exact names and outcomes are preserved in `local-evidence\browser.log`; unit and mock-host outcomes are in `unit.log`. No mock is relabeled as native evidence.

## Reproducible timing protocol

Run `npm run benchmark` after building the package, with the desired installed browser channel. Default: **30 measured samples and five warmups** for each case. `CAPACITY_BENCHMARK_SAMPLES` accepts 20-100.

| Case | Resources | Periods | Delivered records / Cartesian cells |
|---|---:|---:|---:|
| Typical | 40 | 12 | 480 |
| Maximum | 200 | 50 | 10,000 |

Viewport: 1366x768, device scale factor 1. Each iteration updates a preconstructed data view, selects a cell through the mock host Promise, and scrolls both axes through quarter-extent offsets. These operations are measured independently. The evidence includes every raw sample, p50/p95/max, package hash, browser/Node versions, CPU model/logical cores, OS, memory and post-GC Chromium JS heap.

- **Render CPU:** synchronous `visual.update`, including conversion, DOM and selection painting.
- **Render frame:** the same start through two animation-frame callbacks; not native-host completion.
- **Selection CPU:** click through the mock Promise microtask; not a real cross-report query.
- **Selection frame:** click through two frames, including focus scrolling.
- **Scroll frame:** programmatic two-axis movement through two frames; not human touch/input latency.
- **Heap:** Chromium JS heap after CDP GC, not total process or Power BI memory.

This is a shared Windows workstation with no CPU isolation. Background workload, thermal state, frame scheduling and GC affect tails. Frame measurements have a scheduling floor and cannot be interpreted as pure code costs. They do not establish cross-hardware performance or market leadership.

Separate unmeasured passes capture `<case>.cpuprofile` and `<case>.trace.json` through Chromium DevTools Protocol for each case. Load them in DevTools' JavaScript profiler and Performance panels for CPU/layout inspection. Profiling overhead is outside the published timing distributions. This supplies developer-tool evidence, not just printed elapsed times.

## Baseline retained before fixes

The original 1.0.0.0 package SHA-256 was `d69a50425548382802d6fb5119608e7478c0bd041c40a908447e96aae5965965`. Its source/package/screenshots/raw benchmark are retained under ignored `artifacts\baseline-v1.0.0.0`.

| Case / operation | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|
| Typical render CPU | 50.5 | 60.6 | 63.1 |
| Typical render frame | 83.3 | 100.0 | 100.8 |
| Typical selection CPU | 1.3 | 1.9 | 2.2 |
| Typical selection frame | 33.2 | 34.1 | 34.8 |
| Typical scroll frame | 33.0 | 34.2 | 34.3 |
| Maximum render CPU | 1282.2 | 1479.5 | 1581.4 |
| Maximum render frame | 1668.1 | 1996.4 | 2049.1 |
| Maximum selection CPU | 13.4 | 19.8 | 21.4 |
| Maximum selection frame | 79.3 | 103.5 | 106.0 |
| Maximum scroll frame | 82.1 | 118.1 | 118.6 |

Baseline post-GC JS heap: 3,803,064 bytes typical; 10,080,300 bytes maximum. Screenshot inspection found **zero grid height at 80x80** and excessive explanatory chrome at compact sizes. These were product findings, not merely failing selectors.

## Final evidence identity

Final local run on **2026-09-09**: **225 unit/host/sample tests and 55 actual-package Edge browser tests passed**; strict types, ESLint (including the official Power BI plugin), SDK certification audit, static package audit, and 14 sample JSON documents against 15 official schemas passed. Runtime and full npm audits reported zero vulnerabilities.

Package: **133,269 bytes**, SHA-256 `0f927e88f501a9351f4f5249dd93186bd768ba36fee8f188147e5fd9ec8e55c0`. API declaration 5.11.0, API package 5.11.1, SDK tools 7.2.1. Recorded machine: AMD EPYC 7763, **16 logical CPUs exposed**, 64 GiB RAM, Windows `10.0.26200`; Node 24.17.0, npm 11.13.0, PowerShell 7.6.6, Edge 152.0.4191.66. A processor model name containing “64-Core” does not mean this environment exposes 64 cores.

| Final case / operation | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|
| Typical render CPU | 33.5 | 44.3 | 50.6 |
| Typical render frame | 51.0 | 70.4 | 83.7 |
| Typical selection CPU | 0.9 | 1.9 | 1.9 |
| Typical selection frame | 33.3 | 34.5 | 35.2 |
| Typical scroll frame | 33.0 | 34.2 | 34.9 |
| Maximum render CPU | 596.5 | 828.4 | 896.4 |
| Maximum render frame | 741.1 | 1014.8 | 1105.2 |
| Maximum selection CPU | 4.1 | 5.2 | 6.1 |
| Maximum selection frame | 49.7 | 64.1 | 64.6 |
| Maximum scroll frame | 67.5 | 101.1 | 102.4 |

Final post-GC JS heap: 4,010,956 bytes typical; 10,841,564 bytes maximum. These are observed distributions, not universal latency guarantees or Microsoft pass thresholds. The dense-limit case still has a substantial redraw cost; narrower report filters remain appropriate.

Profiler inspection exposed a further layout defect: applying `border-style: dotted` to all sides introduced previously absent top/start borders when dimming cells. The fix changes only existing end/bottom borders, preserving geometry, and paints selection before restoring focus. A dedicated browser regression now checks unchanged cell dimensions/border widths. CPU/timeline traces are retained, including the earlier diagnostic pass under ignored `artifacts\profiled-intermediate-d575488f561e`.

Detailed mock call/identity-history instrumentation is disabled during measurements so the harness does not retain hundreds of thousands of diagnostic objects. The ordinary regression suite keeps it enabled. Baseline and final runs used the same dataset/protocol and machine but were not CPU-isolated; the fixture also gained this explicit instrumentation switch. Do not present their differences as a controlled cross-product benchmark.

The frozen `performance\benchmark.json` is authoritative for the final candidate's measured distribution, rather than a stale number copied from an intermediate build. `local-evidence\gates.json` records the command outcomes for those same package bytes. `build-inputs.json` fingerprints runtime, build, browser-test and sample inputs; `release:freeze` refuses a stale fingerprint.

Memory is structurally bounded by 200 resources, 104 periods, 10,000 Cartesian cells/source records, 512-character texts/keys and five tooltip fields. The benchmark's short-label heap is **not** a guarantee of identical heap for maximum-length tooltips or the host's own retained data. The package remains under the 4 MiB static budget. Actual native-host scalability and exports remain manual acceptance work.

## Subsequent sample-only preflight correction

The later shared Desktop preflight identified an indented TMDL table-reference
defect in Capacity's sample. The original model reproduced the official TOM
`InvalidLineType / ReferenceObject` error; root-level references correct it.
PBIR `definition\version.json` was already present. Sample validators now guard
both risks, with a separate installed-official-TOM deserialization command.
This does not change the historical gate results or sealed files above.
A distinct provisional sample retry uses the identical package bytes; it is
not native render proof or submission approval. See
[sample preflight](sample-binding.md#official-tom-preflight-and-the-provisional-retry).

## Owner-approved runtime model

On 2026-09-10 the owner approved existing Atlyn storefront subscriptions for
acquisition, with ungated visuals and free shared viewing. The current offline
renderer is intended; there is no pending licensing integration or paid-author
enforcement to implement. Do not add keys, signers, AAD, entitlement APIs,
feature gates, WebAccess or runtime licensing requests. The package/version and
all frozen evidence stay unchanged. Parent owns native PBIX/host acceptance,
final assets and final publication gates.

The owner's badge clarification on 2026-09-10 refers to Microsoft's official
**Power BI certified** badge, requested through Partner Center's **Request Power
BI certification** checkbox. It is not the IAP "additional purchase" label, and
there is no parent-supplied badge asset or placement task. No certification
request receipt or Microsoft grant is recorded here; native results are still
forthcoming. Do not add an in-visual badge or claim certification before
Microsoft grants it. This documentation correction changes no runtime or
historical evidence.

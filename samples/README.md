# Offline people and machine samples

**Fully bound Power BI project templates with an exact-package offline generator.** These files have not been opened, refreshed, or saved in Power BI Desktop. Static validation is not native acceptance, a verified `.pbix`, or product screenshots.

All resource labels and measurements are invented and sanitized. No real people, equipment inventory, project/customer records, credentials, or external data sources are included.

## Included files

- `people-hours-by-week.csv`: three fictional resources × four weekly periods = 12 rows.
- `machine-hours-by-day.csv`: three fictional machines × five daily periods = 15 rows.
- `AtlynResourceCapacity\AtlynResourceCapacity.pbip`: source template linking a TMDL semantic model and enhanced-PBIR report.
- Two fully bound Resource Capacity grid pages with hours, additive totals, period order, nonworking metadata, and two tooltip measures.
- Two retained native `tableEx` comparison pages, bound to the same source rows.
- `npm run sample:bind` produces the **package-bearing deliverable** under `dist\sample`: it extracts the exact configured compiled `.pbiviz` unchanged into `Report\CustomVisuals` and records package/file SHA-256 values. Compiled runtime resources are deliberately not committed with the templates.
- Two import-mode Power Query partitions using literal `#table` values. **Refresh does not read the CSV files** and does not require a path, gateway, credential, network source, or cloud semantic model.

The CSV files are convenient inspection/import sources; the embedded M rows contain the same data. If editing the samples, update both representations together.

## CSV schema

| Column | Type | Meaning |
|---|---|---|
| `Resource` | Text | Stable unique synthetic key/label |
| `Period` | ISO date | Exact week-start or day; no hierarchy |
| `Allocated` | Decimal number | Allocated hours in that exact period |
| `Capacity` | Nullable decimal number | Available hours; empty CSV field / M `null` means missing |
| `PeriodOrder` | Integer | Consistent ordinal per date, unique across dates |
| `Nonworking` | Integer 0/1 | Explicit upstream assertion |
| `Assignments` | Integer | Synthetic contextual count; not an extra grouping |

The unit for both scenarios is `hours`, but the people and machine data represent different resource types and stay in separate visuals. The sample model intentionally has two independent tables and no cross-scenario relationships.

## Generate and open in Desktop

Use a recent supported Power BI Desktop version with Power BI Project, TMDL, and enhanced PBIR support enabled where your version requires preview settings.

1. After the release owner builds the intended `.pbiviz`, run `npm run sample:bind`, then `node scripts\bind-samples.mjs --verify`. Copy the **generated** `dist\sample\AtlynResourceCapacity` folder to a short writable location, such as `C:\Reports\AtlynResourceCapacity`, and open `AtlynResourceCapacity.pbip`. Preserve the relative report/model folder structure. Do not open the unmaterialized source template as the deliverable.
2. Refresh. Each partition evaluates a literal M table; no external source should be requested. Confirm 12 People rows and 15 Machines rows.
3. Inspect the **People · capacity grid** and **Machines · capacity grid** pages and compare with **People · weekly hours** and **Machines · daily hours** native tables. The actual private visual is already embedded and all fields below are bound; no separate import or manual binding should be necessary.
4. Confirm **Compatible unit** is `hours`. Additive totals are explicitly enabled for these nonoverlapping sample periods; turn them off to compare behavior.
5. If Desktop reports incompatibility or cannot load the package, record a native gate failure. The serialization is grounded in official schemas and a real public imported-package example, but local checks cannot prove Desktop compatibility.
6. Save, close, reopen, and manually verify behavior. If a deliverable `.pbix` is required, use Desktop **Save As** after validation. This repository intentionally supplies no fabricated binary report.

Generator layout, pinned serialization evidence, optional official-schema checks,
and release handoff are documented in `docs\sample-binding.md` (included beside
this README in the generated sample, or at the repository's `docs` root).

| Visual field well | People table | Machines table |
|---|---|---|
| Resource (stable key) | `People[Resource]` | `Machines[Resource]` |
| Period | `People[Period]` (Date, not hierarchy) | `Machines[Period]` (Date, not hierarchy) |
| Allocated amount | `[Allocated hours]` | `[Machine allocated hours]` |
| Available capacity | `[Available hours]` | `[Machine available hours]` |
| Period order (optional) | `[Period order]` | `[Machine period order]` |
| Nonworking (0/1, optional) | `[Nonworking flag]` | `[Machine nonworking flag]` |
| Tooltip measures | `[Assignment count]`, `[Source rows]` | `[Machine assignment count]`, `[Machine source rows]` |

Measure names are unique across the semantic model; machine measures have an explicit prefix. Numeric source columns are hidden to encourage use of the guarded measures. The source-row measures are diagnostic counts; every leaf cell should be one.

## Expected checks from the source values

These are arithmetic/data expectations, **not recorded Desktop test results**.

### People-hours by week

| Intersection | Expected meaning |
|---|---|
| P01 Planner A · 2026-08-03 | 32 allocated / 40 available: normal |
| P01 Planner A · 2026-08-10 | 44 / 40: overload by 4 hours |
| P01 Planner A · 2026-08-17 | 0 / 0, nonworking = 1: nonworking, undefined utilization |
| P02 Planner B · 2026-08-03 | 40 / 40: fully allocated, not overloaded |
| P02 Planner B · 2026-08-17 | 8 / 0, nonworking = 1: overload with nonworking metadata retained |
| P02 Planner B · 2026-08-24 | 0 / 40: normal, zero utilization |
| P03 Analyst C · 2026-08-24 | 12 / missing capacity: missing, not zero or an overload conclusion |

The deliberately missing capacity suppresses P03's total. With additive totals explicitly enabled and complete host delivery, P01 and P02 can still show valid row totals of **112 / 120** and **72 / 112** hours. Do not "fix" P03 by coercing the blank to zero. A weekly period marked nonworking is explicitly supplied sample metadata, not a calendar inference.

### Machine-hours by day

| Intersection | Expected meaning |
|---|---|
| M01 Mill A · 2026-08-04 | 24 / 20: overload by 4 hours |
| M01 Mill A · 2026-08-05 | 0 / 0, nonworking = 1: declared shutdown |
| M01 Mill A · 2026-08-06 | 4 / 0, nonworking = 1: allocation during shutdown, overload |
| M02 Lathe B · 2026-08-06 | 0 / 20: observed zero allocation |
| M02 Lathe B · 2026-08-07 | 0 / 0, nonworking = 0: unavailable, not inferred nonworking |
| M03 Press C · 2026-08-04 | 18 / 16: overload by 2 hours |

This small machine grid is complete and its nonoverlapping daily hours are additive. After checking the values and enabling the totals assertion, expected row amounts are M01 **54 / 60**, M02 **50 / 76**, and M03 **56 / 80** hours. These totals do not erase individual overloaded days.

## Model safeguards and limitations

The TMDL primary measures require `COUNTROWS(table) = 1` before returning a leaf amount. `SELECTEDVALUE` alone is not enough: two identical source rows still have one distinct value. Broader native-table subtotal contexts may therefore show blank primary measures; this is intentional, not a request to sum capacity on arbitrary task rows.

The model is deliberately small and flat. It is not a production staffing system, task assignment model, working calendar, Gantt bridge, or benchmark dataset. It does not exercise segmented fetching or maximum-size behavior; use the repository tests and real-host acceptance cases for those.

Both Resource Capacity pages use the actual stable visual GUID and resolve every role to their own model table. The private package is registered through PBIR `resourcePackages` and extracted unchanged by the generator. There is no Gantt dependency, remote dataset connection, pre-rendered screenshot, or model cache substituted for the actual visual.

For a fallback if your Desktop cannot open the project source, import either CSV as local data, explicitly set Period to Date and numeric columns to numeric types, recreate the guarded measures from [modeling](../docs/modeling.md), and bind a new report. That fallback uses a local file source; the provided PBIP itself remains self-contained.

Complete the repository's `docs\submission-checklist.md` before sharing the sample as a validated product report.

## Validation performed during source creation

- The optional `node scripts\bind-samples.mjs --validate-schemas` validates all 14 PBIP/PBIR/PBISM JSON files against their referenced official Microsoft JSON schemas. The generated manifest distinguishes `passed` from offline `not-run`; it is the evidence for a particular output.
- The local report/model paths, page names, and projected table/column/measure references were checked.
- Measure names are globally unique, including the prefixed machine measures; automated regressions check their PBIR references.
- All 27 CSV rows exactly matched the embedded M literals; resource-period uniqueness, dense grid dimensions, numeric ranges, 0/1 flags, and order consistency were checked.
- The intentional missing People capacity and the three machine row totals above were checked.
- The literal partitions were inspected for external refresh sources.
- The generated custom visual metadata, compiled JavaScript/CSS, icon, and localization resources are byte-identical to the selected package entries. `--verify` detects stale package hashes, changed output files, and missing or extra embedded resources.

These JSON/reference checks do **not** execute M or DAX, deserialize TMDL with the Desktop engine, open/save the report, render native visuals, or validate service refresh/export. Those remain manual acceptance work.

The subsequent shared native preflight found indented `ref table` declarations
in Capacity's original `model.tmdl`. They are now top-level; official Microsoft
TOM 19.117.0 deserializes the corrected model. The PBIR `version.json` was already
present. Explicit validator/regression guards now cover both risks. The separate
`scripts\validate-sample-tom.ps1` is parser preflight, **not** Desktop render,
refresh, save or reopen proof. See `docs\sample-binding.md`. The sealed quality
bundle remains unchanged; the corrected sample is supplied only as a distinct
provisional retry with the identical rendering package.

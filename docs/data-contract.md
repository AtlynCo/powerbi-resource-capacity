# Data contract — first release

## Grain and identity

The visual accepts a categorical data view with exactly two grouping roles: `resource` and `period`. `allocated` and `capacity` are required measures. `periodOrder` and `nonworking` are optional numeric measures; `tooltips` accepts up to five measures.

A resource label must identify one resource permanently within the report's model. If two people share a display name, bind a composite key/label such as `P01 · Planner A`. Renaming or reusing keys affects filtering. Tooltip measures cannot add a second resource key or another grouping grain.

The expected delivered grain is **one row per resource-period**. Duplicate delivered intersections are invalid even if identical. The visual never adds duplicates, averages them, or takes an arbitrary winner. Do not rely on this check to detect raw-model duplication: host aggregation can collapse duplicated model rows before delivery.

## Unit and measurement basis

The formatting property `analysis.unit` is required for meaningful analysis. Its empty default blocks analysis; after trimming, the entry must contain 1–80 characters. Whitespace-only or overlong entries block analysis. The author must assert that both measures use the same compatible unit and measurement basis.

- Hours must represent the same period boundaries and the same treatment of breaks, overtime, holidays, and leave.
- Minutes and hours must be converted in the model; labels and format strings cannot convert values.
- Different currencies, capacity types, FTE bases, or nominal versus effective production hours must not be mixed.
- Numeric roles need numbers, not strings with unit suffixes. Configure the semantic model's format strings for presentation.
- A tooltip's unit can differ because it is context, not input to the allocation/capacity calculation. Give it an unambiguous measure name and format.

The visual cannot infer the unit from column names, validate a capacity calendar, or inspect hidden model facts.

## Cell states

Both primary measures must be finite, nonnegative numbers to support analysis.
If the derived utilization exceeds the finite numeric range, the cell is invalid rather than showing an infinite percentage.

| Allocation | Capacity | Result |
|---:|---:|---|
| 0 | Positive | Normal, zero utilization |
| Positive, less than capacity | Positive | Normal, remaining capacity |
| Equal to capacity | Positive | Normal, fully allocated; equality is not overload |
| Greater than capacity | Positive | Overload; excess is allocation minus capacity |
| Positive | 0 | Overload; excess remains meaningful, utilization is undefined |
| 0 | 0 | Nonworking when supplied as such; otherwise unavailable |
| Missing | Any | Missing, not an observed zero |
| Any | Missing | Missing, not an observed zero |
| Negative/nonfinite/invalid | Any, or the reverse | Invalid |

An absent intersection differs from an explicit pair of zero measures. The visual does not invent absent resource or period members: its resource and period axes come from delivered data. Even a dense delivered grid cannot prove that a report filter or model query omitted nothing outside that data view.

### Supplied nonworking metadata

If bound, `nonworking` is a numeric measure accepting `0` or `1`; a missing flag conveys no assertion. Other supplied values are invalid. `1` means the model explicitly marks that resource-period nonworking. It is not inferred from zero capacity, a weekday name, or a date.

The flag is retained and shown even with nonzero allocation or capacity. For example, two allocated hours during a declared shutdown with zero capacity are still an overload, with the nonworking metadata visible. The flag never overwrites the supplied amounts.

## Period order

1. Date periods are chronological, using the dates supplied by the model. Select the actual Date column, not an automatic date hierarchy. Prepare week/month start dates upstream; the visual does not group daily values into a week.
2. Label periods with a bound `periodOrder` measure require a finite numeric value consistently associated with each label and a unique value across different labels. Use a measure such as `SELECTEDVALUE('Period'[SortIndex])`, not an extra grouping column. Missing or invalid explicit order cannot be repaired by guessing.
3. Labels without explicit order retain first-seen host/model order. Configure model **Sort by column** when needed and verify the host's delivered sort. Do not expect alphabetical, fiscal, or natural-language date inference.

Conflicting order is a global analysis error, not merely a warning attached to one cell. For example, `Week A → 1` and `Week B → 1`, or two values of order for `Week A`, cannot define an unambiguous sequence. Keep date and label representations consistent; do not mix types within a period field.

### Native serialized Date values

For a Period column explicitly declared `dateTime` by the host, the adapter
accepts genuine Date objects (including other JavaScript realms) and strictly
validated ISO strings. This accommodates native serialization without changing
the model's Date column, its values or selection identities. Text-typed periods
are never parsed as dates.

Supported strings have a four-digit year and either `YYYY-MM-DD` or
`YYYY-MM-DDTHH:mm:ss`, optionally with fractional seconds and `Z` or an explicit
`+HH:mm`/`-HH:mm` offset. Calendar days, leap years, clock fields and offsets are
validated, not rolled into another period. Offsets cannot exceed 14:00.
Fractions may contain up to seven digits but must be exactly representable in
milliseconds: nonzero digits beyond the third are rejected, not rounded.

`Z` and offset forms preserve the supplied instant and use the same SDK
formatting as a Date with that timestamp. Date-only and zone-free datetime forms
retain local calendar fields, matching ordinary host Date construction; local
DST gaps that would roll the clock/date are rejected. Use a zone-qualified form
when an exact instant is required. No workday or availability assumptions follow
from this date normalization.

Locale-dependent dates, epoch strings/numbers, whitespace, missing fields and
unrecognized formats remain invalid. A rejected serialized Date includes only
a format enum and validity classification in its bounded diagnostic, not the
input value. Original host values/identities and raw successful ISO labels stay
intact; normalized timestamps drive ordering and duplicate detection.

## Bounded host data

All bounds apply at the same time:

| Bound | Maximum |
|---|---:|
| Resources | 200 |
| Periods | 104 |
| Resource × period Cartesian grid | 10,000 cells |
| Source rows consumed | 10,000 |
| Requested categorical delivery window | 1,000 rows |
| Resource/period key, formatted value, or tooltip text | 512 characters |
| Optional tooltip measures | 5 |

Examples: 100 resources × 100 periods fits the grid bound; 200 × 104 does not. A sparse 200 × 104 dataset is still too large because its Cartesian grid exceeds the bound.

**Load more** requests a continuation from Power BI only when allowed and while within the visual's bounds. The host call uses `fetchMoreData(true)` (`aggregateSegments: true`); the host returns accumulated segments. The visual is not a downloader for the entire semantic model and does not bypass host memory limits or tenant policies.

Until the host has delivered all eligible data, or when a bound causes records/dimensions to be omitted, the result is partial. At exactly 10,000 delivered records, the bound notice is visible and fetching stops; that does not itself imply omission if the host reports no continuation or reduction. A rejected fetch is not proof of completeness. Narrow report filters or the horizon instead of treating a loaded subset as complete.

Overlong resource/period keys or source format strings block analysis. Formatted values and tooltip text are capped at 512 characters; headers and cell labels can be visually ellipsized to fit, with the retained text available through accessible labels/tooltips. The visual retains no accumulated raw data-view cache: source-record, dimension, Cartesian-cell, tooltip-count and string bounds constrain its own retained data and DOM. Power BI's delivery buffer and the browser's total heap remain host-controlled.

Report-level Top N filters, query reduction, model omissions, or an upstream aggregation can hide data without enough evidence for the visual to reconstruct it. Review filter context and the model as well as the visual's warnings.

## Totals are an explicit assertion

`analysis.additiveTotals` defaults to `false`. Turn it on only when all of the following hold:

- Allocation and capacity genuinely add across the displayed, nonoverlapping periods.
- The periods share a compatible measurement basis; they are not snapshots, averages, rates, percentages, or overlapping windows.
- The host data is not segmented, reduced or locally truncated.
- For each resource total, every displayed period for that resource is present and valid; duplicate, missing or invalid cells are not silently excluded.

Row totals display additive allocated/capacity amounts, not displayed percentages or an average utilization. Valid resources can have totals even when a different resource has a missing or invalid cell. A missing period on a resource suppresses that resource's total; a host-level partial/reduced/truncated result suppresses all totals. No overall grid total or total-utilization label is rendered.

If either bound primary measure's host metadata discourages aggregation across groups, totals remain unavailable even when the author toggle is on. That additional safeguard does not replace the author's responsibility to establish additive period semantics.

Totals are unavailable when these completeness/validity requirements fail; do not interpret an unavailable total as zero. A valid zero/zero unavailable or nonworking cell is not the same as missing data. The author assertion remains necessary even for a perfectly dense grid; the visual cannot establish business additivity from a number format.

## Read-only boundary

Selections use native host identities for the chosen resource and period. Power BI and report configuration decide how other visuals respond. Highlighting does not authorize changing the capacity denominator, and selection does not change the underlying measures.

No assignment editing, schedule generation, dependency calculation, writeback, holiday inference, or external refresh source is implemented by this visual.

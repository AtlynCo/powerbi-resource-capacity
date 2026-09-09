# Model allocation and capacity safely

The visual compares prepared measurements. Model calendar rules, working patterns, absences, shutdowns, and task-to-period allocation before binding the visual.

## Preferred model: separate facts, shared dimensions

Use:

- `Resource`: one row per stable resource key; expose a unique key/label for grouping.
- `Period`: one row per exact planning period, with a Date or label and a stable sort index.
- `AllocationFact`: task allocations at resource-period-task grain, containing only allocation amounts.
- `CapacityFact`: **exactly one row per resource-period**, containing available hours and optional explicit nonworking metadata.

Use one-to-many, single-direction relationships from each dimension into both facts. Do not join capacity into every task row and then sum the repeated value. Avoid unreviewed bidirectional or many-to-many relationships.

For example, three tasks with 8, 10, and 12 allocated hours total 30 hours. If each task row also carries the same 40-hour weekly capacity, `SUM(Task[Capacity])` incorrectly reports 120 hours. The visual sees one aggregated 30/120 cell and **cannot diagnose that multiplication**.

An integrity check belongs before aggregation:

```dax
Capacity rows =
COUNTROWS ( 'CapacityFact' )

Available hours =
VAR AtCell =
    HASONEVALUE ( 'Resource'[ResourceKey] )
        && HASONEVALUE ( 'Period'[PeriodKey] )
VAR RowsAtCell = COUNTROWS ( 'CapacityFact' )
RETURN
    IF (
        AtCell && RowsAtCell = 1,
        SELECTEDVALUE ( 'CapacityFact'[AvailableHours] ),
        BLANK ()
    )

Allocated hours =
VAR AtCell =
    HASONEVALUE ( 'Resource'[ResourceKey] )
        && HASONEVALUE ( 'Period'[PeriodKey] )
VAR RowsAtCell = COUNTROWS ( 'AllocationFact' )
RETURN
    IF (
        AtCell && RowsAtCell > 0,
        SUM ( 'AllocationFact'[AllocatedHours] ),
        BLANK ()
    )

Period order =
SELECTEDVALUE ( 'Period'[SortIndex] )

Nonworking flag =
IF (
    HASONEVALUE ( 'Resource'[ResourceKey] )
        && HASONEVALUE ( 'Period'[PeriodKey] )
        && COUNTROWS ( 'CapacityFact' ) = 1,
    SELECTEDVALUE ( 'CapacityFact'[Nonworking] ),
    BLANK ()
)
```

These examples assume the relationships above and must be adapted and tested against your own schema. Validate source numeric types, finite/nonnegative values, allocation records, and resource-period uniqueness before loading. A DAX measure must not silently repair corrupt source data.

`COUNTROWS = 1` is deliberate: `SELECTEDVALUE` by itself returns a value for two identical duplicate rows. `MAX` or `MIN` capacity also hides duplicates unless uniqueness was independently proven. Bind **Capacity rows** as a diagnostic tooltip, or place it in a native table, and investigate any cell other than one. A blank guarded capacity intentionally prevents a fabricated availability value.

These cell measures return blank in broader contexts; that is expected. If another visual needs a model total, write and validate a separate total measure that iterates unique resource-period keys. Do not weaken the cell safeguards just to populate a native table's grand total.

## A pre-aggregated table is also valid

The offline samples use a simpler `ResourcePeriod`-style table already at one resource-period row. With that table, guard **both** primary measures:

```dax
Allocated hours =
IF (
    COUNTROWS ( 'ResourcePeriod' ) = 1,
    SELECTEDVALUE ( 'ResourcePeriod'[Allocated] ),
    BLANK ()
)

Available hours =
IF (
    COUNTROWS ( 'ResourcePeriod' ) = 1,
    SELECTEDVALUE ( 'ResourcePeriod'[Capacity] ),
    BLANK ()
)
```

The bound grouping fields must come from the same table or from related dimensions that correctly filter it. A resource-period uniqueness test is still required at refresh. The sample TMDL contains this guarded-measure pattern.

## Missing is not zero

Do not blanket-wrap all measures in `COALESCE(..., 0)`. An absent capacity record is unknown availability, not a shutdown. An absent allocation record may mean no work, late data, or an excluded task; the model owner must decide.

If the business definition says that an observed, in-scope period with no assignments has zero allocation, materialize a complete resource-period scaffold and set allocation to zero **only for those known cases**. Keep genuinely unknown values blank. Prove the source coverage rather than relying on “Show items with no data” to establish completeness.

## Calendars belong upstream

Compute net availability for each resource-period after accounting for its calendar, employment fraction, breaks, holidays, planned leave, and maintenance as appropriate. Different resource calendars must not be replaced with a visual-wide “eight hours every weekday” assumption.

If a task crosses periods, split or weight its hours into the corresponding resource-period buckets upstream. The visual consumes those amounts; it does not prorate task start/end timestamps or infer overlapping assignments.

Use explicit Date values for period boundaries. Daily Date values remain daily; to analyze weeks, prepare a weekly fact with consistent week-start dates. A label such as `FY27 P01` needs a model sort column or a valid numeric period-order measure.

## Compatible amounts, not merely similar labels

Safe examples:

- People: allocated person-hours versus net available person-hours for the same week.
- Equipment: allocated machine-hours versus available machine-hours for the same day.
- FTE: comparable allocated and available FTE within each period, with totals disabled.

Unsafe examples:

- Allocated minutes versus available hours, without model conversion.
- Headcount versus person-hours.
- Dollars in different currencies.
- Allocation for a calendar week versus capacity for a rolling seven-day window.
- A sum of weekly FTE averages or a sum of utilization percentages presented as capacity.

Hours for nonoverlapping periods can be additive even if periods have different lengths, provided both amounts are prepared for those exact periods. Turning on `analysis.additiveTotals` is the report author's assertion of this property.

## Pairing with Gantt or Calendar Slicer

Use shared resource and period dimensions to connect prepared capacity facts to a task model. Native selections will only filter Gantt correctly if its bound data actually responds to those relationships and report interactions.

A task's start date alone is not a resource-period allocation bridge. Tasks spanning weeks need a reviewed bridge/allocation fact and filter strategy; do not invent a broad bidirectional relationship as a shortcut. Selecting a capacity cell does not reschedule the task.

The included offline source contains no Gantt binary or fabricated task integration. Complete the **real Atlyn Gantt** checks in the [submission checklist](submission-checklist.md) with an actual approved Gantt build before claiming interoperability.

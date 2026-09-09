import { describe, expect, it } from "vitest";
import { account, buildModel, cellKey, LIMITS, resourceTotal } from "../src/model";
import { makeRow, makeSelectionId } from "./fixtures";

describe("account", () => {
  it.each([
    { allocated: 5, capacity: 10, state: "available", utilization: 0.5, overload: 0 },
    { allocated: 10, capacity: 10, state: "full", utilization: 1, overload: 0 },
    { allocated: 15, capacity: 10, state: "overload", utilization: 1.5, overload: 5 },
    { allocated: 0, capacity: 10, state: "available", utilization: 0, overload: 0 },
    { allocated: 4, capacity: 0, state: "overload", utilization: null, overload: 4 },
    { allocated: 0, capacity: 0, state: "unavailable", utilization: null, overload: 0 }
  ])("accounts $allocated allocated / $capacity capacity as $state", expected => {
    expect(account(expected.allocated, expected.capacity)).toEqual(expected);
  });

  it("never invents utilization when capacity is zero, even on a nonworking day", () => {
    expect(account(5, 0, 1)).toEqual({
      allocated: 5, capacity: 0, state: "overload", utilization: null, overload: 5
    });
    expect(account(0, 0, 1)).toEqual({
      allocated: 0, capacity: 0, state: "nonworking", utilization: null, overload: 0
    });
  });

  it.each([undefined, null, 0])("does not infer nonworking from zero capacity with flag %s", flag => {
    expect(account(0, 0, flag).state).toBe("unavailable");
  });

  it.each([0, 5, 10, 15])("retains positive capacity with a nonworking flag and allocation %s", allocated => {
    expect(account(allocated, 10, 1)).toEqual(account(allocated, 10, 0));
  });

  it.each([
    [null, 10], [undefined, 10], [0, null], [0, undefined], [null, null], [undefined, undefined]
  ])("distinguishes absent measures (%s / %s) from numeric zero", (allocated, capacity) => {
    expect(account(allocated, capacity)).toEqual({
      state: "missing", allocated: allocated ?? null, capacity: capacity ?? null, utilization: null, overload: null
    });
  });

  it.each([-1, "0", "5", "", true, false, NaN, Infinity, -Infinity, {}, []])(
    "rejects invalid allocation or capacity %j without coercion", value => {
      expect(account(value, 10)).toMatchObject({ state: "invalid", issue: "invalidValue", utilization: null, overload: null });
      expect(account(10, value)).toMatchObject({ state: "invalid", issue: "invalidValue", utilization: null, overload: null });
    }
  );

  it.each([-1, 2, 0.5, "0", "1", true, false, NaN, Infinity])("rejects nonworking flag %j", flag => {
    expect(account(0, 0, flag)).toMatchObject({ state: "invalid", issue: "invalidNonworking" });
    expect(account(1, 10, flag)).toMatchObject({ state: "invalid", issue: "invalidNonworking" });
  });

  it("validates supplied values and flags even when another measure is missing", () => {
    expect(account(-1, null)).toMatchObject({ state: "invalid", issue: "invalidValue" });
    expect(account(null, "10")).toMatchObject({ state: "invalid", issue: "invalidValue" });
    expect(account(null, 10, 2)).toMatchObject({ state: "invalid", issue: "invalidNonworking" });
  });

  it.each([
    [Number.MAX_VALUE, Number.MIN_VALUE],
    [Number.MAX_VALUE, 1],
    [1e307, 1]
  ])("rejects ratio or percentage overflow from finite inputs (%s / %s)", (allocated, capacity) => {
    expect(account(allocated, capacity)).toEqual({
      allocated, capacity, state: "invalid", issue: "overflow", utilization: null, overload: null
    });
  });

  it("accepts finite extremes when the ratio and percentage are representable", () => {
    expect(account(Number.MAX_VALUE, Number.MAX_VALUE)).toMatchObject({ state: "full", utilization: 1, overload: 0 });
    expect(account(Number.MIN_VALUE, Number.MIN_VALUE)).toMatchObject({ state: "full", utilization: 1 });
  });
});

describe("buildModel grain and metadata", () => {
  it("uses unambiguous resource-period keys", () => {
    expect(cellKey("a|b", "c")).not.toBe(cellKey("a", "b|c"));
    expect(cellKey('["a",', '"b"]')).not.toBe(cellKey('["a"', ',"b"]'));
    expect(JSON.parse(cellKey("resource", "period"))).toEqual(["resource", "period"]);
  });

  it.each([
    { name: "identical", allocated: 8, capacity: 10 },
    { name: "conflicting", allocated: 80, capacity: 100 },
    { name: "invalid", allocated: -1, capacity: "ten" }
  ])("marks $name duplicate resource-period rows ambiguous instead of summing", second => {
    const identity = makeSelectionId("r1-p1");
    const model = buildModel([
      makeRow({ identity, tooltips: [{ displayName: "Project", value: "A" }] }),
      makeRow({ allocated: second.allocated, capacity: second.capacity }),
      makeRow()
    ]);
    expect(model.cells.size).toBe(1);
    expect(model.duplicateCount).toBe(1);
    expect(model.invalidCount).toBe(0);
    expect(model.cells.get(cellKey("r1", "p1"))).toMatchObject({
      state: "duplicate", issue: "duplicate", allocated: null, capacity: null,
      allocatedText: "?", capacityText: "?", utilization: null, overload: null, identity: undefined, tooltips: []
    });
    expect(resourceTotal(model, "r1", true)).toBeUndefined();
  });

  it("a duplicate remains ambiguous when its first row was already invalid", () => {
    const model = buildModel([makeRow({ allocated: -1 }), makeRow()]);
    expect(model.cells.get(cellKey("r1", "p1"))?.state).toBe("duplicate");
    expect(model.duplicateCount).toBe(1);
    expect(model.invalidCount).toBe(0);
  });

  it("counts ambiguous cells, not extra source rows, independently of invalid cells", () => {
    const r2 = { key: "r2", label: "Grace" };
    const r3 = { key: "r3", label: "Lin" };
    const model = buildModel([
      makeRow(), makeRow(), makeRow(),
      makeRow({ resource: r2 }), makeRow({ resource: r2 }),
      makeRow({ resource: r3, allocated: -1 })
    ]);
    expect(model).toMatchObject({ duplicateCount: 2, invalidCount: 1, sourceRows: 6 });
    expect(model.cells.size).toBe(3);
  });

  it("preserves authoritative native preaggregates without guessing at upstream multiplication", () => {
    const model = buildModel([makeRow({ allocated: 40, capacity: 160 })]);
    expect(model.cells.get(cellKey("r1", "p1"))).toMatchObject({
      allocated: 40, capacity: 160, utilization: 0.25, state: "available"
    });
    expect(model.duplicateCount).toBe(0);
    expect(resourceTotal(model, "r1", true)?.capacity).toBe(160);
  });

  it("keeps host identity, source text, highlights, tooltips and a positive nonworking capacity", () => {
    const identity = makeSelectionId("r1-p1");
    const tooltips = [{ displayName: "Project", value: "Native result" }];
    const model = buildModel([makeRow({
      identity, allocatedText: "8.00 h", capacityText: "10.00 h", nonworking: 1,
      highlighted: true, highlightAllocated: "0.00 h", highlightCapacity: "-", tooltips
    })]);
    expect(model.cells.get(cellKey("r1", "p1"))).toMatchObject({
      identity, allocatedText: "8.00 h", capacityText: "10.00 h", nonworking: true,
      capacity: 10, state: "available", highlighted: true, highlightAllocated: "0.00 h",
      highlightCapacity: "-", tooltips
    });
  });

  it("keeps sparse absence distinct from a supplied missing or zero cell", () => {
    const model = buildModel([
      makeRow({ allocated: null }),
      makeRow({ resource: { key: "r2", label: "Grace" }, period: { key: "p2", label: "Week 2" }, allocated: 0, capacity: 0 })
    ]);
    expect(model.cells.size).toBe(2);
    expect(model.cells.get(cellKey("r1", "p1"))?.state).toBe("missing");
    expect(model.cells.get(cellKey("r2", "p2"))?.state).toBe("unavailable");
    expect(model.cells.has(cellKey("r1", "p2"))).toBe(false);
    expect(model.cells.has(cellKey("r2", "p1"))).toBe(false);
  });
});

describe("period ordering", () => {
  it("keeps resources and unordered labels in first-seen order, not lexical order", () => {
    const model = buildModel([
      makeRow({ resource: { key: "z", label: "Zoe" }, period: { key: "10", label: "Week 10" } }),
      makeRow({ resource: { key: "a", label: "Ada" }, period: { key: "2", label: "Week 2" } }),
      makeRow({ period: { key: "1", label: "Week 1" } })
    ]);
    expect(model.resources.map(r => r.key)).toEqual(["z", "a", "r1"]);
    expect(model.periods.map(p => p.key)).toEqual(["10", "2", "1"]);
    expect(model.orderConflict).toBe(false);
  });

  it("sorts labels by their explicit numeric order consistently across resources", () => {
    const model = buildModel([
      makeRow({ period: { key: "late", label: "Later", order: 20 } }),
      makeRow({ period: { key: "early", label: "Earlier", order: -5 } }),
      makeRow({ resource: { key: "r2", label: "Grace" }, period: { key: "early", label: "Earlier", order: -5 } })
    ]);
    expect(model.periods.map(p => p.key)).toEqual(["early", "late"]);
    expect(model.orderConflict).toBe(false);
  });

  it.each([
    { name: "different orders for one label", periods: [{ key: "p1", label: "Week 1", order: 1 }, { key: "p1", label: "Week 1", order: 2 }] },
    { name: "one order shared by distinct labels", periods: [{ key: "p1", label: "Week 1", order: 1 }, { key: "p2", label: "Week 2", order: 1 }] },
    { name: "mixed ordered and unordered labels", periods: [{ key: "p1", label: "Week 1", order: 1 }, { key: "p2", label: "Week 2" }] },
    { name: "nonfinite order", periods: [{ key: "p1", label: "Week 1", order: Infinity }] }
  ])("reports $name and suppresses totals", ({ periods }) => {
    const model = buildModel(periods.map((period, i) => makeRow({ period, resource: { key: `r${i}`, label: `Resource ${i}` } })));
    expect(model.orderConflict).toBe(true);
    expect(resourceTotal(model, "r0", true)).toBeUndefined();
  });
});

describe("resourceTotal", () => {
  it("requires explicit additive opt-in for FTE and other units", () => {
    const model = buildModel([
      makeRow({ allocated: 0.5, capacity: 1 }),
      makeRow({ period: { key: "p2", label: "Week 2" }, allocated: 0.8, capacity: 1 })
    ]);
    expect(resourceTotal(model, "r1", false)).toBeUndefined();
    expect(resourceTotal(model, "r1", true)).toMatchObject({ allocated: 1.3, capacity: 2, utilization: 0.65 });
  });

  it("recomputes utilization and overload from additive measures rather than averaging percentages", () => {
    const model = buildModel([
      makeRow({ allocated: 10, capacity: 10 }),
      makeRow({ period: { key: "p2", label: "Week 2" }, allocated: 0, capacity: 30 })
    ]);
    expect(resourceTotal(model, "r1", true)).toEqual({
      allocated: 10, capacity: 40, utilization: 0.25, overload: 0, state: "available"
    });
  });

  it("recomputes total overload instead of summing per-period overloads", () => {
    const model = buildModel([
      makeRow({ allocated: 15, capacity: 10 }),
      makeRow({ period: { key: "p2", label: "Week 2" }, allocated: 0, capacity: 10 })
    ]);
    expect(resourceTotal(model, "r1", true)).toMatchObject({ allocated: 15, capacity: 20, overload: 0 });
  });

  it("never totals a partial period window even when the displayed resource is complete", () => {
    expect(resourceTotal(buildModel([makeRow()], true), "r1", true)).toBeUndefined();
  });

  it("suppresses only sparse resource totals while allowing complete resources", () => {
    const model = buildModel([
      makeRow(), makeRow({ period: { key: "p2", label: "Week 2" } }),
      makeRow({ resource: { key: "r2", label: "Grace" } })
    ]);
    expect(resourceTotal(model, "r1", true)).toMatchObject({ allocated: 16, capacity: 20 });
    expect(resourceTotal(model, "r2", true)).toBeUndefined();
    expect(resourceTotal(model, "not-present", true)).toBeUndefined();
  });

  it.each([{ allocated: null }, { capacity: undefined }, { allocated: -1 }, { nonworking: 2 }])(
    "suppresses totals containing missing or invalid inputs %j", overrides => {
      expect(resourceTotal(buildModel([makeRow(overrides)]), "r1", true)).toBeUndefined();
    }
  );

  it("includes genuine zeros and zero-capacity overload in complete additive totals", () => {
    expect(resourceTotal(buildModel([makeRow({ allocated: 0, capacity: 0 })]), "r1", true))
      .toMatchObject({ allocated: 0, capacity: 0, state: "unavailable", utilization: null });
    expect(resourceTotal(buildModel([makeRow({ allocated: 5, capacity: 0 })]), "r1", true))
      .toMatchObject({ allocated: 5, capacity: 0, state: "overload", utilization: null, overload: 5 });
  });

  it("returns no total for an empty model", () => {
    expect(resourceTotal(buildModel([]), "r1", true)).toBeUndefined();
  });

  it.each([
    { allocated: Number.MAX_VALUE, capacity: Number.MAX_VALUE },
    { allocated: 0, capacity: Number.MAX_VALUE }
  ])("suppresses summation overflow from individually valid cells %j", values => {
    const model = buildModel([
      makeRow(values), makeRow({ ...values, period: { key: "p2", label: "Week 2" } })
    ]);
    expect(model.invalidCount).toBe(0);
    expect(resourceTotal(model, "r1", true)).toBeUndefined();
  });
});

describe("model bounds", () => {
  it("pins the public resource, period, Cartesian-cell and native-row budgets", () => {
    expect(LIMITS).toEqual({ resources: 200, periods: 104, cells: 10000, rows: 10000, text: 512 });
  });

  it.each([
    { axis: "resource" as const, limit: LIMITS.resources },
    { axis: "period" as const, limit: LIMITS.periods }
  ])("accepts exactly $limit $axis values and excludes the next", ({ axis, limit }) => {
    const rows = Array.from({ length: limit }, (_, i) => makeRow({ [axis]: { key: `${axis}${i}`, label: String(i) } }));
    const exact = buildModel(rows);
    expect(exact.partial).toBe(false);
    expect(exact.bounded).toBe(false);
    const over = buildModel([...rows, makeRow({ [axis]: { key: "excluded", label: "Excluded" } })]);
    expect(over).toMatchObject({ bounded: true, partial: true, sourceRows: limit + 1 });
    expect(over.cells.size).toBe(limit);
    expect((axis === "resource" ? over.resources : over.periods).some(value => value.key === "excluded")).toBe(false);
  });

  it("bounds the Cartesian grid, not just the number of supplied sparse cells", () => {
    const rows = [
      ...Array.from({ length: 100 }, (_, i) => makeRow({ resource: { key: "r0", label: "0" }, period: { key: `p${i}`, label: String(i) } })),
      ...Array.from({ length: 99 }, (_, i) => makeRow({ resource: { key: `r${i + 1}`, label: String(i + 1) }, period: { key: "p0", label: "0" } }))
    ];
    const exact = buildModel(rows);
    expect(exact.resources.length * exact.periods.length).toBe(10000);
    expect(exact.cells.size).toBe(199);
    expect(exact.bounded).toBe(false);
    const over = buildModel([
      ...rows,
      makeRow({ resource: { key: "r100", label: "100" }, period: { key: "p0", label: "0" } }),
      makeRow({ resource: { key: "r0", label: "0" }, period: { key: "p100", label: "100" } })
    ]);
    expect(over).toMatchObject({ bounded: true, partial: true });
    expect(over.resources.length).toBe(100);
    expect(over.periods.length).toBe(100);
    expect(over.cells.size).toBe(199);
    expect(resourceTotal(over, "r0", true)).toBeUndefined();
  });

  it("processes exactly 10,000 input rows and never inspects subsequent rows", () => {
    const rows = Array.from({ length: LIMITS.rows }, (_, i) => makeRow({
      resource: { key: `r${Math.floor(i / 100)}`, label: String(Math.floor(i / 100)) },
      period: { key: `p${i % 100}`, label: String(i % 100) }
    }));
    const exact = buildModel(rows);
    expect(exact).toMatchObject({ sourceRows: 10000, bounded: false, partial: false, duplicateCount: 0 });
    expect(exact.cells.size).toBe(10000);
    expect(resourceTotal(exact, "r0", true)).toMatchObject({ allocated: 800, capacity: 1000 });
    const over = buildModel([...rows, makeRow({ allocated: -1, period: { key: "p0", label: "0", order: Infinity } })]);
    expect(over).toMatchObject({ sourceRows: 10000, bounded: true, partial: true, invalidCount: 0, orderConflict: false, duplicateCount: 0 });
    expect(over.cells.size).toBe(10000);
    expect(resourceTotal(over, "r0", true)).toBeUndefined();
  });
});

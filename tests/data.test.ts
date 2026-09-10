import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { formatter, readData, shorten } from "../src/data";
import { cellKey, LIMITS, resourceTotal } from "../src/model";
import { makeHost, makeSource, makeValueColumn, makeValueColumns, makeView } from "./fixtures";
import type { NativeValue, ViewOptions } from "./fixtures";

const read = (options: ViewOptions = {}) => readData(makeView(options), makeHost().host);
const getCell = (result: ReturnType<typeof readData>, resource = "Ada", period = "Week 1") =>
  result.model.cells.get(cellKey(`string:${resource}`, `string:${period}`));
const foreignDate = (time: number): Date => runInNewContext("new Date(time)", { time });

describe("native categorical binding", () => {
  it.each([
    undefined,
    { metadata: { columns: [] } },
    { metadata: { columns: [] }, table: { columns: [], rows: [] } },
    { metadata: { columns: [] }, categorical: {} }
  ])("returns a safe binding error for absent or incompatible categorical input", view => {
    const host = makeHost();
    const result = readData(view, host.host);
    expect(result).toMatchObject({
      error: "bind", segmented: false, reduced: false, hasHighlights: false, additiveAllowed: false
    });
    expect(result.model.cells.size).toBe(0);
    expect(result.model.resources).toEqual([]);
    expect(result.model.periods).toEqual([]);
    expect(result.formatAllocated(2)).toBe("2");
    expect(result.formatCapacity(3)).toBe("3");
    expect(host.createSelectionIdBuilder).not.toHaveBeenCalled();
  });

  it("reads role bindings rather than category or measure positions", () => {
    const view = makeView({ allocated: [5, 15], capacity: [10, 10] });
    view.categorical.categories.reverse();
    view.categorical.values.reverse();
    const result = readData(view, makeHost().host);
    expect(result.error).toBeUndefined();
    expect(getCell(result)).toMatchObject({ allocated: 5, capacity: 10, state: "available" });
    expect(getCell(result, "Ada", "Week 2")).toMatchObject({ allocated: 15, capacity: 10, state: "overload" });
  });

  it.each(["resource", "period", "allocated", "capacity"] as const)("requires exactly one %s binding", role => {
    const view = makeView();
    const column = [...view.categorical.categories, ...view.categorical.values].find(c => c.source.roles?.[role]);
    expect(column).toBeDefined();
    if (!column) throw new Error(`Fixture is missing ${role}`);
    column.source.roles = { [role]: false };
    expect(readData(view, makeHost().host).error).toBe("bind");
  });

  it.each(["resource", "period"] as const)("rejects two categories bound to %s", role => {
    const view = makeView();
    const other = role === "resource" ? "period" : "resource";
    view.categorical.categories[0].source.roles = { [role]: true, [other]: true };
    view.categorical.categories[1].source.roles = { [role]: true };
    expect(readData(view, makeHost().host).error).toBe("bind");
  });

  it.each(["allocated", "capacity", "periodOrder", "nonworking"] as const)("rejects multiple %s measures", role => {
    const view = makeView({
      ...(role === "periodOrder" ? { periodOrder: [1, 2] } : {}),
      ...(role === "nonworking" ? { nonworking: [0, 0] } : {})
    });
    view.categorical.values.push(makeValueColumn(role, { values: [1, 2] }));
    expect(readData(view, makeHost().host).error).toBe("bind");
  });

  it("rejects extra categories and more than five tooltip measures", () => {
    const view = makeView();
    view.categorical.categories.push({ source: makeSource("resource", { roles: { project: true } }), values: ["A", "B"] });
    expect(readData(view, makeHost().host).error).toBe("bind");
    expect(read({ tooltips: Array.from({ length: 6 }, () => ({ values: [1, 2] })) }).error).toBe("bind");
  });

  it("accepts all nine supported value columns and rejects a tenth", () => {
    const view = makeView({ periodOrder: [1, 2], nonworking: [0, 0], tooltips: Array.from({ length: 5 }, () => ({ values: [1, 2] })) });
    expect(view.categorical.values).toHaveLength(9);
    expect(readData(view, makeHost().host).error).toBeUndefined();
    view.categorical.values.push(makeValueColumn("tooltips", { values: [1, 2], source: { roles: { extra: true } } }));
    expect(readData(view, makeHost().host).error).toBe("bind");
  });

  it("accepts a correctly bound empty categorical result", () => {
    const result = read({ resources: [], periods: [], allocated: [], capacity: [] });
    expect(result.error).toBeUndefined();
    expect(result.model).toMatchObject({ sourceRows: 0, partial: false, bounded: false });
    expect(result.model.cells.size).toBe(0);
  });

  it.each([
    { periods: ["Week 1"] },
    { allocated: [1] },
    { capacity: [1, 2, 3] },
    { periodOrder: [1] },
    { nonworking: [] },
    { tooltips: [{ values: [1] }] },
    { allocatedHighlights: [0] },
    { capacityHighlights: [0, 1, 2] },
    { tooltips: [{ values: [1, 2], highlights: [0] }] }
  ])("rejects mismatched native column/highlight lengths %j", options => {
    const host = makeHost();
    const result = readData(makeView(options), host.host);
    expect(result.error).toBe("shape");
    expect(result.model.cells.size).toBe(0);
    expect(host.createSelectionIdBuilder).not.toHaveBeenCalled();
  });

  it("does not consume host-generated grouped subtotals in place of native row measures", () => {
    const view = makeView({ allocated: [7, 11], capacity: [10, 12] });
    const nativeColumns = view.categorical.values;
    view.categorical.values = makeValueColumns([...nativeColumns]);
    view.categorical.values.grouped = () => [{ values: [
      makeValueColumn("allocated", { values: [999, 999] }),
      makeValueColumn("capacity", { values: [999, 999] })
    ] }];
    const result = readData(view, makeHost().host);
    expect(getCell(result)).toMatchObject({ allocated: 7, capacity: 10 });
  });
});

describe("native resource-period values", () => {
  it.each([
    { name: "identical", allocated: [8, 8], capacity: [10, 10] },
    { name: "conflicting", allocated: [8, 12], capacity: [10, 100] },
    { name: "invalid", allocated: [8, -1], capacity: [10, 10] }
  ])("never sums $name duplicate native resource-period rows", options => {
    const result = read({ resources: ["Ada", "Ada"], periods: ["Week 1", "Week 1"], ...options });
    expect(result.error).toBeUndefined();
    expect(result.model.duplicateCount).toBe(1);
    expect(result.model.cells.size).toBe(1);
    expect(getCell(result)).toMatchObject({
      state: "duplicate", allocated: null, capacity: null, identity: undefined, allocatedText: "?", capacityText: "?"
    });
  });

  it("treats one native preaggregated capacity as authoritative; upstream fanout is not observable", () => {
    const result = read({ resources: ["Ada"], periods: ["Week 1"], allocated: [40], capacity: [160] });
    expect(getCell(result)).toMatchObject({ allocated: 40, capacity: 160, utilization: 0.25, state: "available" });
    expect(result.model).toMatchObject({ duplicateCount: 0, invalidCount: 0 });
  });

  it("preserves missing, explicit zero, zero-capacity overload, and explicit nonworking as different states", () => {
    const result = read({
      resources: ["missing", "zero", "overload", "nonworking", "flagged-positive"],
      periods: Array<string>(5).fill("Week 1"),
      allocated: [null, 0, 4, 0, 5], capacity: [10, 0, 0, 0, 10],
      nonworking: [0, 0, 0, 1, 1]
    });
    expect(getCell(result, "missing")).toMatchObject({ state: "missing", allocated: null, allocatedText: "-" });
    expect(getCell(result, "zero")).toMatchObject({ state: "unavailable", allocated: 0, capacity: 0 });
    expect(getCell(result, "overload")).toMatchObject({ state: "overload", utilization: null, overload: 4 });
    expect(getCell(result, "nonworking")).toMatchObject({ state: "nonworking", utilization: null });
    expect(getCell(result, "flagged-positive")).toMatchObject({ state: "available", capacity: 10, nonworking: true });
  });

  it.each([-1, "10", "", true, NaN, Infinity, -Infinity])("never coerces invalid numeric measures %j", value => {
    const result = read({ allocated: [value, 1], capacity: [10, value] });
    expect(result.error).toBeUndefined();
    expect(result.model.invalidCount).toBe(2);
    expect(getCell(result)?.issue).toBe("invalidValue");
    expect(getCell(result, "Ada", "Week 2")?.issue).toBe("invalidValue");
  });

  it.each(["#,0.00", "$#,0.00", "0.0%", "0.00E+00"])(
    "keeps NaN and infinities as invalid cells through the real SDK formatter (%s)", format => {
      const invalid = [NaN, Infinity, -Infinity];
      const resources = [
        "allocated-NaN", "allocated-Infinity", "allocated-negative-Infinity",
        "capacity-NaN", "capacity-Infinity", "capacity-negative-Infinity", "valid"
      ];
      const result = read({
        resources,
        periods: Array<string>(resources.length).fill("Week 1"),
        allocated: [...invalid, 1, 1, 1, 8],
        capacity: [10, 10, 10, ...invalid, 10],
        allocatedHighlights: [...invalid, ...invalid, 0],
        capacityHighlights: [...invalid, ...invalid, 0],
        sources: { allocated: { format }, capacity: { format } },
        tooltips: [{ values: [...invalid, ...invalid, 0], source: { displayName: "Native tooltip", format } }]
      });
      expect(result.error).toBeUndefined();
      expect(result.model.invalidCount).toBe(6);
      expect(result.model.cells.size).toBe(7);
      expect(result.hasHighlights).toBe(true);
      for (const resource of resources.slice(0, -1)) {
        const cell = getCell(result, resource);
        expect(cell).toMatchObject({ state: "invalid", issue: "invalidValue", utilization: null, overload: null });
        for (const text of [cell?.allocatedText, cell?.capacityText, cell?.highlightAllocated,
          cell?.highlightCapacity, cell?.tooltips[0]?.value]) {
          expect(text).toEqual(expect.any(String));
          expect(text?.length).toBeGreaterThan(0);
          expect(text?.length).toBeLessThanOrEqual(LIMITS.text);
        }
      }
      expect(getCell(result, "valid")).toMatchObject({
        state: "available", allocated: 8, capacity: 10, utilization: 0.8, highlighted: true
      });
    }
  );

  it.each([-1, 2, "1", true, NaN, Infinity])("rejects nonworking flag %j without rewriting positive capacity", flag => {
    const result = read({ nonworking: [flag, flag] });
    expect(result.model.invalidCount).toBe(2);
    expect(getCell(result)).toMatchObject({ state: "invalid", issue: "invalidNonworking", capacity: 10 });
  });

  it("flags finite arithmetic overflow without rendering an infinite utilization", () => {
    const result = read({ allocated: [Number.MAX_VALUE, Number.MAX_VALUE], capacity: [1, Number.MIN_VALUE] });
    expect(result.model.invalidCount).toBe(2);
    for (const cell of result.model.cells.values()) expect(cell).toMatchObject({ issue: "overflow", utilization: null });
  });

  it.each(["resources", "periods"] as const)("rejects invalid %s keys", field => {
    const badKeys: NativeValue[] = [null, undefined, "", " \t", true, false, NaN, Infinity, -Infinity, new Date(NaN), "x".repeat(LIMITS.text + 1)];
    for (const value of badKeys) {
      const result = read({ [field]: [value, value] });
      expect(result.error, `Rejected ${field} key: ${String(value)}`).toBe("keys");
      expect(result.model.cells.size).toBe(0);
    }
  });

  it("accepts boundary-length labels and finite numeric keys including zero", () => {
    const label = "x".repeat(LIMITS.text);
    const result = read({ resources: [label, 0], periods: [0, label] });
    expect(result.error).toBeUndefined();
    expect(result.model.resources.map(axis => axis.key)).toEqual([`string:${label}`, "number:0"]);
    expect(result.model.periods.map(axis => axis.key)).toEqual(["number:0", `string:${label}`]);
  });

  it("distinguishes numeric and string category identities even when their displayed labels match", () => {
    const result = read({ resources: [1, "1"], periods: [1, "1"] });
    expect(result.model.resources).toHaveLength(2);
    expect(result.model.periods).toHaveLength(2);
    expect(result.model.cells.size).toBe(2);
    expect(result.model.duplicateCount).toBe(0);
  });
});

describe("chronological and explicit period ordering", () => {
  it("accepts cross-realm Dates with exact timestamp ordering and original host identities", () => {
    const earlier = foreignDate(new Date(2026, 7, 3, 10, 30).getTime());
    const later = foreignDate(new Date(2026, 7, 3, 11, 30).getTime());
    expect(earlier instanceof Date).toBe(false);
    const view = makeView({
      periods: [later, earlier], periodOrder: [null, null],
      sources: { period: { type: { dateTime: true }, format: "yyyy-MM-dd HH:mm" } }
    });
    const host = makeHost(), result = readData(view, host.host);
    expect(result.error).toBeUndefined();
    expect(result.model.periods.map(axis => axis.key)).toEqual([`date:${earlier.getTime()}`, `date:${later.getTime()}`]);
    expect(result.model.periods.map(axis => axis.label)).toEqual(["2026-08-03 10:30", "2026-08-03 11:30"]);
    expect(result.model.periods[0]?.rawLabel).toBe(earlier.toISOString());
    expect(view.categorical.categories[1].values[0]).toBe(later);
    expect(host.builders[0]?.withCategory).toHaveBeenNthCalledWith(2, view.categorical.categories[1], 0);
    expect([...result.model.cells.values()].every(cell => cell.identity?.hasIdentity())).toBe(true);
  });

  it("rejects invalid cross-realm Dates and objects spoofing Date methods or tags", () => {
    for (const value of [foreignDate(NaN), { [Symbol.toStringTag]: "Date", getTime: () => 0 },
      Object.create(Date.prototype), { getTime: () => 0, toISOString: () => "2026-08-03" }]) {
      const view = makeView({ sources: { period: { type: { dateTime: true } } } });
      Reflect.set(view.categorical.categories[1].values, 0, value);
      expect(readData(view, makeHost().host).error).toBe("keys");
    }
  });

  it("detects duplicate instants across realms without summing capacity", () => {
    const local = new Date(2026, 7, 3);
    const result = read({ periods: [local, foreignDate(local.getTime())] });
    expect(result.error).toBeUndefined();
    expect(result.model.duplicateCount).toBe(1);
    expect([...result.model.cells.values()][0]).toMatchObject({ state: "duplicate", capacity: null, identity: undefined });
  });

  it("orders dates chronologically regardless of native row order or conflicting explicit ranks", () => {
    const earlier = new Date(2026, 0, 2);
    const later = new Date(2026, 1, 1);
    const result = read({
      periods: [later, earlier], periodOrder: [-100, 100],
      sources: { period: { type: { dateTime: true }, format: "yyyy-MM-dd" } }
    });
    expect(result.error).toBeUndefined();
    expect(result.model.periods.map(axis => axis.key)).toEqual([`date:${earlier.getTime()}`, `date:${later.getTime()}`]);
    expect(result.model.periods.map(axis => axis.order)).toEqual([earlier.getTime(), later.getTime()]);
    expect(result.model.periods.map(axis => axis.label)).toEqual(["2026-01-02", "2026-02-01"]);
  });

  it("rejects a non-Date value in a date-typed period role rather than parsing a label", () => {
    expect(read({ periods: ["2026-01-02", "2026-02-01"], sources: { period: { type: { dateTime: true } } } }).error).toBe("keys");
  });

  it("keeps unordered labels and resources in stable first-seen order", () => {
    const result = read({ resources: ["Zoe", "Ada", "Grace"], periods: ["Week 10", "Week 2", "Week 1"] });
    expect(result.model.resources.map(axis => axis.label)).toEqual(["Zoe", "Ada", "Grace"]);
    expect(result.model.periods.map(axis => axis.label)).toEqual(["Week 10", "Week 2", "Week 1"]);
    expect(result.error).toBeUndefined();
  });

  it("sorts ordered labels while permitting the same label/order pair for multiple resources", () => {
    const result = read({ resources: ["Ada", "Ada", "Grace"], periods: ["Later", "Earlier", "Earlier"], periodOrder: [2, 1, 1] });
    expect(result.error).toBeUndefined();
    expect(result.model.periods.map(axis => axis.label)).toEqual(["Earlier", "Later"]);
  });

  it.each([
    { resources: ["Ada", "Grace"], periods: ["Week 1", "Week 1"], periodOrder: [1, 2] },
    { periods: ["Week 1", "Week 2"], periodOrder: [1, 1] }
  ])("reports inconsistent label order or nonunique ranks %j", options => {
    const result = read(options);
    expect(result.error).toBe("order");
    expect(result.model.orderConflict).toBe(true);
    expect(resourceTotal(result.model, "string:Ada", true)).toBeUndefined();
  });

  it.each([null, undefined, "1", true, NaN, Infinity, -Infinity])("rejects a missing or nonfinite explicit order %j", value => {
    const result = read({ periodOrder: [value, 2] });
    expect(result.error).toBe("order");
    expect(result.model.cells.size).toBe(0);
  });
});

describe("source formatting, highlights, and tooltip data", () => {
  it("formats cross-realm resource and tooltip Dates through the local SDK formatter", () => {
    const date = foreignDate(new Date(2026, 7, 3).getTime());
    const result = read({
      resources: [date], periods: ["Week 1"],
      sources: { resource: { type: { dateTime: true }, format: "yyyy-MM-dd" } },
      tooltips: [{ values: [date], source: { displayName: "Date", type: { dateTime: true }, format: "yyyy-MM-dd" } }]
    });
    expect(result.error).toBeUndefined();
    expect(result.model.resources[0]).toMatchObject({ key: `date:${date.getTime()}`, label: "2026-08-03" });
    expect([...result.model.cells.values()][0]?.tooltips).toEqual([{ displayName: "Date", value: "2026-08-03" }]);
    expect(formatter(makeSource("period", { format: "yyyy-MM-dd" }), "en-US")(date)).toBe("2026-08-03");
  });

  it("uses each native numeric format independently for cells, totals and highlights", () => {
    const result = read({
      allocated: [1234.5, 0], capacity: [0.875, 0],
      allocatedHighlights: [0, null], capacityHighlights: [0.5, null],
      sources: { allocated: { format: "#,0.00" }, capacity: { format: "0.0%" } },
      tooltips: [{ values: [12.5, 0], source: { displayName: "Cost", format: "$#,0.00" } }]
    });
    expect(getCell(result)).toMatchObject({
      allocatedText: "1,234.50", capacityText: "87.5%", highlightAllocated: "0.00", highlightCapacity: "50.0%",
      highlighted: true, tooltips: [{ displayName: "Cost", value: "$12.50" }]
    });
    expect(getCell(result, "Ada", "Week 2")).toMatchObject({
      allocatedText: "0.00", capacityText: "0.0%", highlighted: false,
      tooltips: [{ displayName: "Cost", value: "$0.00" }]
    });
    expect(result.formatAllocated(20.5)).toBe("20.50");
    expect(result.formatCapacity(0.25)).toBe("25.0%");
    expect(result.hasHighlights).toBe(true);
  });

  it.each(["allocatedHighlights", "capacityHighlights"] as const)("recognizes zero-valued %s as present", field => {
    const result = read({ [field]: [0, null] });
    expect(result.hasHighlights).toBe(true);
    expect(getCell(result)?.highlighted).toBe(true);
    expect(getCell(result, "Ada", "Week 2")?.highlighted).toBe(false);
  });

  it("distinguishes absent highlight arrays from supplied arrays containing only blanks", () => {
    const absent = read();
    expect(absent.hasHighlights).toBe(false);
    expect(getCell(absent)).toMatchObject({ highlighted: false, highlightAllocated: undefined, highlightCapacity: undefined });
    const blank = read({ allocatedHighlights: [null, undefined], capacityHighlights: [null, null] });
    expect(blank.hasHighlights).toBe(true);
    expect(getCell(blank)).toMatchObject({ highlighted: false, highlightAllocated: "-", highlightCapacity: "-" });
    expect(getCell(blank, "Ada", "Week 2")).toMatchObject({ highlighted: false, highlightAllocated: "-", highlightCapacity: "-" });
  });

  it("does not substitute highlights for the authoritative measures", () => {
    const result = read({ allocated: [12, 5], capacity: [10, 10], allocatedHighlights: [0, 100], capacityHighlights: [100, 0] });
    expect(getCell(result)).toMatchObject({ allocated: 12, capacity: 10, utilization: 1.2, overload: 2, state: "overload" });
    expect(getCell(result, "Ada", "Week 2")).toMatchObject({ allocated: 5, capacity: 10, utilization: 0.5, state: "available" });
  });

  it("does not treat tooltip-only highlights as highlighted capacity data", () => {
    const result = read({ tooltips: [{ values: [1, 2], highlights: [1, 2] }] });
    expect(result.hasHighlights).toBe(false);
    expect(getCell(result)?.highlighted).toBe(false);
  });

  it("preserves all five tooltip columns, including zero and missing values", () => {
    const result = read({ tooltips: [
      { values: [0, 0], source: { displayName: "Zero", format: "0.0" } },
      { values: [null, null], source: { displayName: "Missing" } },
      { values: ["Client", "Client"], source: { displayName: "Text", type: { text: true } } },
      { values: [true, false], source: { displayName: "Boolean", type: { bool: true } } },
      { values: [2, 3], source: { displayName: "Count", format: "0" } }
    ] });
    expect(getCell(result)?.tooltips).toEqual([
      { displayName: "Zero", value: "0.0" },
      { displayName: "Missing", value: "-" },
      { displayName: "Text", value: "Client" },
      { displayName: "Boolean", value: "True" },
      { displayName: "Count", value: "2" }
    ]);
  });

  it("shortens display names and source text without making an oversized key acceptable", () => {
    const text = "x".repeat(LIMITS.text + 100);
    const result = read({ tooltips: [{ values: [text, text], source: { displayName: text, type: { text: true } } }] });
    expect(result.error).toBeUndefined();
    expect(getCell(result)?.tooltips).toEqual([{ displayName: shorten(text), value: shorten(text) }]);
    expect(getCell(result)?.tooltips[0]?.value).toHaveLength(LIMITS.text);
    expect(read({ resources: [text, text] }).error).toBe("keys");
    expect(shorten("x".repeat(LIMITS.text))).toBe("x".repeat(LIMITS.text));
    expect(shorten(text)).toBe("x".repeat(LIMITS.text - 3) + "...");
  });

  it.each(["resource", "period", "allocated", "capacity", "periodOrder", "nonworking"] as const)(
    "rejects oversized %s source format strings before formatting rows", role => {
      const result = read({
        periodOrder: [1, 2], nonworking: [0, 0],
        sources: { [role]: { format: "0".repeat(LIMITS.text + 1) } }
      });
      expect(result.error).toBe("shape");
    }
  );

  it("also bounds tooltip source format strings", () => {
    expect(read({
      tooltips: [{ values: [1, 2], source: { format: "0".repeat(LIMITS.text + 1) } }]
    }).error).toBe("shape");
  });

  it("formats undefined as a blank marker and bounds long text output", () => {
    const format = formatter(makeSource("resource"), "en-US");
    expect(format(undefined)).toBe("-");
    expect(format("x".repeat(600))).toHaveLength(512);
    expect(format("x".repeat(600)).endsWith("...")).toBe(true);
  });
});

describe("native selection identity", () => {
  it("builds every cell selection from BOTH resource and period categories at the native row index", () => {
    const host = makeHost();
    const view = makeView();
    const result = readData(view, host.host);
    expect(host.createSelectionIdBuilder).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 2; index++) {
      const builder = host.builders[index];
      expect(builder?.withCategory).toHaveBeenCalledTimes(2);
      expect(builder?.withCategory).toHaveBeenNthCalledWith(1, view.categorical.categories[0], index);
      expect(builder?.withCategory).toHaveBeenNthCalledWith(2, view.categorical.categories[1], index);
      expect(builder?.createSelectionId).toHaveBeenCalledTimes(1);
    }
    expect(getCell(result)?.identity?.getKey()).not.toBe(getCell(result, "Ada", "Week 2")?.identity?.getKey());
    expect(getCell(result)?.identity?.getKey()).toBe(JSON.stringify([
      ["Capacity.resource", "Ada"], ["Capacity.period", "Week 1"]
    ]));
  });

  it.each([0, 1])("does not create a partial selection when category %s has no identities", categoryIndex => {
    const host = makeHost();
    const view = makeView();
    const category = view.categorical.categories[categoryIndex];
    if (!category) throw new Error("Fixture category missing");
    delete category.identity;
    const result = readData(view, host.host);
    expect(host.createSelectionIdBuilder).not.toHaveBeenCalled();
    expect([...result.model.cells.values()].every(cell => cell.identity === undefined)).toBe(true);
  });

  it("preserves a cell without selection when only that row lacks one category identity", () => {
    const host = makeHost();
    const view = makeView();
    view.categorical.categories[1].identity = [{}];
    const result = readData(view, host.host);
    expect(host.createSelectionIdBuilder).toHaveBeenCalledTimes(1);
    expect(getCell(result)?.identity).toBeDefined();
    expect(getCell(result, "Ada", "Week 2")?.identity).toBeUndefined();
    expect(getCell(result, "Ada", "Week 2")?.allocated).toBe(8);
  });
});

describe("additivity, partial windows and native limits", () => {
  it.each([
    { allocated: true, capacity: false },
    { allocated: false, capacity: true },
    { allocated: true, capacity: true }
  ])("honors discourageAggregationAcrossGroups on either measure %j", flags => {
    const result = read({ sources: {
      allocated: { discourageAggregationAcrossGroups: flags.allocated },
      capacity: { discourageAggregationAcrossGroups: flags.capacity }
    } });
    expect(result.additiveAllowed).toBe(false);
    expect(resourceTotal(result.model, "string:Ada", result.additiveAllowed)).toBeUndefined();
  });

  it("does not auto-enable FTE totals from measure formatting or source eligibility", () => {
    const result = read({
      allocated: [0.5, 0.8], capacity: [1, 1],
      sources: { allocated: { format: '0.00 "FTE"' }, capacity: { format: '0.00 "FTE"' } },
      metadata: { objects: { analysis: { unit: "FTE" } } }
    });
    expect(result.additiveAllowed).toBe(true);
    expect(resourceTotal(result.model, "string:Ada", false)).toBeUndefined();
  });

  it.each([
    { metadata: { segment: {} }, segmented: true, reduced: false },
    { metadata: { dataReduction: {} }, segmented: false, reduced: true },
    { metadata: { segment: {}, dataReduction: { categorical: { categories: {} } } }, segmented: true, reduced: true }
  ])("marks segmented/reduced native windows partial: $segmented / $reduced", ({ metadata, segmented, reduced }) => {
    const result = read({ metadata });
    expect(result).toMatchObject({ segmented, reduced, additiveAllowed: true });
    expect(result.model).toMatchObject({ partial: true, bounded: false });
    expect(resourceTotal(result.model, "string:Ada", true)).toBeUndefined();
  });

  it("suppresses opt-in totals for sparse rows without labelling the native view itself partial", () => {
    const result = read({ resources: ["Ada", "Ada", "Grace"], periods: ["Week 1", "Week 2", "Week 1"] });
    expect(result.model.partial).toBe(false);
    expect(resourceTotal(result.model, "string:Ada", true)).toMatchObject({ allocated: 16, capacity: 20 });
    expect(resourceTotal(result.model, "string:Grace", true)).toBeUndefined();
  });

  it.each([
    { count: LIMITS.resources + 1, resources: true, kept: LIMITS.resources },
    { count: LIMITS.periods + 1, resources: false, kept: LIMITS.periods }
  ])("enforces axis bounds at $count native rows (resources=$resources)", ({ count, resources, kept }) => {
    const result = read({
      resources: Array.from({ length: count }, (_, i) => resources ? `Resource ${i}` : "Ada"),
      periods: Array.from({ length: count }, (_, i) => resources ? "Week 1" : `Week ${i}`),
      identities: false
    });
    expect(result.model).toMatchObject({ bounded: true, partial: true, sourceRows: count });
    expect(result.model.cells.size).toBe(kept);
    expect(result.model.resources.length * result.model.periods.length).toBeLessThanOrEqual(LIMITS.cells);
  });

  it("limits a large sparse native result by its Cartesian matrix size", () => {
    const resources = [
      ...Array<string>(100).fill("Resource 0"),
      ...Array.from({ length: 100 }, (_, i) => `Resource ${i + 1}`)
    ];
    const periods = [
      ...Array.from({ length: 100 }, (_, i) => `Week ${i}`),
      ...Array<string>(100).fill("Week 0")
    ];
    const result = read({ resources, periods, identities: false });
    expect(result.model).toMatchObject({ bounded: true, partial: true });
    expect(result.model.resources).toHaveLength(100);
    expect(result.model.periods).toHaveLength(100);
    expect(result.model.cells.size).toBe(199);
    expect(resourceTotal(result.model, "string:Resource 0", true)).toBeUndefined();
  });

  it("reads 10,000 native rows and ignores invalid keys after that bound", () => {
    const resources = Array.from({ length: LIMITS.rows }, (_, i) => `Resource ${Math.floor(i / 100)}`);
    const periods = Array.from({ length: LIMITS.rows }, (_, i) => `Week ${i % 100}`);
    const options = { resources, periods, identities: false };
    const exact = read(options);
    expect(exact.error).toBeUndefined();
    expect(exact.model.sourceRows).toBe(10000);
    expect(exact.model.cells.size).toBe(10000);
    expect(exact.model.bounded).toBe(true);
    const over = read({ ...options, resources: [...resources, null], periods: [...periods, null] });
    expect(over.error).toBeUndefined();
    expect(over.model).toMatchObject({ sourceRows: 10000, bounded: true, partial: true, invalidCount: 0 });
    expect(over.model.cells.size).toBe(10000);
    expect(resourceTotal(over.model, "string:Resource 0", true)).toBeUndefined();
  });
});

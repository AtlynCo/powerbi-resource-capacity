import { describe, expect, it } from "vitest";
import { account, buildModel, resourceTotal } from "../src/model";
import { summarize } from "../src/presentation";
import { readData } from "../src/data";
import { makeHost, makeRow, makeSelectionId, makeView } from "./fixtures";

describe("independent accounting oracles", () => {
  it("matches integer/rational comparisons without using the visual's division logic", () => {
    const values = [0n, 1n, 7n, 40n, 1000000000n, 9007199254740991n];
    for (const allocation of values) for (const capacity of values) {
      const result = account(Number(allocation), Number(capacity));
      const expected = capacity === 0n ? allocation > 0n ? "overload" : "unavailable"
        : allocation > capacity ? "overload" : allocation === capacity ? "full" : "available";
      expect(result.state).toBe(expected);
      expect(result.overload).toBe(Number(allocation > capacity ? allocation - capacity : 0n));
      if (capacity === 0n) expect(result.utilization).toBeNull();
      else expect(result.utilization! * Number(capacity)).toBeCloseTo(Number(allocation), -1);
    }
  });
  it("retains representable small contributions in an additive row instead of dropping each one", () => {
    const amounts = [9007199254740992, 1, 1, 1, 1];
    const rows = amounts.map((allocated, i) => makeRow({
      period: { key: String(i), label: String(i) }, allocated, capacity: allocated
    }));
    const expected = Number(amounts.reduce((sum, value) => sum + BigInt(value), 0n));
    expect(resourceTotal(buildModel(rows), "r1", true)).toMatchObject({ allocated: expected, capacity: expected });
  });
  it("does not retain arbitrary first-row nonworking or highlight metadata for duplicates", () => {
    const model = buildModel([
      makeRow({ nonworking: 1, highlighted: true, highlightAllocated: "8", highlightCapacity: "10" }),
      makeRow({ nonworking: 0, allocated: 15 })
    ]);
    expect([...model.cells.values()][0]).toMatchObject({
      state: "duplicate", allocated: null, capacity: null, nonworking: false, highlighted: false,
      highlightAllocated: undefined, highlightCapacity: undefined
    });
  });
  it("preserves scale-invariant FTE/hour utilization and never spreads partial-period capacity", () => {
    expect(account(0.75, 0.5)).toMatchObject({ state: "overload", utilization: 1.5 });
    expect(account(30, 20)).toMatchObject({ state: "overload", utilization: 1.5, overload: 10 });
    expect(account(6, 4, 1)).toMatchObject({ state: "overload", capacity: 4, overload: 2 });
    expect(account(6, null, 1)).toMatchObject({ state: "missing", utilization: null });
  });
  it("accounts for every displayed Cartesian cell in exception summaries, without inventing missing amounts", () => {
    const model = buildModel([
      makeRow({ allocated: 12, capacity: 10 }),
      makeRow({ resource: { key: "r2", label: "B" }, period: { key: "p2", label: "P2" }, allocated: null }),
      makeRow({ resource: { key: "r2", label: "B" }, period: { key: "p3", label: "P3" }, allocated: 0, capacity: 0 })
    ]);
    expect(summarize(model)).toEqual({ overloads: 1, unknown: 4, valid: 2 });
  });
  it("date ordering is authoritative even when an irrelevant label-order measure is blank", () => {
    const view = makeView({
      periods: [new Date(2026, 8, 9), new Date(2026, 8, 1)], periodOrder: [null, null],
      sources: { period: { type: { dateTime: true }, format: "yyyy-MM-dd" } }
    });
    const result = readData(view, makeHost().host);
    expect(result.error).toBeUndefined();
    expect(result.model.periods.map(p => p.label)).toEqual(["2026-09-01", "2026-09-09"]);
  });
  it("does not offer a selection for a builder result lacking a native identity", () => {
    const host = makeHost();
    const builder = host.createSelectionIdBuilder();
    const id = makeSelectionId("empty");
    id.hasIdentity = () => false;
    builder.createSelectionId.mockReturnValue(id);
    host.createSelectionIdBuilder.mockReturnValue(builder);
    const result = readData(makeView(), host.host);
    expect([...result.model.cells.values()].every(c => c.identity === undefined)).toBe(true);
  });
  it("discloses distinct model keys that collapse to identical formatted labels", () => {
    const result = readData(makeView({
      resources: [1.01, 1.02], periods: ["P", "P"],
      sources: { resource: { type: { numeric: true }, format: "0.0" } }
    }), makeHost().host);
    expect(result.ambiguousLabels).toBe(true);
    expect(result.model.resources.map(r => r.rawLabel)).toEqual(["1.01", "1.02"]);
  });
});

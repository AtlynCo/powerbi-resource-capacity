import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildModel, resourceTotal, type InputRow } from "../src/model";

const root = join("samples", "AtlynResourceCapacity");
const cases = [
  { table: "People", csv: "people-hours-by-week.csv", page: "PeopleWeekly", visual: "PeopleTable", count: 12 },
  { table: "Machines", csv: "machine-hours-by-day.csv", page: "MachinesDaily", visual: "MachinesTable", count: 15 }
];
const source = (table: string): string => readFileSync(join(root, "AtlynResourceCapacity.SemanticModel", "definition", "tables", `${table}.tmdl`), "utf8");
function rows(csv: string): InputRow<never>[] {
  return readFileSync(join("samples", csv), "utf8").trim().split(/\r?\n/).slice(1).map(line => {
    const [resource, period, allocated, capacity, order, nonworking] = line.split(",");
    if (!resource || !period) throw new Error("Invalid sample CSV key");
    return {
      resource: { key: resource, label: resource }, period: { key: period, label: period, order: Number(order) },
      allocated: Number(allocated), capacity: capacity === "" ? null : Number(capacity), nonworking: Number(nonworking),
      allocatedText: allocated ?? "", capacityText: capacity ?? "", highlighted: false, tooltips: []
    };
  });
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(records);
  return record(value) ? [value, ...Object.values(value).flatMap(records)] : [];
}

describe("sanitized offline sample source", () => {
  it.each(cases)("$table CSV matches its literal M rows without external refresh sources", ({ table, csv, count }) => {
    const text = source(table);
    const csvRows = readFileSync(join("samples", csv), "utf8").trim().split(/\r?\n/).slice(1);
    const mRows = [...text.matchAll(/\{"([^"]+)", #date\((\d+), (\d+), (\d+)\), ([^}]+)\}/g)].map(m =>
      [m[1], `${m[2]}-${m[3]!.padStart(2, "0")}-${m[4]!.padStart(2, "0")}`,
        ...m[5]!.split(",").map(value => value.trim() === "null" ? "" : value.trim())].join(","));
    expect(csvRows).toHaveLength(count);
    expect(mRows).toEqual(csvRows);
    expect(text).not.toMatch(/Web\.Contents|File\.Contents|Sql\.Database|OData|https?:\/\//);
    const model = buildModel(rows(csv));
    expect(model.duplicateCount).toBe(0);
    expect(model.invalidCount).toBe(0);
    expect(model.resources).toHaveLength(3);
    expect(model.cells.size).toBe(model.resources.length * model.periods.length);
  });
  it("keeps measure names unique across the entire semantic model", () => {
    const names = cases.flatMap(c => [...source(c.table).matchAll(/^\tmeasure '([^']+)'/gm)].map(m => m[1]!.toLowerCase()));
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(names.length);
  });
  it.each(cases)("$table native PBIR measure references resolve after sample naming changes", ({ table, page, visual }) => {
    const json: unknown = JSON.parse(readFileSync(join(root, "AtlynResourceCapacity.Report", "definition", "pages", page, "visuals", visual, "visual.json"), "utf8"));
    const measures = new Set([...source(table).matchAll(/^\tmeasure '([^']+)'/gm)].map(m => m[1]));
    const refs = records(json).filter(node => record(node.Measure)).map(node => node.Measure).filter(record);
    expect(refs).toHaveLength(5);
    for (const ref of refs) {
      expect(measures.has(String(ref.Property))).toBe(true);
      if (!record(ref.Expression) || !record(ref.Expression.SourceRef)) throw new Error("Missing measure source");
      expect(ref.Expression.SourceRef.Entity).toBe(table);
    }
  });
  it("allows complete people row totals while suppressing the resource with missing capacity", () => {
    const model = buildModel(rows("people-hours-by-week.csv"));
    expect(resourceTotal(model, "P01 Planner A", true)).toMatchObject({ allocated: 112, capacity: 120 });
    expect(resourceTotal(model, "P02 Planner B", true)).toMatchObject({ allocated: 72, capacity: 112 });
    expect(resourceTotal(model, "P03 Analyst C", true)).toBeUndefined();
    expect(resourceTotal(model, "P01 Planner A", false)).toBeUndefined();
  });
  it("matches the documented machine totals, but suppresses all totals for partial host delivery", () => {
    const input = rows("machine-hours-by-day.csv"), model = buildModel(input);
    for (const [resource, allocated, capacity] of [["M01 Mill A", 54, 60], ["M02 Lathe B", 50, 76], ["M03 Press C", 56, 80]] as const) {
      expect(resourceTotal(model, resource, true)).toMatchObject({ allocated, capacity });
      expect(resourceTotal(buildModel(input, true), resource, true)).toBeUndefined();
    }
  });
});

import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import capabilities from "../capabilities.json";
import config from "../pbiviz.json";

const source = resolve("samples", "AtlynResourceCapacity");
const scratch = resolve("dist", "sample-binding-tests", randomUUID());
const resourceFile = `resources/${config.visual.guid}.pbiviz.json`;
const gridPath = join("AtlynResourceCapacity.Report", "definition", "pages", "PeopleCapacity", "visuals", "PeopleCapacityGrid", "visual.json");
function copySource(name: string): string {
  const parent = join(scratch, name), copiedRoot = join(parent, "AtlynResourceCapacity");
  cpSync(source, copiedRoot, { recursive: true });
  for (const csv of ["people-hours-by-week.csv", "machine-hours-by-day.csv"]) cpSync(join("samples", csv), join(parent, csv));
  return copiedRoot;
}

// A labeled test fixture, never a release package or the default generated sample.
function fixture() {
  const manifest = {
    version: config.visual.version, visual: config.visual,
    resources: [{ resourceId: "rId0", sourceType: 5, file: resourceFile }],
    metadata: { pbivizjson: { resourceId: "rId0" } }
  };
  const visual = {
    visual: config.visual, capabilities, externalJS: [] as string[],
    content: { js: "/* SYNTHETIC BINDING TEST FIXTURE — NOT THE VISUAL */", css: "/* test fixture */", iconBase64: "fixture" },
    stringResources: { "en-US": { Fixture: "test-only" } }
  };
  const entries: Record<string, Uint8Array> = {
    "package.json": strToU8(JSON.stringify(manifest)),
    "resources/": new Uint8Array(),
    [resourceFile]: strToU8(JSON.stringify(visual))
  };
  return { path: join(scratch, "synthetic-test-only.pbiviz"), manifest, visual, entries, bytes: zipSync(entries) };
}
type TestPackage = ReturnType<typeof fixture>;
interface BindingManifest {
  packageSha256: string;
  version: string;
  guid: string;
  embeddedPackage: string;
  schemaValidation: { status: string };
  nativeValidation: string;
  files: { path: string; bytes: number; sha256: string }[];
}
interface BindingModule {
  packageBinding(pkg: TestPackage): unknown;
  validateSource(root?: string, capabilities?: unknown): { data: { table: string; rows: number; periods: number }[]; documents: unknown[] };
  bindSamples(options: { pkg: TestPackage; output: string }): Promise<BindingManifest>;
  verifyBoundSample(output: string, pkg: TestPackage): BindingManifest;
  sha256(bytes: Uint8Array): string;
}
let binding: BindingModule;
beforeAll(async () => {
  const moduleUrl = pathToFileURL(resolve("scripts", "bind-samples.mjs")).href;
  binding = await import(moduleUrl) as BindingModule;
  mkdirSync(scratch, { recursive: true });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("fully bound offline PBIP sample", () => {
  it("resolves all seven roles, hours formatting, four pages and the literal offline model", () => {
    const checked = binding.validateSource();
    expect(checked.data).toMatchObject([
      { table: "People", rows: 12, periods: 4 },
      { table: "Machines", rows: 15, periods: 5 }
    ]);
    expect(checked.documents).toHaveLength(14);
  });

  it("rejects a period hierarchy in place of the sample's direct Period column", () => {
    const copiedRoot = copySource("period-hierarchy");
    const visualPath = join(copiedRoot, gridPath);
    const container = JSON.parse(readFileSync(visualPath, "utf8"));
    const projection = container.visual.query.queryState.period.projections[0];
    expect(projection.field).toEqual({ Column: { Expression: { SourceRef: { Entity: "People" } }, Property: "Period" } });
    projection.field = { HierarchyLevel: { Expression: projection.field, Level: "Day" } };
    writeFileSync(visualPath, JSON.stringify(container));
    expect(() => binding.validateSource(copiedRoot)).toThrow();
  });

  it("uses the observed private CustomVisualMetadata registration, not a store or native placeholder", () => {
    expect(binding.packageBinding(fixture())).toEqual({
      name: config.visual.guid, type: "CustomVisual",
      items: [{ name: `${config.visual.guid}.pbiviz.json`, path: `${config.visual.guid}.pbiviz.json`, type: "CustomVisualMetadata" }]
    });
  });

  it("copies package bytes exactly and verifies deterministic output without a network or build", async () => {
    const pkg = fixture(), output = join(scratch, "generated");
    const first = await binding.bindSamples({ pkg, output });
    const firstBytes = readFileSync(join(output, "binding-manifest.json"));
    expect(first.packageSha256).toBe(binding.sha256(pkg.bytes));
    expect(first.guid).toBe(config.visual.guid);
    expect(first.version).toBe(config.visual.version);
    expect(first.schemaValidation.status).toBe("not-run");
    expect(first.nativeValidation).toMatch(/^NOT RUN:/);
    for (const name of ["package.json", resourceFile]) {
      expect(readFileSync(join(output, first.embeddedPackage, ...name.split("/")))).toEqual(Buffer.from(pkg.entries[name]!));
    }
    expect(binding.verifyBoundSample(output, pkg)).toEqual(first);
    writeFileSync(join(output, "binding-manifest.json"), JSON.stringify({ ...first, version: "invented" }));
    expect(() => binding.verifyBoundSample(output, pkg)).toThrow(/manifest version differs/);
    await binding.bindSamples({ pkg, output });
    expect(readFileSync(join(output, "binding-manifest.json"))).toEqual(firstBytes);
  });

  it("rejects a stale package and detects changes to the embedded runtime and bound queries", async () => {
    const pkg = fixture(), output = join(scratch, "tamper");
    const result = await binding.bindSamples({ pkg, output });
    expect(() => binding.verifyBoundSample(output, { ...pkg, bytes: strToU8("a different archive") })).toThrow(/hash is stale/);
    const resource = join(output, result.embeddedPackage, ...resourceFile.split("/"));
    writeFileSync(resource, "{}");
    expect(() => binding.verifyBoundSample(output, pkg)).toThrow(/not byte-exact/);
    writeFileSync(resource, pkg.entries[resourceFile]!);
    writeFileSync(join(output, "AtlynResourceCapacity", gridPath), "{}");
    expect(() => binding.verifyBoundSample(output, pkg)).toThrow(/Bound file (size|hash) changed/);
  });

  it("fails before writing for mismatched GUIDs, unknown resource layouts and external code", async () => {
    const output = join(scratch, "must-not-exist");
    const wrongGuid = fixture();
    wrongGuid.manifest = { ...wrongGuid.manifest, visual: { ...wrongGuid.manifest.visual, guid: "WrongGuid" } };
    await expect(binding.bindSamples({ pkg: wrongGuid, output })).rejects.toThrow(/GUID/);
    expect(existsSync(output)).toBe(false);
    const unknownLayout = fixture();
    unknownLayout.manifest.resources[0]!.sourceType = 7;
    expect(() => binding.packageBinding(unknownLayout)).toThrow(/layout/);
    const external = fixture();
    external.visual.externalJS = ["https://example.invalid/runtime.js"];
    expect(() => binding.packageBinding(external)).toThrow(/external JavaScript/);
    const missingRuntime = fixture();
    missingRuntime.visual.content.js = "";
    expect(() => binding.packageBinding(missingRuntime)).toThrow(/compiled JavaScript/);
  });

  it.each(["../escape.js", "/absolute.js", "C:/escape.js", "resources\\escape.js"])("rejects unsafe package entry %s", name => {
    const pkg = fixture();
    pkg.entries[name] = strToU8("must not be written");
    expect(() => binding.packageBinding(pkg)).toThrow(/Unsafe or unsupported/);
  });

  it("rejects unknown extra resources rather than guessing their serialization", () => {
    const pkg = fixture();
    pkg.entries["resources/extra.js"] = strToU8("unsupported");
    expect(() => binding.packageBinding(pkg)).toThrow(/Unsupported extra archive resource/);
  });

  it("does not permit output outside a child directory of this repository's dist", async () => {
    await expect(binding.bindSamples({ pkg: fixture(), output: source })).rejects.toThrow(/child.*dist/);
    await expect(binding.bindSamples({ pkg: fixture(), output: resolve("dist") })).rejects.toThrow(/child.*dist/);
  });

  it("rejects unresolved fields and incompatible units in copied templates", () => {
    const copiedRoot = copySource("source-copy");
    const visualPath = join(copiedRoot, gridPath), original = readFileSync(visualPath, "utf8");
    writeFileSync(visualPath, original.replace('"Property": "Allocated hours"', '"Property": "Missing measure"'));
    expect(() => binding.validateSource(copiedRoot)).toThrow(/unresolved Measure/);
    writeFileSync(visualPath, original.replace("'hours'", "'percent'"));
    expect(() => binding.validateSource(copiedRoot)).toThrow();
  });
  it("rejects missing or incompatible PBIR version metadata before generation", () => {
    const copiedRoot = copySource("version-risk");
    const version = join(copiedRoot, "AtlynResourceCapacity.Report", "definition", "version.json");
    rmSync(version);
    expect(() => binding.validateSource(copiedRoot)).toThrow(/version.json is required/);
    writeFileSync(version, JSON.stringify({ version: "invented" }));
    expect(() => binding.validateSource(copiedRoot)).toThrow(/Unsupported PBIR definition version/);
  });
  it("rejects indented or missing top-level TMDL table references", () => {
    const copiedRoot = copySource("reference-risk");
    const model = join(copiedRoot, "AtlynResourceCapacity.SemanticModel", "definition", "model.tmdl");
    const original = readFileSync(model, "utf8");
    writeFileSync(model, original.replace(/^ref table /gm, "\tref table "));
    expect(() => binding.validateSource(copiedRoot)).toThrow(/must be top-level/);
    writeFileSync(model, original.replace(/^ref table Machines\r?$/m, ""));
    expect(() => binding.validateSource(copiedRoot)).toThrow(/both top-level table references/);
  });
});

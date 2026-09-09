import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readPackage } from "./package-lib.mjs";

export const sampleName = "AtlynResourceCapacity";
const reportName = `${sampleName}.Report`;
const modelName = `${sampleName}.SemanticModel`;
const sourceRoot = resolve("samples", sampleName);
const defaultOutput = resolve("dist", "sample");
const guid = "AtlynResourceCapacityC72F07AC931A4BD196369E890FA879E2";
const scenarios = [
  { table: "People", page: "PeopleCapacity", native: "PeopleWeekly", csv: "people-hours-by-week.csv", count: 12, periods: 4, prefix: "" },
  { table: "Machines", page: "MachinesCapacity", native: "MachinesDaily", csv: "machine-hours-by-day.csv", count: 15, periods: 5, prefix: "Machine " }
];
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const portable = path => path.split(sep).join("/");
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const records = value => Array.isArray(value) ? value.flatMap(records) :
  isObject(value) ? [value, ...Object.values(value).flatMap(records)] : [];

function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))
    .filter(entry => !entry.name.startsWith("."))
    .flatMap(entry => {
      assert.ok(!entry.isSymbolicLink(), "Sample inputs must not contain symbolic links");
      const path = join(root, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    });
}

function archivePath(name) {
  const parts = name.replace(/\/$/, "").split("/");
  assert.ok(parts.every(part => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== "." && part !== ".."),
    `Unsafe or unsupported package entry: ${name}`);
  return join(...parts);
}

export function packageBinding(pkg) {
  assert.equal(pkg.manifest.visual.guid, guid, "Package GUID does not match the bound sample templates");
  assert.equal(pkg.visual.visual.guid, guid, "Packaged metadata GUID mismatch");
  assert.equal(pkg.visual.visual.version, pkg.manifest.visual.version, "Packaged metadata version mismatch");
  assert.equal(pkg.manifest.version, pkg.manifest.visual.version, "Package manifest version mismatch");
  assert.equal(pkg.manifest.resources.length, 1, "Unsupported package resource layout; establish its PBIR mapping before binding");
  const resource = pkg.manifest.resources[0];
  assert.equal(resource.sourceType, 5, "Only the documented embedded visual-metadata layout is supported");
  assert.equal(resource.file, `resources/${guid}.pbiviz.json`, "Unexpected visual-metadata resource path");
  assert.equal(pkg.manifest.metadata.pbivizjson.resourceId, resource.resourceId);
  assert.ok(pkg.entries["package.json"] && pkg.entries[resource.file], "Missing package manifest or compiled resource");
  assert.ok(typeof pkg.visual.content.js === "string" && pkg.visual.content.js.length > 0, "Missing compiled JavaScript");
  assert.ok(typeof pkg.visual.content.css === "string" && pkg.visual.content.css.length > 0, "Missing compiled CSS");
  assert.ok(typeof pkg.visual.content.iconBase64 === "string" && pkg.visual.content.iconBase64.length > 0, "Missing embedded icon");
  assert.deepEqual(pkg.visual.externalJS, [], "Offline sample cannot reference external JavaScript");
  for (const name of Object.keys(pkg.entries)) {
    archivePath(name);
    assert.ok(name.endsWith("/") || name === "package.json" || name === resource.file,
      `Unsupported extra archive resource: ${name}`);
  }
  return {
    name: guid, type: "CustomVisual",
    items: [{ name: basename(resource.file), path: basename(resource.file), type: "CustomVisualMetadata" }]
  };
}

export function validateSource(root = sourceRoot, capabilities = json("capabilities.json")) {
  const project = json(join(root, `${sampleName}.pbip`));
  assert.deepEqual(project.artifacts, [{ report: { path: reportName } }], "Project must reference only the local report");
  const reportRoot = join(root, reportName);
  const reference = json(join(reportRoot, "definition.pbir")).datasetReference;
  assert.deepEqual(reference, { byPath: { path: `../${modelName}` } }, "Sample must reference the offline local model");
  assert.ok(existsSync(join(root, modelName, "definition.pbism")));
  const definitions = join(reportRoot, "definition");
  const report = json(join(definitions, "report.json"));
  assert.ok(!report.publicCustomVisuals?.length && !report.organizationCustomVisuals?.length,
    "Sample must use a private embedded visual, not a store download");
  const pages = json(join(definitions, "pages", "pages.json"));
  assert.deepEqual(pages.pageOrder, ["PeopleCapacity", "PeopleWeekly", "MachinesCapacity", "MachinesDaily"]);
  assert.equal(pages.activePageName, "PeopleCapacity");
  const tables = new Map(), globalMeasures = new Set(), data = [];
  for (const scenario of scenarios) {
    const text = readFileSync(join(root, modelName, "definition", "tables", `${scenario.table}.tmdl`), "utf8");
    assert.match(text, /mode: import/);
    assert.match(text, /Source = #table\(/);
    assert.doesNotMatch(text, /Web\.Contents|File\.Contents|Sql\.Database|OData|https?:\/\//i);
    const measures = [...text.matchAll(/^\tmeasure '([^']+)'/gm)].map(match => match[1]);
    const columns = [...text.matchAll(/^\tcolumn (\w+)/gm)].map(match => match[1]);
    for (const measure of measures) {
      assert.ok(!globalMeasures.has(measure.toLowerCase()), `Duplicate model measure: ${measure}`);
      globalMeasures.add(measure.toLowerCase());
    }
    tables.set(scenario.table, { Measure: new Set(measures), Column: new Set(columns) });
    const rows = [...text.matchAll(/\{"([^"]+)", #date\((\d+), (\d+), (\d+)\), ([^}]+)\}/g)].map(match =>
      [match[1], `${match[2]}-${match[3].padStart(2, "0")}-${match[4].padStart(2, "0")}`,
        ...match[5].split(",").map(value => value.trim() === "null" ? "" : value.trim())]);
    const csv = readFileSync(join(dirname(root), scenario.csv), "utf8").trim().split(/\r?\n/).slice(1);
    assert.deepEqual(rows.map(row => row.join(",")), csv, `${scenario.table}: CSV and literal M data disagree`);
    assert.equal(rows.length, scenario.count);
    assert.equal(new Set(rows.map(row => `${row[0]}|${row[1]}`)).size, scenario.count);
    assert.equal(new Set(rows.map(row => row[0])).size, 3);
    assert.equal(new Set(rows.map(row => row[1])).size, scenario.periods);
    const orders = new Map();
    for (const row of rows) {
      assert.equal(row.length, 7);
      for (const index of [2, 3, 4, 5, 6]) {
        if (index === 3 && row[index] === "") continue;
        assert.ok(row[index] !== "" && Number.isFinite(Number(row[index])) && Number(row[index]) >= 0);
      }
      assert.ok(row[5] === "0" || row[5] === "1");
      assert.ok(!orders.has(row[1]) || orders.get(row[1]) === row[4]);
      orders.set(row[1], row[4]);
    }
    assert.equal(new Set(orders.values()).size, scenario.periods);
    data.push({ table: scenario.table, rows: rows.length, resources: 3, periods: scenario.periods, csv: scenario.csv });
  }
  const documents = filesUnder(root).filter(path => /\.(json|pbip|pbir|pbism)$/.test(path) &&
    !relative(root, path).split(sep).includes("CustomVisuals"))
    .map(path => ({ path, document: json(path) }));
  for (const { path, document } of documents) {
    assert.ok(typeof document.$schema === "string", `${path}: missing official schema reference`);
    for (const node of records(document)) {
      for (const kind of ["Measure", "Column"]) {
        if (!node[kind]) continue;
        const field = node[kind], table = tables.get(field.Expression?.SourceRef?.Entity);
        assert.ok(table?.[kind].has(field.Property), `${path}: unresolved ${kind} ${field.Property}`);
      }
    }
  }
  for (const scenario of scenarios) {
    const pageRoot = join(definitions, "pages", scenario.page);
    const page = json(join(pageRoot, "page.json"));
    assert.equal(page.name, scenario.page);
    assert.equal(page.width, 1280);
    assert.equal(page.height, 720);
    const container = json(join(pageRoot, "visuals", `${scenario.table}CapacityGrid`, "visual.json"));
    const { visual, position } = container;
    assert.equal(visual.visualType, guid, "A bound page must contain the actual custom visual");
    assert.deepEqual(position, { x: 32, y: 32, z: 0, width: 1216, height: 640, tabOrder: 0 });
    assert.ok(position.x + position.width <= page.width && position.y + position.height <= page.height);
    const state = visual.query.queryState;
    const roles = capabilities.dataRoles.map(role => role.name).sort();
    assert.deepEqual(Object.keys(state).sort(), roles, "Role bindings must match the compiled capabilities");
    const names = {
      resource: ["Resource"], period: ["Period"],
      allocated: [`${scenario.prefix}${scenario.prefix ? "allocated" : "Allocated"} hours`],
      capacity: [`${scenario.prefix}${scenario.prefix ? "available" : "Available"} hours`],
      periodOrder: [`${scenario.prefix}${scenario.prefix ? "period" : "Period"} order`],
      nonworking: [`${scenario.prefix}${scenario.prefix ? "nonworking" : "Nonworking"} flag`],
      tooltips: [`${scenario.prefix}${scenario.prefix ? "assignment" : "Assignment"} count`, `${scenario.prefix}${scenario.prefix ? "source" : "Source"} rows`]
    };
    for (const role of capabilities.dataRoles) {
      const kind = role.kind === "Grouping" ? "Column" : "Measure";
      const projections = state[role.name].projections;
      assert.deepEqual(projections.map(projection => projection.field[kind]?.Property), names[role.name]);
      for (const projection of projections) {
        assert.equal(projection.field[kind].Expression.SourceRef.Entity, scenario.table);
        assert.equal(projection.queryRef, `${scenario.table}.${projection.field[kind].Property}`);
      }
    }
    const analysis = visual.objects.analysis[0].properties;
    assert.equal(analysis.unit.expr.Literal.Value, "'hours'");
    assert.equal(analysis.additiveTotals.expr.Literal.Value, "true");
    for (const [objectName, instances] of Object.entries(visual.objects)) {
      const properties = capabilities.objects[objectName]?.properties;
      assert.ok(properties, `Unknown compiled formatting object: ${objectName}`);
      for (const instance of instances) {
        for (const property of Object.keys(instance.properties)) assert.ok(properties[property], `Unknown compiled property: ${property}`);
      }
    }
    const nativePageRoot = join(definitions, "pages", scenario.native);
    assert.equal(json(join(nativePageRoot, "page.json")).name, scenario.native);
    const nativeVisual = json(join(nativePageRoot, "visuals", `${scenario.table}Table`, "visual.json"));
    assert.equal(nativeVisual.visual.visualType, "tableEx", "Keep the native comparison table");
  }
  return { report, documents, data };
}

export async function validateSchemas(documents) {
  const { default: Ajv } = await import("ajv");
  const schemas = new Map();
  const loadSchema = async url => {
    assert.match(url, /^https:\/\/developer\.microsoft\.com\/json-schemas\/fabric\//, "Only official Microsoft schemas are fetched");
    const response = await globalThis.fetch(url);
    assert.ok(response.ok, `Schema download failed: ${url} (${response.status})`);
    const text = await response.text(), schema = JSON.parse(text);
    schemas.set(url, sha256(text));
    return schema;
  };
  const ajv = new Ajv({ allErrors: true, strict: false, loadSchema, logger: false });
  for (const { path, document } of documents) {
    const validate = await ajv.compileAsync({ $ref: document.$schema });
    assert.ok(validate(document), `${path}: ${ajv.errorsText(validate.errors)}`);
  }
  return { status: "passed", documents: documents.length,
    schemas: [...schemas].sort(([a], [b]) => a.localeCompare(b, "en")).map(([url, hash]) => ({ url, sha256: hash })) };
}

export function verifyBoundSample(output = defaultOutput, pkg = readPackage()) {
  const manifest = json(join(output, "binding-manifest.json"));
  assert.equal(manifest.packageSha256, sha256(pkg.bytes), "Bound sample package hash is stale");
  assert.equal(manifest.guid, guid, "Bound sample manifest GUID differs");
  assert.equal(manifest.version, pkg.manifest.visual.version, "Bound sample manifest version differs");
  assert.equal(manifest.packageBytes, pkg.bytes.length, "Bound sample manifest package size differs");
  assert.equal(manifest.packageFile, basename(pkg.path), "Bound sample manifest package filename differs");
  assert.equal(manifest.project, `${sampleName}/${sampleName}.pbip`);
  assert.equal(manifest.embeddedPackage, `${sampleName}/${reportName}/CustomVisuals/${guid}`);
  const expectedBinding = packageBinding(pkg);
  assert.deepEqual(manifest.resourcePackages, [expectedBinding]);
  const projectRoot = join(output, sampleName);
  const report = json(join(projectRoot, reportName, "definition", "report.json"));
  assert.deepEqual(report.resourcePackages, [expectedBinding]);
  const resourceRoot = join(projectRoot, reportName, "CustomVisuals", guid);
  const entryNames = Object.keys(pkg.entries).filter(name => !name.endsWith("/")).sort();
  assert.deepEqual(filesUnder(resourceRoot).map(path => portable(relative(resourceRoot, path))).sort(), entryNames);
  for (const name of entryNames) {
    assert.deepEqual(readFileSync(join(resourceRoot, archivePath(name))), Buffer.from(pkg.entries[name]),
      `Embedded package entry is not byte-exact: ${name}`);
  }
  for (const entry of manifest.files) {
    const bytes = readFileSync(join(output, archivePath(entry.path)));
    assert.equal(bytes.length, entry.bytes, `Bound file size changed: ${entry.path}`);
    assert.equal(sha256(bytes), entry.sha256, `Bound file hash changed: ${entry.path}`);
  }
  assert.deepEqual(filesUnder(output).map(path => portable(relative(output, path))).filter(path => path !== "binding-manifest.json").sort(),
    manifest.files.map(file => file.path).sort(), "Bound sample inventory changed");
  validateSource(projectRoot, pkg.visual.capabilities);
  return manifest;
}

export async function bindSamples({ output = defaultOutput, checkSchemas = false, pkg = readPackage() } = {}) {
  output = resolve(output);
  const outputRelative = relative(resolve("dist"), output);
  assert.ok(outputRelative && !outputRelative.startsWith("..") && !outputRelative.includes(":"),
    "Generated sample output must be a child of this repository's dist directory");
  const binding = packageBinding(pkg);
  const source = validateSource(sourceRoot, pkg.visual.capabilities);
  assert.deepEqual(source.report.resourcePackages, [binding], "Source template resource registration differs from the compiled package");
  const schemaValidation = checkSchemas ? await validateSchemas(source.documents) :
    { status: "not-run", reason: "Offline binding; use --validate-schemas for official online JSON Schema validation." };
  const inputs = filesUnder(sourceRoot).map(path => ({ path: relative(sourceRoot, path), bytes: readFileSync(path) }));
  rmSync(output, { recursive: true, force: true });
  const projectRoot = join(output, sampleName);
  for (const input of inputs) {
    const target = join(projectRoot, input.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, input.bytes);
  }
  for (const name of ["README.md", ...scenarios.map(scenario => scenario.csv)]) {
    writeFileSync(join(output, name), readFileSync(join("samples", name)));
  }
  mkdirSync(join(output, "docs"), { recursive: true });
  writeFileSync(join(output, "docs", "sample-binding.md"), readFileSync(join("docs", "sample-binding.md")));
  const resourceRoot = join(projectRoot, reportName, "CustomVisuals", guid);
  for (const [name, bytes] of Object.entries(pkg.entries)) {
    const target = join(resourceRoot, archivePath(name));
    if (name.endsWith("/")) mkdirSync(target, { recursive: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
  }
  const manifest = {
    schemaVersion: 1, packageSha256: sha256(pkg.bytes), packageFile: basename(pkg.path), packageBytes: pkg.bytes.length,
    guid, version: pkg.manifest.visual.version,
    project: `${sampleName}/${sampleName}.pbip`,
    embeddedPackage: `${sampleName}/${reportName}/CustomVisuals/${guid}`,
    resourcePackages: [binding], pages: source.data, schemaValidation,
    checks: { localReferences: "passed", literalData: "passed", exactPackageEntries: "passed" },
    nativeValidation: "NOT RUN: no Desktop M/DAX execution, open/refresh/save/reopen, service, export, or certification validation.",
    files: filesUnder(output).map(path => {
      const bytes = readFileSync(path);
      return { path: portable(relative(output, path)), bytes: bytes.length, sha256: sha256(bytes) };
    })
  };
  writeJson(join(output, "binding-manifest.json"), manifest);
  try {
    verifyBoundSample(output, pkg);
  } catch (error) {
    rmSync(join(output, "binding-manifest.json"), { force: true });
    throw error;
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => ["--validate-schemas", "--verify"].includes(arg)), "Usage: node scripts\\bind-samples.mjs [--validate-schemas | --verify]");
  assert.ok(!(args.includes("--verify") && args.includes("--validate-schemas")), "--verify does not regenerate or fetch schemas");
  const manifest = args.includes("--verify") ? verifyBoundSample() : await bindSamples({ checkSchemas: args.includes("--validate-schemas") });
  console.log(JSON.stringify({ output: defaultOutput, project: manifest.project, version: manifest.version,
    packageSha256: manifest.packageSha256, schemaValidation: manifest.schemaValidation.status,
    nativeValidation: manifest.nativeValidation }, null, 2));
}

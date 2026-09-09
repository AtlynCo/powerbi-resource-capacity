import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { readJson, readPackage } from "./package-lib.mjs";
import { buildInputs, sha256 } from "./stamp-build.mjs";
import { verifyBoundSample } from "./bind-samples.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(git("status", "--porcelain"), "", "Commit reviewed source before freezing a release");
const commit = git("rev-parse", "HEAD"), config = readJson("pbiviz.json");
const { path, bytes } = readPackage(), hash = sha256(bytes);
const stamp = readJson("dist", "build-inputs.json");
assert.equal(stamp.packageSha256, hash, "Package changed after build fingerprint");
assert.deepEqual(buildInputs(), stamp.inputs, "Build inputs changed after compilation; rebuild and rerun local gates");
const gates = readJson("dist", "local-evidence", "gates.json");
assert.equal(gates.packageSha256, hash);
assert.equal(gates.performanceSkipped, false, "Final evidence requires performance samples");
assert.ok(gates.gates.length >= 11 && gates.gates.every(gate => gate.exitCode === 0));
for (const file of ["dist\\screenshots\\capture.json", "dist\\performance\\benchmark.json"]) {
  assert.equal(JSON.parse(readFileSync(file, "utf8")).packageSha256, hash, `${file}: stale package evidence`);
}
const captures = readJson("dist", "screenshots", "capture.json");
assert.ok(captures.listing.length >= 1 && captures.listing.length <= 5);
for (const capture of [...captures.captures, ...captures.listing]) {
  const image = readFileSync(join("dist", "screenshots", capture.file.replaceAll("/", "\\")));
  assert.equal(sha256(image), capture.sha256, "Screenshot changed after capture");
  assert.equal(image.readUInt32BE(16), capture.width);
  assert.equal(image.readUInt32BE(20), capture.height);
}
for (const capture of captures.listing) assert.ok(capture.bytes <= 1024 * 1024, "Listing PNG exceeds 1024 KiB");
const boundSample = verifyBoundSample();
assert.equal(boundSample.schemaValidation.status, "passed", "Final release requires official sample-schema evidence");
const output = resolve("artifacts", `release-${config.visual.version}-${hash.slice(0, 12)}-${commit.slice(0, 12)}`);
assert.ok(!existsSync(output), "Immutable release directory already exists; never overwrite a frozen release");
mkdirSync(output);
cpSync(path, join(output, basename(path)));
cpSync(`${path}.sha256`, join(output, `${basename(path)}.sha256`));
for (const folder of ["screenshots", "performance", "sample", "local-evidence"]) {
  cpSync(join("dist", folder), join(output, folder), { recursive: true, errorOnExist: true, force: false });
}
for (const file of ["assets\\icon.png", "assets\\icon-300.png", "dist\\build-inputs.json"]) cpSync(file, join(output, basename(file)));
execFileSync("git", ["archive", "--format=zip", `--output=${join(output, "source.zip")}`, commit]);
const files = [];
function inventory(folder) {
  for (const name of readdirSync(folder).sort()) {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) inventory(full);
    else {
      const contents = readFileSync(full);
      files.push({ path: relative(output, full).replaceAll("\\", "/"), bytes: contents.length, sha256: sha256(contents) });
    }
  }
}
inventory(output);
const manifest = {
  schemaVersion: 1, createdAt: new Date().toISOString(), repository: "AtlynCo/powerbi-resource-capacity",
  sourceCommit: commit, sourceBranch: git("branch", "--show-current"), guid: config.visual.guid,
  version: config.visual.version, apiVersion: config.apiVersion,
  toolchain: { ...readJson("package.json").devDependencies, node: gates.node, npm: gates.npm, powershell: gates.powershell },
  runtimeLibraries: readJson("package.json").dependencies,
  package: { file: basename(path), bytes: bytes.length, sha256: hash },
  scope: "Actual compiled package in local browser host mocks. NOT native Power BI or Microsoft certification.",
  blockers: ["Parent-owned Desktop/service/accessibility/export acceptance and real PBIX", "Owner legal, commercial, privacy and support approval", "Parent-owned Partner Center submission and final certification branch coordination"],
  files
};
const manifestPath = join(output, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
writeFileSync(join(output, "manifest.sha256"), `${sha256(readFileSync(manifestPath))}  manifest.json\n`, { flag: "wx" });
console.log(JSON.stringify({ output, sourceCommit: commit, packageSha256: hash, manifest: manifestPath }, null, 2));

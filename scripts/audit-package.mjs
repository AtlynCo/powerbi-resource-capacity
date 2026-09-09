import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import { readJson, readPackage } from "./package-lib.mjs";

const { path, bytes, visual, manifest, entries } = readPackage();
const config = readJson("pbiviz.json");
assert.equal(manifest.visual.guid, config.visual.guid);
assert.equal(manifest.visual.version, config.visual.version);
assert.equal(visual.visual.guid, config.visual.guid);
assert.deepEqual(visual.capabilities.privileges, []);
assert.equal(visual.capabilities.supportsKeyboardFocus, true);
assert.equal(visual.capabilities.supportsHighlight, true);
assert.equal(visual.apiVersion.split(".").slice(0, 2).join("."), "5.11");
assert.ok(visual.content.js.length > 10000 && visual.content.css.length > 100);
assert.ok(bytes.length < 4 * 1024 * 1024, "Package memory/size budget is 4 MiB");
assert.ok(Object.keys(entries).every(name => !/tool-home|cert|passphrase|\.pfx$|\.key$/i.test(name)), "Build-certificate material must never be packaged");
assert.ok(visual.content.css.includes("Permission is hereby granted"), "Runtime dependency license notice must survive packaging");
for (const [name, pattern] of [
  ["network APIs", /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/],
  ["dynamic evaluation", /\beval\s*\(|new\s+Function\s*\(/],
  ["unsafe DOM injection", /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/]
]) assert.ok(!pattern.test(visual.content.js), `${name} found in packaged JavaScript`);
assert.ok(!/@import|url\(\s*["']?https?:/i.test(visual.content.css), "External CSS asset");
const en = readJson("src", "strings.json");
const fr = readJson("stringResources", "fr-FR", "resources.resjson");
assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "Localization keys must match");
assert.deepEqual(visual.stringResources["en-US"], en, "English resources must be in the compiled package");
assert.deepEqual(visual.stringResources["fr-FR"], fr, "French resources must be in the compiled package");
const png = readFileSync("assets\\icon.png");
assert.equal(png.readUInt32BE(16), 20);
assert.equal(png.readUInt32BE(20), 20);
const largeIcon = readFileSync("assets\\icon-300.png");
assert.equal(largeIcon.readUInt32BE(16), 300);
assert.equal(largeIcon.readUInt32BE(20), 300);
const hash = createHash("sha256").update(bytes).digest("hex");
writeFileSync(`${path}.sha256`, `${hash}  ${path.split(/[\\/]/).pop()}\n`);
console.log(JSON.stringify({ package: path, bytes: bytes.length, sha256: hash, certification: "Engineering audit only; not Microsoft certification" }, null, 2));

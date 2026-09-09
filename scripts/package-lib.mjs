import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

export function readPackage() {
  const packages = readdirSync("dist").filter(file => file.endsWith(".pbiviz"));
  if (packages.length !== 1) throw new Error("Expected exactly one compiled .pbiviz in dist");
  const path = resolve("dist", packages[0]);
  const bytes = readFileSync(path);
  const entries = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(entries["package.json"]));
  const resource = manifest.resources.find(r => r.sourceType === 5);
  if (!resource || !entries[resource.file]) throw new Error("Missing packaged visual resource");
  const visual = JSON.parse(strFromU8(entries[resource.file]));
  return { path, bytes, manifest, visual, entries };
}
export const readJson = (...parts) => JSON.parse(readFileSync(join(...parts), "utf8"));

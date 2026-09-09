import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

export function readPackage() {
  const config = JSON.parse(readFileSync("pbiviz.json", "utf8"));
  const path = resolve("dist", `${config.visual.guid}.${config.visual.version}.pbiviz`);
  const bytes = readFileSync(path);
  const entries = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(entries["package.json"]));
  const resource = manifest.resources.find(r => r.sourceType === 5);
  if (!resource || !entries[resource.file]) throw new Error("Missing packaged visual resource");
  const visual = JSON.parse(strFromU8(entries[resource.file]));
  return { path, bytes, manifest, visual, entries };
}
export const readJson = (...parts) => JSON.parse(readFileSync(join(...parts), "utf8"));

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readPackage } from "./package-lib.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function buildInputs() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0").filter(name => name && /^(src\/|style\/|assets\/|stringResources\/|scripts\/|tests\/|samples\/|package(?:-lock)?\.json$|pbiviz\.json$|capabilities\.json$|tsconfig.*\.json$|eslint\.config\.mjs$|playwright\.config\.mjs$|vitest\.config\.ts$)/.test(name))
    .filter(name => existsSync(name.replaceAll("/", "\\")));
  return Object.fromEntries([...new Set(files)].sort().map(name => [name, sha256(readFileSync(name.replaceAll("/", "\\")))]));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { bytes } = readPackage();
  writeFileSync("dist\\build-inputs.json", JSON.stringify({
    packageSha256: sha256(bytes), builtAt: new Date().toISOString(), inputs: buildInputs()
  }, null, 2) + "\n");
}

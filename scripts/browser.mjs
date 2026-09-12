import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const temporary = resolve(".tmp", "browser-tmp");
mkdirSync(temporary, { recursive: true });
const result = spawnSync(process.execPath, [require.resolve("@playwright/test/cli"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || resolve(".tmp", "browsers"), TEMP: temporary, TMP: temporary }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

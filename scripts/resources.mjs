import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const strings = JSON.parse(readFileSync("src\\strings.json", "utf8"));
mkdirSync("stringResources\\en-US", { recursive: true });
writeFileSync("stringResources\\en-US\\resources.resjson", JSON.stringify(strings, null, 2) + "\n");

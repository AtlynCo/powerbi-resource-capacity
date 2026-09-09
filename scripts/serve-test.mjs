import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readPackage } from "./package-lib.mjs";
const { visual } = readPackage();
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/visual.css"></head>
<body style="margin:0"><div id="tile"></div><script src="/visual.js"></script><script src="/host.js"></script></body></html>`;
const routes = new Map([
  ["/", ["text/html", html]],
  ["/visual.js", ["text/javascript", visual.content.js]],
  ["/visual.css", ["text/css", visual.content.css]],
  ["/host.js", ["text/javascript", readFileSync("tests\\browser\\host.mjs", "utf8")]]
]);
export function startHarness() {
  const server = createServer((request, response) => {
  const route = routes.get(request.url);
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:");
  if (!route) { response.writeHead(404); response.end(); return; }
  response.setHeader("Content-Type", route[0]);
  response.end(route[1]);
  });
  server.listen(8793, "127.0.0.1");
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startHarness().on("listening", () => console.log("Compiled package harness: http://127.0.0.1:8793"));
}

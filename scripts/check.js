// Runs scripts/check-page.js inside the real page in headless Chromium and fails on any anomaly.
// Usage: npm run check. Set CHROME to the browser command if it is not "chromium", e.g.
// CHROME="flatpak run io.github.ungoogled_software.ungoogled_chromium" npm run check
const http = require("node:http");
const { execFile } = require("node:child_process");
const { readFileSync, statSync } = require("node:fs");
const { extname, join, resolve, sep } = require("node:path");

const root = resolve(__dirname, "..");
const appTag = '<script src="app.js" defer></script>';
const index = readFileSync(join(root, "index.html"), "utf8");
if (!index.includes(appTag)) throw new Error("The app.js <script> tag is missing from index.html.");
const page = index.replace(appTag, [
  appTag,
  '<script src="data/equipment.js" defer></script>',
  '<script src="data/augments.js" defer></script>',
  '<script src="data/bosses.js" defer></script>',
  '<script src="scripts/check-page.js" defer></script>'
].join("\n  "));

const types = {
  ".css": "text/css", ".gif": "image/gif", ".jpg": "image/jpeg", ".js": "text/javascript",
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2"
};

const server = http.createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (path === "/") return response.end(page);
  const file = resolve(root, `.${path}`);
  let isFile = false;
  try { isFile = file.startsWith(`${root}${sep}`) && statSync(file).isFile(); } catch {}
  if (!isFile) {
    response.statusCode = 404;
    return response.end();
  }
  response.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
  response.end(readFileSync(file));
});

server.listen(0, "127.0.0.1", () => {
  const [command, ...prefix] = (process.env.CHROME || "chromium").split(" ");
  const url = `http://127.0.0.1:${server.address().port}/`;
  const args = [...prefix, "--headless=new", "--disable-gpu", "--no-first-run", "--dump-dom", url];
  execFile(command, args, { maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (error, stdout) => {
    server.close();
    const match = stdout.match(/CHECK:([^:<]*):END/);
    if (!match) {
      console.error(error || "The page produced no result: app.js probably threw before the check ran.");
      process.exit(1);
    }
    const report = JSON.parse(decodeURIComponent(match[1]));
    const failures = ["errors", "nonFinite", "illegal", "overCap", "worse"].filter(key => report[key].length);
    console.log(`${report.ships} ships, ${report.runs} Optimize runs.`);
    for (const key of failures) {
      console.log(`\n${key} (${report[key].length}):`);
      for (const line of report[key].slice(0, 20)) console.log(`  ${line}`);
    }
    if (failures.length) process.exit(1);
    console.log("All checks passed.");
  });
});

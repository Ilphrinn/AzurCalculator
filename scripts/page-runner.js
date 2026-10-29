// Serves the app from the repository with extra scripts after app.js, loads it in headless Chromium
// and returns the serialized DOM. Shared by `npm run check` and the generators that need the app's
// own engine (scripts/import-specialties.js). Set CHROME to the browser command if it is not
// "chromium", e.g. CHROME="flatpak run io.github.ungoogled_software.ungoogled_chromium".
const http = require("node:http");
const { execFile } = require("node:child_process");
const { readFileSync, statSync } = require("node:fs");
const { extname, join, resolve, sep } = require("node:path");

const root = resolve(__dirname, "..");
const appTag = '<script src="app.js" defer></script>';
const types = {
  ".css": "text/css", ".gif": "image/gif", ".jpg": "image/jpeg", ".js": "text/javascript",
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2"
};

function runPage(extraScripts) {
  const index = readFileSync(join(root, "index.html"), "utf8");
  if (!index.includes(appTag)) throw new Error("The app.js <script> tag is missing from index.html.");
  const page = index.replace(appTag, [appTag, ...extraScripts.map(src => `<script src="${src}" defer></script>`)].join("\n  "));

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

  return new Promise(done => {
    server.listen(0, "127.0.0.1", () => {
      const [command, ...prefix] = (process.env.CHROME || "chromium").split(" ");
      const url = `http://127.0.0.1:${server.address().port}/`;
      const args = [...prefix, "--headless=new", "--disable-gpu", "--no-first-run", "--dump-dom", url];
      execFile(command, args, { maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (error, stdout) => {
        server.close();
        done({ error, stdout: stdout || "" });
      });
    });
  });
}

// A page script writes its result as NAME:<URI-encoded JSON>:END, readable from the serialized DOM
// without HTML escaping.
function readMarker(stdout, name) {
  const match = stdout.match(new RegExp(`${name}:([^:<]*):END`));
  return match ? JSON.parse(decodeURIComponent(match[1])) : null;
}

module.exports = { runPage, readMarker };

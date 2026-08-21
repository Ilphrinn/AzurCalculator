const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { join, resolve, sep } = require("node:path");
const { transformSync } = require("esbuild");

const root = resolve(__dirname, "..");
const output = resolve(root, "dist");

if (!output.startsWith(`${root}${sep}`)) {
  throw new Error("Build output must stay inside the project directory.");
}

const inputs = ["index.html", "app.js", "style.css", "font-loader.js", "data", "assets", "_headers"];

for (const input of inputs) {
  const source = join(root, input);
  if (!existsSync(source)) throw new Error(`Missing build input: ${input}`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const input of inputs) {
  const source = join(root, input);
  cpSync(source, join(output, input), { recursive: statSync(source).isDirectory() });
}

const minifiedFiles = [
  ["style.css", "css"],
  ["font-loader.js", "js"],
  ["app.js", "js"],
  ["data/ships.js", "js"],
  ["data/equipment.js", "js"],
  ["data/default-equipment.js", "js"]
];

for (const [file, loader] of minifiedFiles) {
  const destination = join(output, file);
  const isDataScript = file.startsWith("data/");
  const result = transformSync(readFileSync(destination, "utf8"), {
    loader,
    format: loader === "js" && !isDataScript ? "esm" : undefined,
    minify: true,
    minifyIdentifiers: !isDataScript,
    treeShaking: false,
    sourcefile: file
  });
  writeFileSync(destination, result.code);
}

function fileCount(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => count + (entry.isDirectory() ? fileCount(join(directory, entry.name)) : 1),
    0
  );
}

const requiredOutputs = [
  "index.html",
  "app.js",
  "style.css",
  "font-loader.js",
  "data/ships.js",
  "assets/icon-small.png",
  "assets/header-background.jpg",
  "assets/thumbnails-card/1.jpg",
  "_headers"
];

for (const outputFile of requiredOutputs) {
  if (!existsSync(join(output, outputFile))) throw new Error(`Build output missing: ${outputFile}`);
}

console.log(`Built dist/ with ${fileCount(output)} files.`);

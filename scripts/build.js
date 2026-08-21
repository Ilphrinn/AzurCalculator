const { createHash } = require("node:crypto");
const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { basename, join, resolve, sep } = require("node:path");
const { transformSync } = require("esbuild");
const sharp = require("sharp");

const root = resolve(__dirname, "..");
const output = resolve(root, "dist");

if (!output.startsWith(`${root}${sep}`)) {
  throw new Error("Build output must stay inside the project directory.");
}

const inputs = ["index.html", "app.js", "style.css", "data", "assets", "_headers"];

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
    sourcemap: loader === "js" ? "external" : false,
    treeShaking: false,
    sourcefile: file
  });
  if (loader === "js") {
    const mapName = `${basename(file)}.map`;
    writeFileSync(destination, `${result.code}\n//# sourceMappingURL=${mapName}\n`);
    writeFileSync(`${destination}.map`, result.map);
  } else {
    writeFileSync(destination, result.code);
  }
}

async function buildImageVariants() {
  const sourceDirectory = join(root, "assets", "thumbnails-card");
  const outputDirectory = join(output, "assets", "thumbnails-card");
  const thumbnails = readdirSync(sourceDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".jpg"))
    .map(entry => entry.name);

  await sharp(join(root, "assets", "icon-small.png"))
    .resize(92, 84, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70, effort: 4 })
    .toFile(join(output, "assets", "icon-small.webp"));

  for (let index = 0; index < thumbnails.length; index += 8) {
    await Promise.all(thumbnails.slice(index, index + 8).flatMap(name => {
      const source = join(sourceDirectory, name);
      const outputName = name.replace(/\.jpg$/, ".webp");
      const highDensityOutputName = name.replace(/\.jpg$/, "@2x.webp");

      return [
        sharp(source)
          .resize(144, 192, { fit: "cover", position: "centre" })
          .webp({ quality: 78, effort: 4 })
          .toFile(join(outputDirectory, outputName)),
        sharp(source)
          .resize(288, 384, { fit: "cover", position: "centre" })
          .webp({ quality: 78, effort: 4 })
          .toFile(join(outputDirectory, highDensityOutputName))
      ];
    }));
  }

  const generatedCount = readdirSync(outputDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".webp")).length;
  const expectedCount = thumbnails.length * 2;
  if (generatedCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} WebP thumbnails, generated ${generatedCount}.`);
  }
}

function finalizeProductionHtml() {
  const indexPath = join(output, "index.html");
  const css = readFileSync(join(output, "style.css"), "utf8");
  const cssHash = createHash("sha256").update(css).digest("base64");
  const stylesheetLink = '<link rel="stylesheet" href="style.css">';
  const sourceIndex = readFileSync(indexPath, "utf8");
  if (!sourceIndex.includes(stylesheetLink)) {
    throw new Error("Production stylesheet link is missing from index.html.");
  }
  if (css.includes("</style>")) {
    throw new Error("CSS cannot be safely inlined into index.html.");
  }
  const index = sourceIndex
    .replace('<html lang="en">', '<html lang="en" data-webp-assets="true">')
    .replace(stylesheetLink, `<style>${css}</style>`)
    .replace(
      '<img src="assets/icon-small.png" alt="AzurCalc" class="brand-logo" width="180" height="164" fetchpriority="high">',
      '<picture><source srcset="assets/icon-small.webp" type="image/webp"><img src="assets/icon-small.png" alt="AzurCalc" class="brand-logo" width="180" height="164" fetchpriority="high"></picture>'
    );
  writeFileSync(indexPath, index);

  const headersPath = join(output, "_headers");
  const headers = readFileSync(headersPath, "utf8");
  if (!headers.includes("__CRITICAL_CSS_HASH__")) {
    throw new Error("CSP hash placeholder is missing from _headers.");
  }
  writeFileSync(headersPath, headers.replace("__CRITICAL_CSS_HASH__", cssHash));
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
  "assets/fonts/raleway-latin.woff2",
  "data/ships.js",
  "data/ships.js.map",
  "app.js.map",
  "assets/icon-small.png",
  "assets/icon-small.webp",
  "assets/header-background.jpg",
  "assets/thumbnails-card/1.jpg",
  "assets/thumbnails-card/1.webp",
  "assets/thumbnails-card/1@2x.webp",
  "_headers"
];

buildImageVariants().then(() => {
  finalizeProductionHtml();
  for (const outputFile of requiredOutputs) {
    if (!existsSync(join(output, outputFile))) throw new Error(`Build output missing: ${outputFile}`);
  }

  console.log(`Built dist/ with ${fileCount(output)} files.`);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});

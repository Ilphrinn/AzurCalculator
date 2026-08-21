const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { basename, join, resolve, sep } = require("node:path");
const { transformSync } = require("esbuild");
const sharp = require("sharp");

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
    .resize(100, 91, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(join(output, "assets", "icon-small.webp"));

  for (let index = 0; index < thumbnails.length; index += 8) {
    await Promise.all(thumbnails.slice(index, index + 8).map(name =>
      sharp(join(sourceDirectory, name))
        .resize(288, 384, { fit: "cover", position: "centre" })
        .webp({ quality: 78, effort: 4 })
        .toFile(join(outputDirectory, name.replace(/\.jpg$/, ".webp")))
    ));
  }

  const generatedCount = readdirSync(outputDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".webp")).length;
  if (generatedCount !== thumbnails.length) {
    throw new Error(`Expected ${thumbnails.length} WebP thumbnails, generated ${generatedCount}.`);
  }
}

function enableProductionWebpAssets() {
  const indexPath = join(output, "index.html");
  const index = readFileSync(indexPath, "utf8")
    .replace('<html lang="en">', '<html lang="en" data-webp-assets="true">')
    .replace(
      '<img src="assets/icon-small.png" alt="AzurCalc" class="brand-logo" width="180" height="164" fetchpriority="high">',
      '<picture><source srcset="assets/icon-small.webp" type="image/webp"><img src="assets/icon-small.png" alt="AzurCalc" class="brand-logo" width="180" height="164" fetchpriority="high"></picture>'
    );
  writeFileSync(indexPath, index);
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
  "data/ships.js.map",
  "app.js.map",
  "assets/icon-small.png",
  "assets/icon-small.webp",
  "assets/header-background.jpg",
  "assets/thumbnails-card/1.jpg",
  "assets/thumbnails-card/1.webp",
  "_headers"
];

buildImageVariants().then(() => {
  enableProductionWebpAssets();
  for (const outputFile of requiredOutputs) {
    if (!existsSync(join(output, outputFile))) throw new Error(`Build output missing: ${outputFile}`);
  }

  console.log(`Built dist/ with ${fileCount(output)} files.`);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});

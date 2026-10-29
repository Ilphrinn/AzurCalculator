// Writes data/specialties.js, the marks on each ship card (Boss killer, Healer...), computed by the
// app's own engine in headless Chromium (computeShipSpecialties). Re-run after a change to the data
// or the figures; `npm run check` fails while the file is stale. Usage:
// CHROME="flatpak run io.github.ungoogled_software.ungoogled_chromium" node scripts/import-specialties.js
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { runPage, readMarker } = require("./page-runner");

runPage([
  "data/equipment.js",
  "data/augments.js",
  "data/bosses.js",
  "data/maps.js",
  "data/skill-timing.js",
  "scripts/specialties-page.js"
]).then(({ error, stdout }) => {
  const marks = readMarker(stdout, "SPECIALTIES");
  if (!marks) {
    console.error(error || "The page produced no result: app.js probably threw.");
    process.exit(1);
  }
  writeFileSync(join(__dirname, "..", "data", "specialties.js"), `const SPECIALTIES_DATA = ${JSON.stringify(marks, null, 2)};\n`);
  const counts = {};
  for (const list of Object.values(marks)) for (const key of list) counts[key] = (counts[key] || 0) + 1;
  console.log(`Wrote marks for ${Object.keys(marks).length} ships to data/specialties.js:`, counts);
});

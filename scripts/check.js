// Runs scripts/check-page.js inside the real page in headless Chromium and fails on any anomaly.
// Usage: npm run check. Set CHROME to the browser command if it is not "chromium", e.g.
// CHROME="flatpak run io.github.ungoogled_software.ungoogled_chromium" npm run check
const { runPage, readMarker } = require("./page-runner");

runPage([
  "data/equipment.js",
  "data/augments.js",
  "data/bosses.js",
  "data/maps.js",
  "data/skill-timing.js",
  "scripts/check-page.js"
]).then(({ error, stdout }) => {
  const report = readMarker(stdout, "CHECK");
  if (!report) {
    console.error(error || "The page produced no result: app.js probably threw before the check ran.");
    process.exit(1);
  }
  const failures = ["errors", "nonFinite", "illegal", "overCap", "worse"].filter(key => report[key].length);
  console.log(`${report.ships} ships, ${report.runs} Optimize runs.`);
  for (const key of failures) {
    console.log(`\n${key} (${report[key].length}):`);
    for (const line of report[key].slice(0, 20)) console.log(`  ${line}`);
  }
  if (failures.length) process.exit(1);
  console.log("All checks passed.");
});

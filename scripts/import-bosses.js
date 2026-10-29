// Refreshes data/bosses.js from mrlar.dev's maps.json: the end-game boss encounters (campaign
// 14-16, META Showdown, OpSi Arbiter, event EX and Challenge stages) with only the stats the
// calculator reads. Run by hand after a new event: node scripts/import-bosses.js
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const SOURCE = "https://azurlane.mrlar.dev/db/static/json/maps.json";
// maps.json codes armour as 0/1/2, checked against known hulls: Shigure (DD) 0, Mogami (CA) 1, Fusou (BB) 2.
const ARMOR = ["light", "medium", "heavy"];
// Hull codes checked the same way (Amagi/Dunkerque 4 = BC, Chitose 6 = CVL, Ise 10 = BBV, Ägir 18 = CB).
// Only the hulls skill text targets are mapped; any other code leaves the boss without one.
const HULL = { 1: "DD", 2: "CL", 3: "CA", 4: "BC", 5: "BB", 6: "CVL", 7: "CV", 8: "SS", 10: "BBV", 17: "SSV", 18: "CB" };

function group(mapName) {
  const campaign = /^(1[4-6])-\d/.exec(mapName);
  if (campaign) return `Campaign ${campaign[1]}`;
  if (mapName.startsWith("Meta Showdown")) return "META Showdown";
  if (mapName.includes("Arbiter")) return "OpSi Arbiter";
  if (/EX\b|EXTRA/.test(mapName)) return "Event EX";
  if (mapName.includes("Challenge")) return "Event Challenge";
  return null;
}

(async () => {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}.`);
  const maps = Object.values(await response.json());

  // Event reruns repeat a stage under the same names; the highest id is the latest version.
  const latest = new Map();
  for (const map of maps) {
    const groupName = group(map.name || "");
    const boss = map.boss;
    if (!groupName || !boss || !boss.stats) continue;
    const armor = ARMOR[boss.stats.armor];
    if (!armor) throw new Error(`Unknown armour code ${boss.stats.armor} on ${map.name}.`);
    const key = `${map.name}|${boss.name}`;
    if (latest.has(key) && latest.get(key).id > (map.id || 0)) continue;
    latest.set(key, {
      id: map.id || 0,
      group: groupName,
      map: map.name,
      name: boss.name,
      armor,
      hull: HULL[boss.hull] || null,
      level: boss.level,
      hit: boss.stats.hit,
      eva: boss.stats.eva,
      luck: boss.stats.luck,
      // Anti-air reduces aircraft damage taken: x min(150 / (150 + AA), 1) (client battleformulas.lua).
      aa: boss.stats.aa,
      // Nationality 99 is the Sirens, which some damage reductions name (the Intel Report auxiliaries).
      siren: boss.nation === 99,
      // The stage's battle time limit in seconds (META Showdown 80, Arbiters 90, campaign 180):
      // the fight length a buff's uptime is measured against.
      timeLimit: map.time_limit
    });
  }

  const groupOrder = ["Campaign 14", "Campaign 15", "Campaign 16", "META Showdown", "OpSi Arbiter", "Event EX", "Event Challenge"];
  const bosses = [...latest.values()].sort((a, b) =>
    groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
    (a.group.startsWith("Event") ? b.id - a.id : a.map.localeCompare(b.map, "en", { numeric: true })) ||
    a.name.localeCompare(b.name)
  );
  for (const boss of bosses) {
    if (![boss.level, boss.hit, boss.eva, boss.luck, boss.aa, boss.timeLimit].every(Number.isFinite)) throw new Error(`Incomplete stats for ${boss.name}.`);
  }

  const target = join(__dirname, "..", "data", "bosses.js");
  const rows = bosses.map(({ id, ...boss }) => boss);
  writeFileSync(target, `const BOSSES_DATA = ${JSON.stringify(rows, null, 2)};\n`);
  console.log(`Wrote ${bosses.length} bosses to data/bosses.js.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

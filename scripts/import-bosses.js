// Refreshes data/bosses.js from mrlar.dev's maps.json: the end-game boss encounters (campaign
// 14-16, META Showdown, OpSi Arbiter, event EX and Challenge stages) with only the stats the
// calculator reads. Run by hand after a new event: node scripts/import-bosses.js
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { FIRE_SOURCES, fireRates, planeOrdnance } = require("./enemy-fire");
const { GAME_DATA, getJson, list, enemyRow, airCutOf } = require("./game-data");

const SOURCE = "https://azurlane.mrlar.dev/db/static/json/maps.json";
// The game's own tables, for buffs that change the aircraft damage a boss takes.
const GAME_SOURCES = {
  expeditions: `${GAME_DATA}/sharecfgdata/expedition_data_template.json`,
  dungeons: `${GAME_DATA}/GameCfg/dungeon.json`,
  enemies: `${GAME_DATA}/ShareCfg/enemy_data_statistics.json`,
  buffs: `${GAME_DATA}/GameCfg/buff.json`,
  ...FIRE_SOURCES
};
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
  const maps = Object.values(await getJson(SOURCE));
  const [expeditions, dungeons, enemies, buffs, weapons, barrages] = await Promise.all(Object.values(GAME_SOURCES).map(getJson));

  // injureRatioByAir on the boss, from the buffs its wave or its own stats attach; Elise in Vacation
  // Lane EX takes double.
  function bossAirCut(map, bossName) {
    const expedition = expeditions[map.expo_id];
    const dungeon = expedition && dungeons[expedition.dungeon_id];
    for (const stage of list(dungeon && dungeon.stages)) {
      for (const wave of list(stage.waves)) {
        for (const unit of [...list(wave.spawn), ...list(wave.reinforcement)]) {
          const stats = unit && enemyRow(enemies, unit.monsterTemplateID);
          if (!stats || (stats.name || "").trim() !== bossName.trim()) continue;
          return airCutOf(buffs, [...(unit.buffList || []), ...(stats.buff_list || []).map(b => b.ID)]);
        }
      }
    }
    return 0;
  }

  // What the boss node's enemies fire, each ship weighted by its HP (the longer it takes to sink, the
  // longer it shoots), as scripts/import-maps.js does for mobs. torpedoShare: the torpedo-attribute share
  // of the ships' fire. airShare: the air raids' ordnance against that fire over the time limit, an upper
  // bound (every plane drops). Campaign only: solo and event bosses fire skill barrages no list holds.
  function bossIncoming(map) {
    const expedition = expeditions[map.expo_id];
    const dungeon = expedition && dungeons[expedition.dungeon_id];
    const fired = { cannon: 0, torpedo: 0, air: 0 };
    let totalHp = 0;
    let raids = 0;
    for (const stage of list(dungeon && dungeon.stages)) {
      for (const wave of list(stage.waves)) {
        raids += planeOrdnance(list(wave.airFighter), { weapons, barrages });
        for (const unit of [...list(wave.spawn), ...list(wave.reinforcement)]) {
          const stats = unit && enemyRow(enemies, unit.monsterTemplateID);
          // A negative unit type is a scripted dummy; submarines are their own fleet.
          if (!stats || stats.battle_unit_type < 0 || [8, 17].includes(stats.type)) continue;
          const hp = stats.durability + (expedition.level - 1) * stats.durability_growth / 1000;
          const rates = fireRates(stats, expedition.level, { weapons, barrages });
          totalHp += hp;
          for (const kind of Object.keys(fired)) fired[kind] += hp * rates[kind];
        }
      }
    }
    const total = fired.cannon + fired.torpedo + fired.air;
    if (!(total > 0)) throw new Error(`No enemy fire found for ${map.name}.`);
    const ships = expedition.time_limit * total / totalHp;
    const round = value => Math.round(value * 1000) / 1000;
    return { torpedoShare: round(fired.torpedo / total), airShare: round(raids / (raids + ships)) };
  }

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
      ...(bossAirCut(map, boss.name) ? { airCut: bossAirCut(map, boss.name) } : {}),
      // Nationality 99 is the Sirens, which some damage reductions name (the Intel Report auxiliaries).
      siren: boss.nation === 99,
      ...(groupName.startsWith("Campaign") ? bossIncoming(map) : {}),
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

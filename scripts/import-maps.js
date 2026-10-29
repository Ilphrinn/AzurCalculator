// Writes data/maps.js from the game's own tables (AzurLaneData): for each campaign 14-16 map, the
// Airspace Control values its fleet screen shows and the enemies of its mob fleets, which the Fleet
// tab's Mob fleet is measured against. Run by hand after a game update: node scripts/import-maps.js
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const GAME_DATA = "https://raw.githubusercontent.com/AzurLaneTools/AzurLaneData/main/EN";
const SOURCES = {
  chapters: `${GAME_DATA}/sharecfgdata/chapter_template.json`,
  expeditions: `${GAME_DATA}/sharecfgdata/expedition_data_template.json`,
  dungeons: `${GAME_DATA}/GameCfg/dungeon.json`,
  enemies: `${GAME_DATA}/ShareCfg/enemy_data_statistics.json`,
  buffs: `${GAME_DATA}/GameCfg/buff.json`
};
// enemy_data_statistics codes armour 1/2/3, checked on Shiratsuyu (DD) 1, the Anti-Air Ship (CL) 2
// and Fusou Retrofit (BBV) 3. Hull codes are maps.json's, which import-bosses.js already checked.
const ARMOR = { 1: "light", 2: "medium", 3: "heavy" };
const HULL = { 1: "DD", 2: "CL", 3: "CA", 4: "BC", 5: "BB", 6: "CVL", 7: "CV", 8: "SS", 10: "BBV", 17: "SSV", 18: "CB" };
const SIREN_NATION = 99;
const SUBMARINE_HULLS = new Set([8, 17]);

async function load(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
}

// Waves and their spawns come as arrays or as objects keyed "1", "2"...
const list = value => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];

(async () => {
  const [chapters, expeditions, dungeons, enemies, buffs] = await Promise.all(Object.values(SOURCES).map(load));

  // A buff a wave puts on a spawned enemy can cut the aircraft damage it takes (Anti-Air Ships and
  // Mass-Produced Akizukis: injureRatioByAir -0.5, the client's x (1 + injureRatioByAir)).
  const airCutOf = buffList => (buffList || []).reduce((sum, id) => sum + list((buffs[`buff_${id}`] || {}).effect_list)
    .filter(e => e.type === "BattleBuffAddAttr" && (e.arg_list || {}).attr === "injureRatioByAir")
    .reduce((s2, e) => s2 + e.arg_list.number, 0), 0);

  // An enemy row only overrides its `base` row, which carries the name, hull, armour and nation.
  const enemy = id => enemies[id] && { ...enemies[enemies[id].base], ...enemies[id] };
  // Level scaling as the game applies it; it reproduces maps.json's boss HP for 1322 of 1329 bosses.
  const hpAt = (stats, level) => Math.floor(stats.durability + (level - 1) * stats.durability_growth / 1000);
  const aaAt = (stats, level) => stats.antiaircraft + (level - 1) * stats.antiaircraft_growth / 1000;

  function mobFleet(expeditionId, weight) {
    const expedition = expeditions[expeditionId];
    const dungeon = expedition && dungeons[expedition.dungeon_id];
    if (!dungeon) throw new Error(`Mob fleet ${expeditionId} has no dungeon.`);
    const counts = new Map();
    for (const stage of list(dungeon.stages)) {
      for (const wave of list(stage.waves)) {
        for (const unit of [...list(wave.spawn), ...list(wave.reinforcement)]) {
          const stats = unit && enemy(unit.monsterTemplateID);
          // A negative unit type is a scripted dummy (a 99999 HP "？？？" in 15-x); submarines only take ASW,
          // which the surface figures this mix weighs do not use.
          if (!stats || stats.battle_unit_type < 0 || SUBMARINE_HULLS.has(stats.type)) continue;
          const key = `${unit.monsterTemplateID}|${airCutOf(unit.buffList)}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    const units = [...counts].map(([key, count]) => {
      const [id, airCut] = key.split("|").map(Number);
      const stats = enemy(id);
      const armor = ARMOR[stats.armor_type];
      if (!armor) throw new Error(`Unknown armour code ${stats.armor_type} on enemy ${id}.`);
      return {
        name: stats.name.trim(), hull: HULL[stats.type] || null, armor, count, hp: hpAt(stats, expedition.level), aa: aaAt(stats, expedition.level), airCut,
        hit: stats.hit, eva: stats.dodge, luck: stats.luck, siren: stats.nationality === SIREN_NATION
      };
    });
    return { name: expedition.name, weight, level: expedition.level, timeLimit: expedition.time_limit, units };
  }

  const maps = [];
  for (const chapter of Object.values(chapters)) {
    const name = String(chapter.chapter_name || "").replace(/–/g, "-");
    const campaign = /^(1[4-6])-\d$/.exec(name);
    if (!campaign) continue;
    // Hard mode reuses the chapter name under a 10000-higher id; bosses.js names it "14-1-Hard".
    const hard = chapter.id >= 10000;
    const fleets = chapter.expedition_id_weight_list.map(([id, weight]) => mobFleet(id, weight));

    // A mob fleet counts by how often it spawns (its weight) and each enemy by its share of the HP
    // to clear, since the longer one takes to sink, the longer it shoots back.
    const hpByArmor = { light: 0, medium: 0, heavy: 0 };
    const weighted = { hit: 0, eva: 0, luck: 0, aa: 0 };
    // Aircraft damage x min(150 / (150 + AA), 1) (client battleformulas.lua, DRATE[7]); over a clear
    // the time is HP / (damage x that factor), so the factors average harmonically by HP.
    let airTime = 0;
    let totalHp = 0;
    let weightedTime = 0;
    let totalWeight = 0;
    for (const fleet of fleets) {
      totalWeight += fleet.weight;
      weightedTime += fleet.weight * fleet.timeLimit;
      for (const unit of fleet.units) {
        const hp = fleet.weight * unit.count * unit.hp;
        hpByArmor[unit.armor] += hp;
        totalHp += hp;
        for (const key of Object.keys(weighted)) weighted[key] += hp * unit[key];
        airTime += hp / (Math.min(150 / (150 + unit.aa), 1) * Math.max(0, 1 + unit.airCut));
      }
    }
    const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
    maps.push({
      map: hard ? `${name}-Hard` : name,
      group: `Campaign ${campaign[1]}`,
      airControl: chapter.air_dominance,
      airRecommended: chapter.best_air_dominance,
      submarines: chapter.submarine_num > 0,
      mobs: {
        level: round(fleets.reduce((sum, fleet) => sum + fleet.weight * fleet.level, 0) / totalWeight, 0),
        timeLimit: round(weightedTime / totalWeight, 0),
        hit: round(weighted.hit / totalHp, 1),
        eva: round(weighted.eva / totalHp, 1),
        luck: round(weighted.luck / totalHp, 1),
        aa: round(weighted.aa / totalHp, 0),
        airModifier: round(totalHp / airTime, 3),
        siren: fleets.every(fleet => fleet.units.every(unit => unit.siren)),
        hpShare: Object.fromEntries(Object.entries(hpByArmor).map(([armor, hp]) => [armor, round(hp / totalHp, 3)])),
        fleets: fleets.map(({ name, weight, level }) => ({ name, weight, level }))
      }
    });
  }

  maps.sort((a, b) => a.map.localeCompare(b.map, "en", { numeric: true }));
  for (const map of maps) {
    if (![map.airControl, map.airRecommended, map.mobs.hit, map.mobs.eva, map.mobs.luck].every(Number.isFinite)) throw new Error(`Incomplete data for ${map.map}.`);
  }
  writeFileSync(join(__dirname, "..", "data", "maps.js"), `const MAPS_DATA = ${JSON.stringify(maps, null, 2)};\n`);
  console.log(`Wrote ${maps.length} maps to data/maps.js.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

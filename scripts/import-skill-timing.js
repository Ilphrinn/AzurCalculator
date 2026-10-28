// Writes data/skill-timing.js: when each ship skill's effect is active during a fight, read from
// the game's own buff and skill tables (AzurLaneData), at skill level 1 and at max level. Run by
// hand after a game update: node scripts/import-skill-timing.js
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const GAME_DATA = "https://raw.githubusercontent.com/AzurLaneTools/AzurLaneData/main/EN";
const SOURCES = {
  templates: `${GAME_DATA}/sharecfgdata/ship_data_template.json`,
  skills: `${GAME_DATA}/GameCfg/skill.json`,
  buffs: `${GAME_DATA}/GameCfg/buff.json`,
  texts: `${GAME_DATA}/ShareCfg/skill_data_template.json`
};

// The game names a skill's level in its title ("Siren Killer Ⅲ"); our skills add "+" for the
// enhanced version.
function normName(name) {
  return (name || "").replace(/\+$/, "").replace(/\s+(?:[ⅠⅡⅢⅣⅤ]+|I{1,3}|IV|V)$/, "").trim().toLowerCase();
}

// Level overrides ("1".."10") replace top-level fields such as `time` and `effect_list` whole.
function atLevel(entry, level) {
  return entry && entry[level] ? { ...entry, ...entry[level] } : entry;
}

const POSITION = new Set(["onLeader", "onFlagShip", "onCenter", "onRear"]);
function isPosition(triggers) {
  return Boolean(triggers && triggers.length) && triggers.every(t => POSITION.has(t));
}

// Sparse Lua tables come out of the export as objects keyed "1", "2"... rather than arrays.
function list(value) {
  return Array.isArray(value) ? value : Object.values(value || {});
}

// Effects that only route to other buffs or skills; anything else is what the skill does.
const ROUTING = new Set(["BattleBuffCastSkill", "BattleBuffAddBuff", "BattleBuffCount"]);
// Triggers under which an effect simply lasts as long as its buff; the fleet-position ones are a
// static condition (flagship, centre, rear), assumed met like the rest.
const LASTING = new Set(["onAttach", "onRemove", "onStack", "onUnstack", "onUpdate", "onBulletCreate",
  "onLeader", "onFlagShip", "onCenter", "onRear"]);

// Static conditions (fleet make-up, ship tags, nationality) are assumed met, as everywhere else in
// the app; anything tied to an event (HP threshold, firing, being hit) makes its branch
// "conditional". Conditional branches are still walked, so their values are known and a bonus
// matching one stays at its raw figure rather than borrowing another effect's window.
// Every other argument (HP bounds, kills, being hit, a broken shield, OpSi-only dungeons, stacks)
// is an event. initialCD is static too: the client starts every timer one period in either way
// (battlebuffcastskill.lua sets the next effect time, then enterCoolDown adds the period).
const STATIC_CHECK = new RegExp("^(?:check_target|ship_tag_list|ship_type_list|nationality|label|fleetPos|quota|" +
  "check_weapon|weaponType|minWeaponNumber|maxWeaponNumber|minTargetNumber|maxTargetNumber|type|target|" +
  "exceptCaster|isBuffStackByCheckTarget|range|armor_type|weapon_group|initialCD)$");

class Timing {
  constructor(tables, level) {
    this.tables = tables;
    this.level = level;
  }

  buff(id, context, depth) {
    const buff = atLevel(this.tables.buffs[`buff_${id}`], this.level);
    if (!buff || depth > 8) return [{ kind: "conditional", trigger: "missing", values: [] }];
    const out = [];
    const effects = list(buff.effect_list);
    for (const effect of effects) {
      const args = effect.arg_list || {};
      const trigger = (effect.trigger || []).join("+");
      const target = args.skill_id ? ["skill", args.skill_id] : args.buff_id ? ["buff", args.buff_id] : null;
      if (effect.type === "BattleBuffCount") continue;
      if (effect.type === "BattleBuffCastSkill" && trigger === "onBattleBuffCount") {
        const counter = effects.find(e => e.type === "BattleBuffCount" && (e.arg_list || {}).countType === args.countType);
        const volleys = counter && (counter.trigger || []).join() === "onFire" ? counter.arg_list.countTarget : null;
        if (volleys && !context.conditional) out.push({ kind: "volleys", volleys, values: [] });
        else out.push(...this.follow(target, { ...context, conditional: context.conditional || "count" }, depth));
        continue;
      }
      if (ROUTING.has(effect.type)) {
        const extra = Object.keys(args).filter(key => !["skill_id", "buff_id", "time", "rant", "group", "index", "countType"].includes(key));
        let next = context;
        if (extra.some(key => !STATIC_CHECK.test(key))) next = { ...context, conditional: context.conditional || "check" };
        else if (trigger === "onStartGame" || (trigger === "onAttach" && !args.rant) || isPosition(effect.trigger)) next = context;
        else if (trigger === "onUpdate" && args.time > 0 && !context.period) next = { ...context, period: args.time, chance: (args.rant || 10000) / 10000 };
        else if (trigger === "onAttach" && args.rant && context.period) next = { ...context, chance: context.chance * args.rant / 10000 };
        else next = { ...context, conditional: context.conditional || trigger || effect.type };
        out.push(...this.follow(target, next, depth));
        continue;
      }
      const lasting = effect.type !== "BattleBuffCancelBuff" && (effect.trigger || []).every(t => LASTING.has(t));
      const where = lasting ? context : { ...context, conditional: context.conditional || trigger || effect.type };
      out.push({ ...this.window(where, buff.time || 0), values: leafValues(effect) });
    }
    return out;
  }

  follow(target, context, depth) {
    if (!target) return [{ kind: "conditional", trigger: "missing", values: [] }];
    return target[0] === "skill" ? this.skill(target[1], context, depth + 1) : this.buff(target[1], context, depth + 1);
  }

  skill(id, context, depth) {
    const skill = atLevel(this.tables.skills[`skill_${id}`], this.level);
    if (!skill || depth > 8) return [{ kind: "conditional", trigger: "missing", values: [] }];
    const out = [];
    for (const entry of list(skill.effect_list)) {
      const args = entry.arg_list || {};
      if (entry.type === "BattleSkillAddBuff" && args.buff_id) out.push(...this.buff(args.buff_id, context, depth + 1));
      else if (entry.type === "BattleSkillFire") out.push({ ...this.window(context, 0), barrage: true, values: [] });
      else out.push({ ...this.window(context, 0), action: entry.type, values: [] });
    }
    return out;
  }

  window(context, duration) {
    if (context.conditional) return { kind: "conditional", trigger: context.conditional };
    if (context.period) return { kind: "periodic", period: context.period, duration, chance: round(context.chance) };
    return duration > 0 ? { kind: "start", duration } : { kind: "permanent" };
  }
}

// The figure a skill's text would print for this effect, in percent or flat points: ratio
// attributes are in 1/10000 (Expert Loader's loadSpeed 350 is +3.5%), plain ones a fraction or a
// flat amount, so both readings are kept.
function leafValues(effect) {
  const number = Math.abs((effect.arg_list || {}).number);
  if (!Number.isFinite(number) || number === 0) return [];
  if (effect.type === "BattleBuffAddAttrRatio") return [round(number / 100)];
  if (effect.type === "BattleBuffAddBulletAttr") return [round(number * 100)];
  if (effect.type === "BattleBuffAddAttr") return number < 5 ? [round(number * 100), number] : [number];
  return [];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function windowKey({ kind, trigger, period, duration, chance, volleys }) {
  return JSON.stringify({ kind, trigger, period, duration, chance, volleys });
}

// The skill's overall window ("mixed" when its effects disagree) for display, plus one entry per
// distinct (values, window) pair that the app matches the text's bonuses against.
function summarise(windows) {
  const lasting = windows.filter(w => !w.barrage && !w.action);
  const distinct = [...new Map(lasting.map(w => [windowKey(w), w])).values()];
  const parts = [...new Set(distinct.map(w => w.kind === "conditional" ? `conditional:${w.trigger}` : w.kind))].sort();
  const strip = ({ values, barrage, action, ...window }) => window;
  const overall = distinct.length === 1 ? strip(distinct[0]) : distinct.length ? { kind: "mixed", parts } : null;
  const barrage = windows.find(w => w.barrage || w.kind === "volleys");
  const effects = [...new Map(lasting.filter(w => w.values.length)
    .map(w => [w.values.join("/") + windowKey(w), { values: w.values, ...strip(w) }])).values()];
  return {
    ...(overall || { kind: barrage ? "barrage" : "none" }),
    ...(barrage && overall ? { barrage: true } : {}),
    ...(effects.length ? { effects } : {})
  };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
}

(async () => {
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([key, url]) => [key, await getJson(url)]));
  const tables = Object.fromEntries(entries);

  const context = {};
  vm.runInNewContext(readFileSync(join(__dirname, "..", "data", "ships.js"), "utf8").replace(/^const (\w+) =/, "this.$1 ="), context);

  const idsByName = new Map();
  for (const [id, text] of Object.entries(tables.texts)) {
    const name = normName(text.name);
    if (!idsByName.has(name)) idsByName.set(name, []);
    idsByName.get(name).push(Number(id));
  }
  // One template per star rank, each with that rank's skill version (Siren Killer Ⅰ, Ⅱ, Ⅲ): the
  // highest rank comes first so its version wins.
  const idsByGroup = new Map();
  const byStar = Object.values(tables.templates).sort((a, b) => b.star - a.star);
  for (const template of byStar) {
    if (!idsByGroup.has(template.group_type)) idsByGroup.set(template.group_type, new Set());
    for (const id of template.buff_list || []) idsByGroup.get(template.group_type).add(id);
  }

  const timing = {};
  const kinds = {};
  let mapped = 0;
  let total = 0;
  for (const ship of context.SHIPS_DATA) {
    const own = [...(idsByGroup.get(Number(ship.gid)) || [])];
    for (const skill of ship.skills || []) {
      total++;
      const name = normName(skill.name);
      // The ship's own template first; otherwise a name only one game skill carries.
      const candidates = idsByName.get(name) || [];
      const id = own.find(i => normName((tables.texts[i] || {}).name) === name) || (candidates.length === 1 ? candidates[0] : null);
      if (!id) continue;
      mapped++;
      const maxLevel = (tables.texts[id] || {}).max_level || 10;
      const byLevel = {};
      for (const level of [1, maxLevel]) byLevel[level] = summarise(new Timing(tables, level).buff(id, {}, 0));
      byLevel.max = maxLevel;
      byLevel.id = id;
      (timing[ship.id] = timing[ship.id] || {})[skill.name] = byLevel;
      kinds[byLevel[maxLevel].kind] = (kinds[byLevel[maxLevel].kind] || 0) + 1;
    }
  }

  writeFileSync(join(__dirname, "..", "data", "skill-timing.js"), `const SKILL_TIMING_DATA = ${JSON.stringify(timing, null, 2)};\n`);
  console.log(`${mapped} of ${total} skills linked to game data. At max level:`, kinds);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

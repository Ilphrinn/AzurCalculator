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

// Who a heal or shield reaches, from the game's target selectors. "TargetSelf" inside a buff is
// whoever holds it, so it keeps the holder the outer skill picked. Selectors narrowed by ship tag,
// nationality, hull, chance or fleet slot are left out ("restricted"): precision over recall.
const TARGET_GROUPS = {
  TargetAllHelp: "fleet", TargetPlayerVanguardFleet: "vanguard", TargetPlayerMainFleet: "main",
  TargetHelpLeastHPRatio: "lowest", "TargetAllHelp+TargetHelpLeastHPRatio": "lowest",
  "TargetPlayerVanguardFleet+TargetHelpLeastHPRatio": "lowest-vanguard", "TargetPlayerMainFleet+TargetHelpLeastHPRatio": "lowest-main",
  "TargetAllHelp+TargetPlayerVanguardFleet": "vanguard", "TargetAllHelp+TargetSelf": "fleet"
};
function targetGroup(choice, holder, args = {}) {
  const key = [].concat(choice || "TargetSelf").join("+");
  if (key === "TargetSelf") return holder;
  const group = TARGET_GROUPS[key] || "restricted";
  return group === "fleet" && args.exceptCaster ? "others" : group;
}

// What a heal, shield or wall effect gives, as the client computes it (battleskillheal.lua,
// battlebuffhp.lua, battlebuffshield.lua, battlebuffshieldwall.lua). currentHPRatio heals depend
// on HP at the time and lifesteal on damage dealt, so they carry no figure.
function sustainOf(type, args, target, buffTime, { events, quota }) {
  const part = { target, ...(events && events.length > 1 ? { events } : {}), ...(quota ? { quota } : {}) };
  for (const [key, field] of [["maxHPRatio", "maxHP"], ["casterMaxHPRatio", "casterMaxHP"], ["number", "number"]]) {
    if (Number.isFinite(args[key]) && args[key] !== 0) part[field] = round(args[key]);
  }
  if (type === "BattleSkillHeal") return { effect: "heal", ...part };
  if (type === "BattleBuffHP") {
    if (args.damageConvertRatio) return { effect: "lifesteal", ...part, ratio: round(args.damageConvertRatio / 10000) };
    return { effect: "heal", ...part, ...(args.currentHPRatio ? { currentHP: round(args.currentHPRatio / 10000) } : {}) };
  }
  if (type === "BattleBuffShield") return { effect: "shield", ...part, duration: buffTime };
  if (type === "BattleBuffShieldWall") return { effect: "wall", ...part, bullets: args.count, duration: buffTime };
  return null;
}
const SUSTAIN_EFFECTS = new Set(["BattleBuffHP", "BattleBuffShield", "BattleBuffShieldWall"]);

// The window keeps the first event on the path; heals and shields keep them all, so an "on airstrike,
// if HP is low" heal is not counted on every airstrike.
function withEvent(context, event) {
  return { ...context, conditional: context.conditional || event, events: [...(context.events || []), event] };
}

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
        else out.push(...this.follow(target, withEvent(context, "count"), depth));
        continue;
      }
      if (ROUTING.has(effect.type)) {
        const extra = Object.keys(args).filter(key => !["skill_id", "buff_id", "time", "rant", "group", "index", "countType"].includes(key));
        let next = effect.type === "BattleBuffAddBuff" && args.target ? { ...context, target: targetGroup(args.target, context.target || "self") } : context;
        if (extra.some(key => !STATIC_CHECK.test(key))) next = withEvent(next, "check");
        else if (trigger === "onStartGame" || (trigger === "onAttach" && !args.rant) || isPosition(effect.trigger)) next = { ...next };
        else if (trigger === "onUpdate" && args.time > 0 && !context.period) next = { ...next, period: args.time, chance: (args.rant || 10000) / 10000 };
        else if (trigger === "onAttach" && args.rant && context.period) next = { ...next, chance: context.chance * args.rant / 10000 };
        else next = withEvent(next, trigger || effect.type);
        // quota caps how many times this cast happens in a battle (once, for quota 1); a buff it
        // attaches then fires on its own events, uncapped.
        if (next.events !== context.events) next = { ...next, quota: undefined };
        if (args.quota) next = { ...next, quota: args.quota };
        out.push(...this.follow(target, next, depth));
        continue;
      }
      // A shield absorbs when its holder is hit: that trigger is how it works, not a condition.
      const lasting = effect.type !== "BattleBuffCancelBuff" &&
        (effect.trigger || []).every(t => LASTING.has(t) || (effect.type === "BattleBuffShield" && t === "onTakeDamage"));
      const where = lasting ? context : withEvent(context, trigger || effect.type);
      const sustain = SUSTAIN_EFFECTS.has(effect.type) ? sustainOf(effect.type, args, context.target || "self", buff.time || 0, where) : null;
      // Airstrike load time (number 0.9 = +90%, Perseus), which heals cast on an airstrike follow.
      const airstrike = effect.type === "BattleBuffAddReloadRequirement" && args.type === "airAssist" ? { requirement: args.number } : null;
      out.push({ ...this.window(where, buff.time || 0), values: leafValues(effect), ...(sustain ? { sustain } : {}), ...(airstrike ? { airstrike } : {}) });
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
      const target = targetGroup(entry.target_choise, context.target || "self", args);
      if (entry.type === "BattleSkillAddBuff" && args.buff_id) out.push(...this.buff(args.buff_id, { ...context, target }, depth + 1));
      else if (entry.type === "BattleSkillFire") out.push({ ...this.window(context, 0), barrage: true, values: [] });
      else if (entry.type === "BattleSkillInstantCoolDown" && args.weaponType === "AirAssist") out.push({ ...this.window(context, 0), action: entry.type, values: [], airstrike: { preload: 1 } });
      else if (entry.type === "BattleSkillHeal") out.push({ ...this.window(context, 0), action: entry.type, values: [], sustain: sustainOf(entry.type, args, target, 0, context) });
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

// When a skill fires its barrage: one activation per schedule tick or weapon event, however many
// bullets and inner timers it then runs (Musashi's 6 shots 0.5s apart are one activation).
// Ticks: { first, every, until, quota, chance } in seconds from the battle start, `every` null
// for a single one; events: { on: "mainGun" | "torpedo" | "airstrike", chance, cooldown, quota }.
const FIRE_IMMEDIATE = new Set(["onAttach", "onUpdate", "onStartGame", "onAttach+onStack"]);
const FIRE_EVENTS = {
  onChargeWeaponFire: "mainGun", onTorpedoWeaponFire: "torpedo",
  onAllInStrike: "airstrike", onAllInStrikeSteady: "airstrike", onAirAssistReady: "airstrike"
};
const FIRE_ROUTING_ARGS = ["skill_id", "buff_id", "time", "rant", "group", "index", "countType"];

class FireSchedule {
  constructor(tables, level) {
    this.tables = tables;
    this.level = level;
    this.out = [];
    this.sources = new Set();
  }

  static isStatic(args) {
    return Object.keys(args).filter(key => !FIRE_ROUTING_ARGS.includes(key)).every(key => STATIC_CHECK.test(key));
  }

  static next(args) {
    return args.skill_id ? ["skill", args.skill_id] : args.buff_id ? ["buff", args.buff_id] : null;
  }

  // The chance that casting this target now fires a barrage, through immediate triggers only, and
  // the weapons it fires (a recon flight or a gun emitter is told apart from the barrage by them).
  reaches(target, depth = 0, seen = new Set()) {
    const none = { chance: 0, weapons: [] };
    const key = target.join("_");
    if (depth > 10 || seen.has(key)) return none;
    seen.add(key);
    const found = [];
    if (target[0] === "skill") {
      const skill = atLevel(this.tables.skills[`skill_${target[1]}`], this.level);
      for (const entry of list(skill && skill.effect_list)) {
        const args = entry.arg_list || {};
        if (entry.type === "BattleSkillFire") found.push({ chance: 1, weapons: [args.weapon_id] });
        else if (entry.type === "BattleSkillAddBuff" && args.buff_id) found.push(this.reaches(["buff", args.buff_id], depth + 1, seen));
      }
    } else {
      const buff = atLevel(this.tables.buffs[`buff_${target[1]}`], this.level);
      for (const effect of list(buff && buff.effect_list)) {
        const args = effect.arg_list || {};
        const next = FireSchedule.next(args);
        if (!next || !FIRE_IMMEDIATE.has((effect.trigger || []).join("+")) || !FireSchedule.isStatic(args)) continue;
        const inner = this.reaches(next, depth + 1, seen);
        found.push({ chance: (args.rant || 10000) / 10000 * inner.chance, weapons: inner.weapons });
      }
    }
    const hits = found.filter(f => f.chance > 0);
    if (!hits.length) return none;
    return {
      chance: Math.max(...hits.map(f => f.chance)),
      weapons: [...new Set(hits.flatMap(f => f.weapons))].filter(w => w !== undefined).sort((a, b) => a - b)
    };
  }

  // Branches gated on an exact count of fleet members (Amagi's interval shortens per Sakura ship)
  // are alternatives: only the least demanding one is kept.
  static alternatives(effects) {
    const kept = new Map();
    for (const effect of effects) {
      const args = effect.arg_list || {};
      if (!args.check_target || (args.minTargetNumber === undefined && args.maxTargetNumber === undefined)) continue;
      const key = JSON.stringify([effect.trigger, args.check_target, args.nationality, args.ship_tag_list, args.ship_type_list]);
      const best = kept.get(key);
      if (!best || (args.minTargetNumber || 0) < (best.arg_list.minTargetNumber || 0)) kept.set(key, effect);
    }
    return effects.filter(effect => {
      const args = effect.arg_list || {};
      if (!args.check_target || (args.minTargetNumber === undefined && args.maxTargetNumber === undefined)) return true;
      return kept.get(JSON.stringify([effect.trigger, args.check_target, args.nationality, args.ship_tag_list, args.ship_type_list])) === effect;
    });
  }

  // A buff living from t0 (for its `time`, or the whole battle) whose triggers schedule activations;
  // a permanent buff it adds is a further source (Warspite's barrage moves to one after 15s).
  source(id, t0 = 0, chance = 1, depth = 0) {
    if (this.sources.has(id) || depth > 6) return this.out;
    this.sources.add(id);
    const buff = atLevel(this.tables.buffs[`buff_${id}`], this.level);
    if (!buff) return this.out;
    const until = buff.time > 0 ? t0 + buff.time : null;
    for (const effect of FireSchedule.alternatives(list(buff.effect_list))) {
      const args = effect.arg_list || {};
      const trigger = (effect.trigger || []).join("+");
      const target = FireSchedule.next(args);
      if (!target || !["BattleBuffCastSkill", "BattleBuffAddBuff"].includes(effect.type) || !FireSchedule.isStatic(args)) continue;
      const odds = chance * (args.rant || 10000) / 10000;
      let when;
      if (trigger === "onUpdate" && args.time > 0) when = { first: round(t0 + args.time), every: args.time };
      else if (FIRE_IMMEDIATE.has(trigger)) when = { first: t0, every: null };
      else if (FIRE_EVENTS[trigger]) when = { on: FIRE_EVENTS[trigger] };
      else continue;
      const added = target[0] === "buff" ? atLevel(this.tables.buffs[`buff_${target[1]}`], this.level) : null;
      if (added && !(added.time > 0) && !when.on) {
        this.source(target[1], when.first, odds, depth + 1);
        continue;
      }
      const reach = this.reaches(target);
      if (!reach.chance) continue;
      const fire = { ...when, chance: round(odds * reach.chance), weapons: reach.weapons, ...(until !== null && !when.on ? { until: round(until) } : {}), ...(args.quota ? { quota: args.quota } : {}) };
      // Re-adding a live buff only refreshes it, so its onAttach cast waits for it to expire.
      if (when.on && added && added.time > 0) fire.cooldown = added.time;
      if (!this.out.some(other => JSON.stringify(other) === JSON.stringify(fire))) this.out.push(fire);
    }
    return this.out;
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
  const strip = ({ values, barrage, action, sustain, airstrike, ...window }) => window;
  const overall = distinct.length === 1 ? strip(distinct[0]) : distinct.length ? { kind: "mixed", parts } : null;
  const barrage = windows.find(w => w.barrage || w.kind === "volleys");
  const effects = [...new Map(lasting.filter(w => w.values.length)
    .map(w => [w.values.join("/") + windowKey(w), { values: w.values, ...strip(w) }])).values()];
  // Heals and shields with the window they come in; the app counts how often that is in a fight.
  const sustain = [...new Map(windows.filter(w => w.sustain)
    .map(w => { const entry = { ...w.sustain, ...strip(w) }; return [JSON.stringify(entry), entry]; })).values()];
  // Battle-start preloads count. A load time change counts only in a skill that is permanent as a
  // whole: most are "first airstrike" cuts whose buff goes after one launch (Amagi's -100%).
  const airstrike = { requirement: 0, preload: 0 };
  for (const w of windows) {
    if (!w.airstrike || !["permanent", "start"].includes(w.kind)) continue;
    if (overall && overall.kind === "permanent") airstrike.requirement = round(airstrike.requirement + (w.airstrike.requirement || 0));
    airstrike.preload += w.airstrike.preload || 0;
  }
  return {
    ...(airstrike.requirement || airstrike.preload ? { airstrike } : {}),
    ...(overall || { kind: barrage ? "barrage" : "none" }),
    ...(barrage && overall ? { barrage: true } : {}),
    ...(effects.length ? { effects } : {}),
    ...(sustain.length ? { sustain } : {})
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
      for (const level of [1, maxLevel]) {
        byLevel[level] = summarise(new Timing(tables, level).buff(id, {}, 0));
        const fires = new FireSchedule(tables, level).source(id);
        if (fires.length) byLevel[level].fires = fires;
      }
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

// Adds each Auxiliary item's passive effects to data/equipment.js (`effects`), from the game's own
// skill and buff tables. mrlar.dev's equipments.json gives the buff ids an item attaches; AzurLaneData
// holds what those buffs and the skills they cast do. Run by hand after a game update:
// node scripts/import-aux-effects.js
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const EQUIPMENTS = "https://azurlane.mrlar.dev/db/static/json/equipments.json";
const GAME_DATA = "https://raw.githubusercontent.com/AzurLaneTools/AzurLaneData/main/EN";
const SKILLS = `${GAME_DATA}/GameCfg/skill.json`;
const BUFFS = `${GAME_DATA}/GameCfg/buff.json`;
const SKILL_TEXT = `${GAME_DATA}/ShareCfg/skill_data_template.json`;

// mrlar.dev rarity codes, checked against known items: Super Heavy Shell 5, Admiralty Fire Control Table 6.
const RARITY = { 1: "Common", 2: "Common", 3: "Rare", 4: "Elite", 5: "Super Rare", 6: "Ultra Rare" };
// Enemy nationality 99 is the Sirens (Arbiters, Omitter, Obstructor... in maps.json).
const SIREN_TAG = /^DMG_FROM_TAG_\d+_N_99$/;

// Precision over recall: every link and effect must have one of these shapes, with no argument
// outside the listed keys, or the whole item is left out. Conditions live in extra arguments
// (6CRH's `nationality`, Fire Control Table's `check_target`), so they reject by construction.
function hasOnly(args, keys) {
  return Object.keys(args || {}).every(key => keys.includes(key));
}

function sameTrigger(effect, trigger) {
  return JSON.stringify(effect.trigger) === JSON.stringify(trigger);
}

class Walker {
  constructor(skills, buffs) {
    this.skills = skills;
    this.buffs = buffs;
  }

  // `proc` carries an onUpdate timer and its cast chance down to the buff they end in.
  buff(id, proc, depth = 0) {
    const buff = this.buffs[`buff_${id}`];
    if (!buff || depth > 6) return null;
    const effects = [];
    for (const effect of buff.effect_list || []) {
      const args = effect.arg_list || {};
      let found;
      if (effect.type === "BattleBuffCastSkill" && sameTrigger(effect, ["onStartGame"]) && hasOnly(args, ["skill_id", "group"])) {
        found = this.skill(args.skill_id, proc, depth + 1);
      } else if (effect.type === "BattleBuffAddBuff" && sameTrigger(effect, ["onUpdate"]) && hasOnly(args, ["buff_id", "target", "time"]) &&
        args.target === "TargetSelf" && args.time > 0 && !proc) {
        found = this.buff(args.buff_id, { period: args.time, chance: 1 }, depth + 1);
      } else if (effect.type === "BattleBuffCastSkill" && sameTrigger(effect, ["onAttach"]) && hasOnly(args, ["skill_id", "target", "rant"]) &&
        args.target === "TargetSelf" && proc && args.rant > 0) {
        found = this.skill(args.skill_id, { ...proc, chance: proc.chance * args.rant / 10000 }, depth + 1);
      } else {
        found = this.terminal(effect, buff, proc, effects);
        if (found === "skip") continue;
      }
      if (!found) return null;
      effects.push(...found);
    }
    return effects;
  }

  skill(id, proc, depth) {
    const skill = this.skills[`skill_${id}`];
    if (!skill || !(skill.effect_list || []).length) return null;
    const effects = [];
    for (const entry of skill.effect_list) {
      const args = entry.arg_list || {};
      if (entry.type !== "BattleSkillAddBuff" || entry.target_choise !== "TargetSelf" || !hasOnly(args, ["buff_id"])) return null;
      const found = this.buff(args.buff_id, proc, depth + 1);
      if (!found) return null;
      effects.push(...found);
    }
    return effects;
  }

  // A permanent effect needs a buff that never expires and no proc; a proc effect needs both.
  terminal(effect, buff, proc, siblings) {
    const args = effect.arg_list || {};
    const permanent = !proc && buff.time === 0;
    if (effect.type === "BattleBuffAddBulletAttr" && sameTrigger(effect, ["onBulletCreate"]) && hasOnly(args, ["attr", "index", "number"]) &&
      permanent && JSON.stringify(args.index) === "[1]" && (args.attr === "cri" || args.attr === "criDamage")) {
      return [{ key: args.attr === "cri" ? "critRate" : "critDamage", amount: percent(args.number), source: "Main Gun" }];
    }
    if (effect.type !== "BattleBuffAddAttr" || typeof args.number !== "number") return null;
    // `group` is the game's no-stacking group (only the strongest member applies), not a condition.
    if (permanent && sameTrigger(effect, ["onAttach"]) && hasOnly(args, ["attr", "number", "group"])) {
      if (args.attr === "injureRatioByBulletTorpedo") return [{ key: "damageTaken", amount: percent(-args.number), source: "Torpedo" }];
      // One attribute per Siren tag, all carrying the same value: kept once.
      if (SIREN_TAG.test(args.attr)) {
        if (siblings.some(e => e.target === "Sirens")) return "skip";
        return [{ key: "damageTaken", amount: percent(-args.number), target: "Sirens", ...(args.group ? { group: args.group } : {}) }];
      }
      return null;
    }
    if (proc && buff.time > 0 && sameTrigger(effect, ["onAttach", "onRemove"]) && hasOnly(args, ["attr", "number", "group"])) {
      // Rudder: an evade-everything window. immuneDirectHit is the other half of the same window.
      if (args.attr === "perfectDodge") return [{ key: "dodgeUptime", amount: percent(proc.chance * buff.time / proc.period) }];
      if (args.attr === "immuneDirectHit") return "skip";
    }
    return null;
  }
}

function percent(fraction) {
  return Math.round(fraction * 1000) / 10;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
}

(async () => {
  const [equipments, skills, buffs, texts] = await Promise.all([EQUIPMENTS, SKILLS, BUFFS, SKILL_TEXT].map(getJson));
  const games = Object.values(equipments).filter(e => e.type === 10);
  const walker = new Walker(skills, buffs);

  const target = join(__dirname, "..", "data", "equipment.js");
  const context = {};
  vm.runInNewContext(readFileSync(target, "utf8").replace(/^const (\w+) =/, "this.$1 ="), context);
  const items = context.EQUIPMENT_DATA;

  const imported = [];
  const unmatched = [];
  for (const item of items) {
    delete item.effects;
    if (item.category !== "Auxiliary") continue;
    // Game names differ from the wiki's for some items (Type 1 AP Shell); mrlar.dev lists the wiki's as aliases.
    const named = games.filter(e => e.name === item.name || (e.aliases || []).includes(item.name));
    const matches = named.filter(e => RARITY[e.rarity] === item.rarity);
    const buffSets = new Set(matches.map(e => JSON.stringify(e.skills)));
    if (buffSets.size !== 1) {
      unmatched.push(`${item.name} (${item.rarity}): ${matches.length} matches`);
      continue;
    }
    const effects = [];
    for (const id of matches[0].skills) {
      const found = walker.buff(id, null);
      const text = texts[id] && texts[id].desc;
      if (found && found.length && text) effects.push(...found.map(effect => ({ ...effect, buff: id, text })));
    }
    if (effects.length) {
      item.effects = effects;
      imported.push(`${item.name} (${item.rarity}): ${effects.map(e => `${e.key} ${e.amount}${e.source ? " " + e.source : ""}${e.target ? " vs " + e.target : ""}`).join(", ")}`);
    }
  }

  writeFileSync(target, `const EQUIPMENT_DATA = ${JSON.stringify(items, null, 2)};\n`);
  console.log(`${imported.length} auxiliaries carry imported effects:\n  ${imported.join("\n  ")}`);
  if (unmatched.length) console.log(`Not matched to game data:\n  ${unmatched.join("\n  ")}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

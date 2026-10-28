// Adds each Auxiliary item's passive effects to data/equipment.js (`effects`), from the game's own
// skill and buff tables. mrlar.dev's equipments.json links an item to its skill ids; AzurLaneData
// holds what those skills do. Run by hand after a game update: node scripts/import-aux-effects.js
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

// Precision over recall: a skill whose text names a condition, a proc or a timer is left out whole,
// since its buff tables alone do not say when it holds (6CRH's bonus is Royal Navy only).
const CONDITIONAL_TEXT = /\b(when|if|once|chance|every|after|while|during|equipped by|for \d)/i;

// Bullet attributes on weapon index 1, which the game's text calls the Main Gun.
const BULLET_ATTRS = { cri: "critRate", criDamage: "critDamage" };

function readEffect(effect) {
  const args = effect.arg_list || {};
  const key = BULLET_ATTRS[args.attr];
  const onBullet = JSON.stringify(effect.trigger) === '["onBulletCreate"]';
  if (effect.type !== "BattleBuffAddBulletAttr" || !key || !onBullet) return null;
  if (JSON.stringify(args.index) !== "[1]" || typeof args.number !== "number") return null;
  return { key, amount: Math.round(args.number * 1000) / 10, source: "Main Gun" };
}

// Every part of the skill must be understood, or none of it is imported.
function readSkill(id, skills, buffs, texts) {
  const skill = skills[`skill_${id}`];
  const text = texts[id] && texts[id].desc;
  if (!skill || !text || CONDITIONAL_TEXT.test(text)) return null;
  const effects = [];
  for (const entry of skill.effect_list || []) {
    if (entry.type !== "BattleSkillAddBuff" || entry.target_choise !== "TargetSelf") return null;
    const buff = buffs[`buff_${entry.arg_list && entry.arg_list.buff_id}`];
    if (!buff || buff.time !== 0) return null;
    for (const buffEffect of buff.effect_list || []) {
      const effect = readEffect(buffEffect);
      if (!effect) return null;
      effects.push({ ...effect, buff: buff.id, text });
    }
  }
  return effects.length ? effects : null;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
}

(async () => {
  const [equipments, skills, buffs, texts] = await Promise.all([EQUIPMENTS, SKILLS, BUFFS, SKILL_TEXT].map(getJson));
  const games = Object.values(equipments).filter(e => e.type === 10);

  const target = join(__dirname, "..", "data", "equipment.js");
  const context = {};
  vm.runInNewContext(readFileSync(target, "utf8").replace(/^const (\w+) =/, "this.$1 ="), context);
  const items = context.EQUIPMENT_DATA;

  let withEffects = 0;
  const unmatched = [];
  for (const item of items) {
    delete item.effects;
    if (item.category !== "Auxiliary") continue;
    // Game names differ from the wiki's for some items (Type 1 AP Shell); mrlar.dev lists the wiki's as aliases.
    const named = games.filter(e => e.name === item.name || (e.aliases || []).includes(item.name));
    const matches = named.filter(e => RARITY[e.rarity] === item.rarity);
    const skillSets = new Set(matches.map(e => JSON.stringify(e.skills)));
    if (skillSets.size !== 1) {
      unmatched.push(`${item.name} (${item.rarity}): ${matches.length} matches`);
      continue;
    }
    const effects = matches[0].skills.flatMap(id => readSkill(id, skills, buffs, texts) || []);
    if (effects.length) {
      item.effects = effects;
      withEffects++;
    }
  }

  writeFileSync(target, `const EQUIPMENT_DATA = ${JSON.stringify(items, null, 2)};\n`);
  console.log(`${withEffects} auxiliaries carry imported effects.`);
  if (unmatched.length) console.log(`Not matched to game data:\n  ${unmatched.join("\n  ")}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

// Adds ships released after the datamine snapshot to data/ships.js, from the wiki pages the user
// saved by hand (skill text, barrages, armour, augments), mrlar.dev's ships.json (stats and slots
// at max limit break) and Fernando2603's datamine (paintings, thumbnails, skill icons):
//   node scripts/import-wiki-ships.js "Tiger" "Saratoga META" ...
// A ship already present (same gid) is replaced. Review the printed statBonuses before committing.
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

const ROOT = join(__dirname, "..");
const PAGES = join(ROOT, "Site web", "ships");
const MRLAR_SHIPS = "https://azurlane.mrlar.dev/db/static/json/ships.json";
const DATAMINE = "https://raw.githubusercontent.com/Fernando2603/AzurLane/main";
const WIKI = "https://azurlane.koumakan.jp/wiki/";
// The generic All Out Assault icon, for ship-specific ones the datamine lacks.
const ALL_OUT_ASSAULT_ICON = "assets/skill-icons/Skill_20000.png";
const PLACEHOLDER = "assets/skin-placeholder.png";
// The existing card JPEGs are flattened onto this navy, read off their transparent corners.
const CARD_BACKGROUND = "#0b1121";

const STAT_KEYS = { health: "hp", firepower: "fp", torpedo: "trp", antiair: "aa", aviation: "avi", reload: "rld", accuracy: "hit", evasion: "eva", speed: "spd", luck: "luck", asw: "asw" };
const MRLAR_TO_STAT = Object.fromEntries(Object.entries(STAT_KEYS).map(([k, v]) => [v, k]));
const SKILL_TYPE_BY_COLOUR = { pink: "offense", gold: "support", deepskyblue: "defense" };
const SCALING_STAT = { FP: "firepower", TRP: "torpedo", AVI: "aviation", AA: "antiair", ASW: "asw" };
const HULL_TYPE_BY_WIKI = { "Submarine Carrier": "Aviation Submarine" };
const SAILING_HULL = { Vanguard: "IXV", Main: "IXM", Submarine: "IXS" };
// The wiki prefixes a replacement skill's name; the app pairs it with the skill just before it.
const SKILL_MARKERS = { "Augment Module": "Aug", "Retrofit": "R", "Fate Simulation": "FS" };

// --- Skill stat bonuses -----------------------------------------------------------------------
// Rebuilt after the original one-off extractor was lost; it finds 96% of the 2214 bonuses that
// extractor wrote, and the app re-reads `raw` for the scope anyway ("Known data quality issues").
const STAT_TERMS = [
  [/\bevasion rate\b|\bevasion chance\b/i, "evasionRate"],
  [/\bcrit(?:ical)?\s+(?:hit\s+)?(?:rate|chance)\b/i, "critRate"],
  [/\bcrit(?:ical)?\s+(?:hit\s+)?(?:DMG|damage)\b/i, "critDamage"],
  [/\bhit rate\b|\baccuracy rate\b/i, "hitRate"],
  [/\b(?:main gun|weapon|gun|torpedo|aircraft)s?\s+efficiency\b/i, "weaponEfficiency"],
  [/\b(?:DMG|damage)\s+(?:taken|received)\b/i, "damageTaken"],
  [/\b(?:(?:torpedo|main gun|gun|aircraft|burn|airstrike|barrage)\s+)?(?:DMG|damage)\b/i, "damageDealt"],
  [/\bFP\b|\bFirepower\b/i, "firepower"],
  [/\bTRP\b|\bTorpedo(?: stat)?\b(?!\s+(?:DMG|damage|bomber|crit|critical|efficiency|launch|speed))/i, "torpedo"],
  [/(?:\bAA\b|\bAnti-?Air\b)(?!\s+(?:gun|guns)\b)/i, "antiair"],
  [/\bAVI\b|\bAviation\b/i, "aviation"],
  [/\bRLD\b|\bReload\b/i, "reload"],
  [/\bACC\b|\bAccuracy\b|\bHIT\b/, "accuracy"],
  [/\bEVA\b|\bEvasion\b/i, "evasion"],
  [/\bSPD\b|(?<!(?:flight|recovery|torpedo|aircraft|reload|attack|fire|firing|movement|bullet|projectile)\s)\bSpeed\b/i, "speed"],
  [/\bLCK\b|\bLuck\b/i, "luck"],
  [/\bASW\b/, "asw"],
  [/\bOXY\b|\bOxygen\b/i, "oxygen"]
];
const SELF_RE = /\bthis (?:ship|boat|character)\b|\bown\b|\bher\b|\bherself\b|\bitself\b/i;
const FLEET_RE = /\bfleet\b|\bvanguard\b|\bmain\b|\byour\b|\ball\b|\bships\b|\ballies\b|\ballied\b/i;
const AMOUNT_RE = /\bby (\d+(?:\.\d+)?)(%?)(?: ?\((\d+(?:\.\d+)?)%?\))?(?![\d/])/g;
const VERB_RE = /\b(increase[sd]?|decrease[sd]?|reduce[sd]?|raise[sd]?|boost[sd]?|lower[sd]?|increasing|decreasing|reducing|raising|boosting|lowering)\b/gi;

function statsIn(text) {
  const found = [];
  let rest = text;
  // Longer terms are blanked once matched, so "Evasion Rate" does not also count as EVA.
  for (const [re, key] of STAT_TERMS) {
    const global = new RegExp(re.source, re.flags + "g");
    for (const m of [...rest.matchAll(global)]) {
      found.push([m.index, key]);
      rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
    }
  }
  return found.sort((a, b) => a[0] - b[0]).map(f => f[1]).filter((k, i, all) => all.indexOf(k) === i);
}

function lastBoundary(head) {
  let last = 0;
  for (const m of head.matchAll(/\.(?!\d)\s|[:;]/g)) last = m.index + m[0].length;
  return last;
}

function extractStatBonuses(description) {
  const text = description.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  const out = [];
  let previousEnd = 0;
  for (const m of text.matchAll(AMOUNT_RE)) {
    const windowStart = Math.max(lastBoundary(text.slice(0, m.index)), previousEnd);
    const head = text.slice(windowStart, m.index);
    const verbs = [...head.matchAll(VERB_RE)];
    const verb = verbs.at(-1);
    let start;
    if (verb) start = windowStart + verb.index;
    else {
      // "..., and SPD by 3" continues the previous bonus's verb.
      const connector = /(?:,\s*(?:and\s+)?|\band\s+)(?=[^,]*$)/.exec(head);
      if (!connector || previousEnd === 0) { previousEnd = m.index + m[0].length; continue; }
      start = windowStart + connector.index + connector[0].length;
    }
    previousEnd = m.index + m[0].length;
    const span = text.slice(start, m.index);
    const raw = text.slice(start, previousEnd).trim();
    const negative = verb && /^(decreas|reduc|lower)/i.test(verb[1]);
    const stats = statsIn(span).filter(s => negative ? s === "damageTaken" : s !== "damageTaken");
    if (!stats.length) continue;
    // Debuffs on enemies are not bonuses, nor are buffs on a third party ("that ship's FP" for
    // the ally Merkuriy saves, "that fleet's" for a fleet this ship is not in).
    if (/\b(?:their|its)\b/i.test(span) && !/\b(?:your|allies|allied|ships)\b/i.test(span)) continue;
    if (/\bthat (?:ship|boat|fleet)'s\b/i.test(span)) continue;
    if (/\b(?:enem(?:y|ies)|target)(?:'s|s'|'|)\s+(?:\w+\s+){0,3}by\b/i.test(span) && !/dealt|against|to (?:enem|that|the)/i.test(span)) continue;
    const min = Number(m[1]);
    out.push({
      stats,
      min,
      max: m[3] !== undefined ? Number(m[3]) : min,
      isPercent: m[2] === "%",
      scope: SELF_RE.test(raw) ? "self" : FLEET_RE.test(raw) ? "fleet" : "self",
      raw
    });
  }
  return out;
}

// --- Wiki page --------------------------------------------------------------------------------
const decode = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const text = html => decode(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Same shape as the stored descriptions: only <b> kept, tooltips folded into parentheses.
function cleanDescription(html) {
  let s = html.replace(/<style[\s\S]*?<\/style>/g, "");
  s = s.replace(/<div class="tooltip2-text"[^>]*>([\s\S]*?)<\/div>/g, " ($1)");
  s = s.replace(/<(?!\/?b>)[^>]+>/g, " ");
  return decode(s).replace(/\s+/g, " ").replace(/\s+([.,;:)])/g, "$1").replace(/\(\s+/g, "(").trim();
}

function infobox(page, label) {
  const m = new RegExp(`<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`).exec(page);
  return m && m[1];
}

function parsePage(page) {
  const firstAttr = (html, attr) => (new RegExp(`${attr}="([^"]*)"`).exec(html || "") || [])[1];
  const rarity = firstAttr(infobox(page, "Rarity"), "title");
  const classification = text(infobox(page, "Classification"));
  const faction = text(infobox(page, "Faction"));
  const shipClass = infobox(page, "Class") && text(infobox(page, "Class"));
  const armor = (/<td[^>]*>\s*(Light|Medium|Heavy)\s*<\/td>/.exec(page) || [])[1];

  const statsTable = page.slice(page.indexOf("Level 125"));
  const level125 = [...statsTable.slice(0, statsTable.indexOf("</tr>")).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => text(m[1]));

  const gearStart = page.indexOf("Max #");
  const gear = page.slice(gearStart, page.indexOf("</table>", gearStart));
  const augmentRow = /<th>Augment<\/th>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/.exec(gear);
  const augmentModules = augmentRow ? [...augmentRow[1].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(m => text(m[1])) : [];

  const skillsStart = page.indexOf('class="ship-skills wikitable"');
  const skillTable = page.slice(skillsStart, page.indexOf("</table>", skillsStart));
  const skills = [...skillTable.matchAll(/<td class="skill-icon" style="background: (\w+);">[\s\S]*?Skill_(\d+)\.png[\s\S]*?<td class="skill-name"[^>]*><b>([\s\S]*?)<\/b>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map(m => {
      const prefixed = /^\(([^)]+)\)\s*(.*)$/.exec(text(m[3]));
      const marker = prefixed && SKILL_MARKERS[prefixed[1]];
      if (prefixed && !marker) throw new Error(`Unknown skill prefix "${prefixed[1]}".`);
      // 505 of the 511 stored All Out Assault skills carry the bare name; the wiki sometimes
      // appends the ship ("All Out Assault - -14" on I-14).
      const name = (marker ? prefixed[2] : text(m[3])).replace(/^All Out Assault - .*$/, "All Out Assault");
      return { colour: m[1], iconId: m[2], name, marker: marker || null, description: cleanDescription(m[4]) };
    });

  const barrageStart = page.indexOf("barrageTable");
  const barrages = [];
  if (barrageStart >= 0) {
    const table = page.slice(barrageStart, page.indexOf("</table>", barrageStart));
    let title = null;
    for (const row of table.matchAll(/<tr class="barrageRow">([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
      if (/barrageTitle/.test(cells[0][1])) title = text(cells.shift()[2]);
      const [scaling, ammo, base, count, light, medium, heavy, notes, effect] = cells.map(c => c[2]);
      const scale = /^(\S+)×([\d.]+)$/.exec(text(scaling)) || [];
      const [ammoType, armorModifiers] = ammo.split(/<br\s*\/?>/).map(text);
      const named = /^(.*?)\s*\(([^()]*)\)$/.exec(title);
      const num = s => Number(text(s));
      barrages.push({
        skillName: named ? named[1] : title,
        trigger: named ? named[2] : null,
        statScaling: { stat: SCALING_STAT[scale[1]] || "a", multiplier: Number(scale[2]), raw: text(scaling) },
        ammoType,
        armorModifiers,
        baseDmg: num(base),
        count: num(count),
        lightDmg: num(light),
        mediumDmg: num(medium),
        heavyDmg: num(heavy),
        notes: text(notes) || null,
        effect: text(effect) || null
      });
    }
  }
  return { rarity, classification, faction, shipClass, armor, level125, augmentModules, skills, barrages };
}

// --- Assembly ---------------------------------------------------------------------------------
async function load(url, attempts = 3) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
    return response;
  } catch (error) {
    if (attempts > 1) return load(url, attempts - 1);
    throw new Error(`${url}: ${error.cause ? error.cause.code || error.cause.message : error.message}`);
  }
}

async function saveImage(url, path, transform) {
  const target = join(ROOT, path);
  const buffer = Buffer.from(await (await load(url)).arrayBuffer());
  await transform(sharp(buffer)).toFile(target);
}

function statsFromMrlar(entry) {
  const top = entry.stats.at(-1);
  const base = {}, growth = {}, enhance = {};
  for (const [key, code] of Object.entries(STAT_KEYS)) {
    base[key] = top[code] || 0;
    growth[key] = (top.scaling || {})[code] || 0;
  }
  for (const [code, value] of Object.entries(top.strengthen || {})) if (value) enhance[MRLAR_TO_STAT[code]] = value;
  return { base, growth, enhance };
}

function equipmentFromMrlar(entry) {
  const equipment = {};
  entry.slots.at(-1).forEach((slot, i) => {
    equipment[i + 1] = {
      default: slot.default_id > 0 ? slot.default_id : null,
      slot: i + 1,
      type: slot.types,
      mount: slot.base,
      preload: slot.preload,
      efficiency: slot.efficiency
    };
  });
  return equipment;
}

// The wiki's level 125 row: 100 Affinity (x1.06, floored, not on Speed and Luck).
function level125(stats) {
  const out = {};
  for (const key of Object.keys(STAT_KEYS)) {
    const raw = stats.base[key] + stats.growth[key] * 124 / 1000 + (stats.enhance[key] || 0);
    out[key] = key === "speed" || key === "luck" ? Math.floor(raw) : Math.floor(raw * 1.06);
  }
  return out;
}

(async () => {
  const names = process.argv.slice(2);
  if (!names.length) throw new Error("Give the ship names to import.");
  const dataPath = join(ROOT, "data", "ships.js");
  const context = {};
  vm.runInNewContext(readFileSync(dataPath, "utf8").replace(/^const (\w+) =/, "this.$1 ="), context);
  const ships = context.SHIPS_DATA;
  const [mrlar, skinList, skillIcons] = await Promise.all([
    load(MRLAR_SHIPS).then(r => r.json()).then(Object.values),
    load(`${DATAMINE}/ship_skin_list.json`).then(r => r.json()),
    load(`${DATAMINE}/skill_icon.json`).then(r => r.json())
  ]);
  const hullShortByType = new Map(ships.map(s => [s.hullType, s.hullShort]));
  const roleByHull = new Map(ships.map(s => [s.hullShort, s.role]));
  const classes = new Set(ships.map(s => s.class));

  for (const name of names) {
    const pagePath = [".html", ".htm"].map(ext => join(PAGES, name + ext)).find(existsSync);
    if (!pagePath) throw new Error(`No saved wiki page for ${name}.`);
    const wiki = parsePage(readFileSync(pagePath, "utf8"));
    const game = mrlar.find(s => s.name === name);
    const skins = (skinList.find(s => s.gid === (game && game.gid)) || {}).skins;
    if (!game || !skins) throw new Error(`${name} is missing from mrlar or the datamine skin list.`);

    const id = game.id;
    const sailing = /^Sailing Frigate \((\w+)\)$/.exec(wiki.classification);
    const hullType = sailing ? "Sailing Frigate" : HULL_TYPE_BY_WIKI[wiki.classification] || wiki.classification;
    const hullShort = sailing ? SAILING_HULL[sailing[1]] : hullShortByType.get(hullType);
    if (!hullShort) throw new Error(`${name}: unknown hull "${wiki.classification}".`);
    const category = name.endsWith(" META") ? "META" : "Standard";
    const shipClass = category === "META" || sailing || !wiki.shipClass ? name
      : classes.has(`${wiki.shipClass} Class`) || !classes.has(wiki.shipClass) ? `${wiki.shipClass} Class` : wiki.shipClass;

    const painting = `assets/paintings/${id}.png`;
    const thumbnail = `assets/thumbnails/${id}.png`;
    const defaultSkin = skins.find(s => s.type === "Default");
    await saveImage(defaultSkin.painting, painting, img => img.resize({ width: 1100 }).png());
    await saveImage(defaultSkin.shipyard, thumbnail, img => img.png());
    await saveImage(defaultSkin.shipyard, `assets/thumbnails-card/${id}.jpg`, img => img.resize({ width: 320 }).flatten({ background: CARD_BACKGROUND }).jpeg({ quality: 77 }));

    const skills = [];
    for (const skill of wiki.skills) {
      let icon = `assets/skill-icons/Skill_${skill.iconId}.png`;
      if (skillIcons[skill.iconId]) {
        if (!existsSync(join(ROOT, icon))) await saveImage(skillIcons[skill.iconId], icon, img => img.resize(45, 45).png());
      } else if (!existsSync(join(ROOT, icon))) {
        icon = skill.name === "All Out Assault" ? ALL_OUT_ASSAULT_ICON : PLACEHOLDER;
      }
      skills.push({
        type: SKILL_TYPE_BY_COLOUR[skill.colour] || "offense",
        name: skill.name,
        marker: skill.marker,
        icon,
        description: skill.description,
        isModified: false,
        isRetrofitVersion: false,
        isNewOnRetrofit: false,
        statBonuses: extractStatBonuses(skill.description)
      });
    }

    const stats = statsFromMrlar(game);
    const ship = {
      id, gid: game.gid, name, class: shipClass, nationality: category === "META" ? "META" : wiki.faction,
      hullType, hullShort, role: roleByHull.get(hullShort), rarity: wiki.rarity, thumbnail,
      hasRetrofit: false, retrofitIcon: null, retrofitRarity: null,
      wikiUrl: WIKI + encodeURIComponent(name), releaseOrder: game.gid, category,
      equipment: equipmentFromMrlar(game), stats, displayName: name, painting, retrofitPainting: null,
      skills,
      skins: skins.map(s => s.type === "Default"
        ? { name: s.name, type: s.type, painting, icon: thumbnail }
        : { name: s.name, type: s.type, painting: PLACEHOLDER, icon: PLACEHOLDER }),
      retrofitBonus: null, armorType: wiki.armor, barrages: wiki.barrages, augmentModules: wiki.augmentModules
    };

    const ours = level125(stats);
    const order = ["health", "firepower", "torpedo", "aviation", "antiair", "reload", "evasion", null, "speed", "accuracy", "luck", "asw"];
    const mismatches = order.map((key, i) => key && Number(wiki.level125[i]) !== ours[key] ? `${key} ${ours[key]}/${wiki.level125[i]}` : null).filter(Boolean);
    console.log(`${name} (${id}, ${hullShort}, ${shipClass}): ${skills.length} skills, ${ship.barrages.length} barrages, ` +
      `augments ${ship.augmentModules.join(", ") || "none"}; level 125 ${mismatches.length ? "differs: " + mismatches.join(", ") : "matches the wiki"}`);
    for (const skill of skills) {
      for (const b of skill.statBonuses) console.log(`  ${skill.name}: ${b.stats.join("+")} ${b.min}-${b.max}${b.isPercent ? "%" : ""} ${b.scope} | ${b.raw}`);
    }

    const existing = ships.findIndex(s => s.gid === ship.gid);
    if (existing >= 0) ships[existing] = ship;
    else ships.push(ship);
  }
  writeFileSync(dataPath, `const SHIPS_DATA = ${JSON.stringify(ships, null, 2)};\n`);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});

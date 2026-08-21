const RARITY_CLASS = {
  "Normal": "rarity-normal",
  "Rare": "rarity-rare",
  "Elite": "rarity-elite",
  "Super Rare": "rarity-super",
  "Priority": "rarity-priority",
  "Ultra Rare": "rarity-ultra",
  "Decisive": "rarity-decisive"
};

const RARITY_ORDER = ["Normal", "Rare", "Elite", "Super Rare", "Priority", "Ultra Rare", "Decisive"];

// Priority and Decisive are the Research-ship equivalents of Super Rare and Ultra
// Rare. They stay separate chips rather than merging into SR/UR, because a player
// filtering for Research ships wants exactly those two.
const MAIN_RARITIES = ["Normal", "Rare", "Elite", "Super Rare", "Ultra Rare"];
const RESEARCH_RARITIES = ["Priority", "Decisive"];

const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");
const searchClassEl = document.getElementById("search-class");
const sortEl = document.getElementById("sort-select");
const filtersEl = document.getElementById("filters");
const refreshBtn = document.getElementById("refresh-btn");
const mainEl = document.querySelector("main");

const ships = SHIPS_DATA;
const shipsById = new Map(ships.map(s => [String(s.id), s]));

// Flattened once at startup so the Interaction tab can scan every skill in the game
// without rebuilding the list on each modal open. Both base and "+" enhanced skills
// are kept: which of the two matches a given category can differ, since a "+" text
// often adds a clause the base never had.
let allSkillsIndex;
function getAllSkillsIndex() {
  if (!allSkillsIndex) {
    allSkillsIndex = ships.flatMap(s => (s.skills || []).map(skill => ({ ship: s, skill })));
  }
  return allSkillsIndex;
}

// hullType stores one word for these two, but skill prose always spells out the
// "Ship" suffix, so matching needs the long form.
const HULL_TYPE_TEXT = {
  Munition: "Munition Ship",
  Repair: "Repair Ship"
};

// The wiki-standard abbreviations that actually appear in skill prose, confirmed
// against the Damage Calculations page ("BB/BC/BBV only", "your SSs and SSVs").
// Shared by the keyword highlighter and the Interaction compound-qualifier check.
const HULL_ABBREVIATIONS = {
  DD: "Destroyer", CL: "Light Cruiser", CA: "Heavy Cruiser", CB: "Large Cruiser",
  BB: "Battleship", BC: "Battlecruiser", BBV: "Aviation Battleship",
  CV: "Aircraft Carrier", CVL: "Light Carrier", SS: "Submarine", SSV: "Aviation Submarine"
};
const HULL_TEXT_TO_ABBR = Object.fromEntries(Object.entries(HULL_ABBREVIATIONS).map(([a, t]) => [t, a]));

// One color per nation. The 13 major/pirate nations use hex values supplied by the
// user verbatim, except Vichya Dominion, Iron Blood and META, whose given values
// measured under 3:1 contrast on this dark surface (2.16 / 2.47 / 2.68) and were
// lightened in HSL space, hue and saturation untouched. Do not "correct" those
// three back to the literal supplied hex.
// The remaining collab nations are picks from each source franchise's own branding.
// 30 hues cannot be pairwise CVD-safe (reliable categorical distinction caps around
// 8) - that trade was made deliberately for authenticity, so the --pairs validator
// will never pass here and re-running it just reproduces the known result.
const NATION_COLORS = {
  "Eagle Union": "#2878B5",
  "Royal Navy": "#D8AE52",
  "Sakura Empire": "#C94C68",
  "Iron Blood": "#d04451",
  "Dragon Empery": "#3A8A69",
  "Sardegna Empire": "#368063",
  "Northern Parliament": "#7296B5",
  "Iris Libre": "#4A8FC4",
  "Vichya Dominion": "#bf566e",
  "Kingdom of Tulipa": "#D77A32",
  "Liga de Pedrería": "#35A6A1",
  "Universal": "#9aa0ab",
  "META": "#8568aa",
  "Tempesta": "#267C76",
  "Neptunia": "#9a6fe0",
  "Bilibili": "#ff8ac2",
  "Utawarerumono": "#6ba3c9",
  "KizunaAI": "#4fd1c5",
  "Hololive": "#3bb0c0",
  "Venus Vacation": "#ff9ec4",
  "The Idolmaster": "#c77dc9",
  "SSSS": "#7ed957",
  "Atelier Ryza": "#e0713f",
  "Senran Kagura": "#d9455f",
  "To LOVE-Ru": "#ffa8d4",
  "BLACK★ROCK SHOOTER": "#5b7fe0",
  "Atelier Yumia": "#4ecf9e",
  "Danmachi": "#e8b04a",
  "Date A Live": "#a875d9",
  "NieR:Automata": "#c9c4b8"
};

// Maps a nation to its faction-logo asset. Keyed by the wiki's own short code
// rather than the nation name, so accented and starred names (Liga de Pedreria,
// BLACK*ROCK SHOOTER) never become filenames.
// The 13 collabs mapped to "Um" genuinely share one generic icon on the wiki - it
// is not a placeholder standing in for missing art, and there is no per-franchise
// logo to find.
const FACTION_LOGO_CODE = {
  "Eagle Union": "Us",
  "Royal Navy": "En",
  "Sakura Empire": "Jp",
  "Iron Blood": "De",
  "Dragon Empery": "Cn",
  "Northern Parliament": "Sn",
  "Iris Libre": "Ff",
  "Vichya Dominion": "Vf",
  "Sardegna Empire": "Rn",
  "Kingdom of Tulipa": "Nl",
  "Liga de Pedrería": "Ldp",
  "Neptunia": "Np",
  "Bilibili": "Bi",
  "Utawarerumono": "Um",
  "META": "Meta",
  "Tempesta": "Mot",
  "Universal": "Cm",
  "KizunaAI": "Um",
  "Hololive": "Um",
  "Venus Vacation": "Um",
  "The Idolmaster": "Um",
  "SSSS": "Um",
  "Atelier Ryza": "Um",
  "Senran Kagura": "Um",
  "To LOVE-Ru": "Um",
  "BLACK★ROCK SHOOTER": "Um",
  "Atelier Yumia": "Um",
  "Danmachi": "Um",
  "Date A Live": "Um",
  "NieR:Automata": "Um"
};

// One nationality carries a disambiguation suffix in the source data
// ("BLACK*ROCK SHOOTER (Nation)") that never appears in skill prose. Strip it
// anywhere the value is matched against text or shown to a user, but NOT where it
// is used as a grouping/filter key, or filter state changes.
function nationDisplayName(nationality) {
  return nationality ? nationality.replace(/\s*\([^)]*\)$/, "") : nationality;
}

// Hex values supplied by the user verbatim; all 15 clear 3:1 on this surface.
// Each row also lists whichever spelling the corpus actually uses, chosen by
// occurrence count: "Anti-Air" hyphenated (63 uses) because the unhyphenated form
// appears zero times, "FP", "Ammo", "HP"/"Max HP" likewise.
// "Oil Consumption" never appears in skill prose at all - it is here for
// completeness with the supplied table and currently highlights nothing.
const STAT_COLOR_GROUPS = [
  { color: "#E3C45B", terms: ["Luck", "LCK"] },
  { color: "#8C9AAA", terms: ["Armor"] },
  { color: "#55BFC4", terms: ["Reload", "RLD"] },
  { color: "#D95C72", terms: ["Health", "HP", "Max HP"] },
  { color: "#E46A47", terms: ["Firepower", "FP"] },
  { color: "#4E87D8", terms: ["Torpedo", "TRP"] },
  { color: "#63B8E8", terms: ["Anti-Air", "AA"] },
  { color: "#66BE82", terms: ["Evasion", "EVA"] },
  { color: "#9671D1", terms: ["Aviation", "AVI"] },
  { color: "#C98B45", terms: ["Oil Consumption"] },
  { color: "#3EA59A", terms: ["ASW", "Anti-Submarine"] },
  { color: "#91B94D", terms: ["Speed", "SPD"] },
  { color: "#74B9CE", terms: ["Oxygen"] },
  { color: "#DCA64C", terms: ["Ammunition", "Ammo"] },
  { color: "#C36CAD", terms: ["Accuracy", "ACC"] }
];
const STAT_COLORS = Object.fromEntries(STAT_COLOR_GROUPS.flatMap(g => g.terms.map(t => [t, g.color])));

// The five statuses that are game-wide vocabulary, picked by corpus frequency:
// Burn (98 descriptions), Special Burn (41), Armor Break (40), Smokescreen (32),
// Flooding (20). Alternate spellings are the ones actually counted in the corpus.
// Unlike the nation and stat tables, THESE FIVE HUES ARE GUESSES - no user table
// and no wiki page documents the game's own colors for these effects. Replace them
// verbatim if real values ever turn up.
const MECHANIC_COLOR_GROUPS = [
  { color: "#F2603C", terms: ["Burn", "Burning"] },
  { color: "#CE72E8", terms: ["Special Burn"] },
  { color: "#3D7FE8", terms: ["Flooding"] },
  { color: "#E8C255", terms: ["Armor Break", "Armor-broken"] },
  { color: "#9FB0C4", terms: ["Smokescreen"] }
];
const MECHANIC_COLORS = Object.fromEntries(MECHANIC_COLOR_GROUPS.flatMap(g => g.terms.map(t => [t, g.color])));

// "AP" is written identically for AP ammunition and for Action Points, so case
// cannot separate them. Checked by hand against all 105 occurrences: Action Points
// is always either preceded by a digit or "more" ("gains 10 AP") or followed by
// "cost"/"consumption"/"-consuming"; the ammunition sense never touches either.
// Split is 71 ammo / 34 Action Points.
function apIsAmmoType(text, index) {
  const before = text.slice(Math.max(0, index - 15), index);
  if (/\d\s*$/.test(before) || /\bmore\s*$/i.test(before)) return false;
  const after = text.slice(index + 2, index + 18);
  return !/^\s*(cost|consumption|-consuming)/i.test(after);
}
// caseSensitive exists only for this group: KEYWORD_ALTERNATIVES compiles with the
// "i" flag (needed because "smokescreen" is lowercase in most of its uses), and
// under that flag "HE" matches the pronoun "he" and "Normal" matches the ordinary
// adjective. Requiring exact case removes every false positive here.
// "high-caliber" is the one entry left case-insensitive: the user wrote it
// capitalised but all 5 corpus occurrences are lowercase mid-sentence, and the
// two-word phrase cannot collide with ordinary prose the way an abbreviation can.
const AMMO_CALIBER_TERMS = {
  "Normal": { color: "#D4A83A", caseSensitive: true },
  "HE": { color: "#E05252", caseSensitive: true },
  "AP": { color: "#5B7FE8", caseSensitive: true, contextGuard: apIsAmmoType },
  "SAP": { color: "#E8892E", caseSensitive: true },
  "high-caliber": { color: "#E05252" },
  "high caliber": { color: "#E05252" }
};

const NAMED_MECHANIC_COLOR = "var(--accent)";

// Four palettes share one sentence, so hue alone cannot say which system a colored
// word belongs to. The treatments are what disambiguate: a stat is bare, a nation
// is underlined, a mechanic sits on a tinted chip, an ammo type is bare. That is
// also why per-mechanic hues sitting close to stat hues is safe.
// Mechanics set keepCase because "smokescreen" is lowercase in 72 of 87 uses, and
// normalising them would be the formatter visibly rewriting the wiki's text.
const KEYWORD_GROUPS = [
  { className: "kw-nation", perTermColor: t => NATION_COLORS[t], underline: true, terms: [...new Set(ships.map(s => nationDisplayName(s.nationality)).filter(Boolean))] },
  { className: "kw-stat", perTermColor: t => STAT_COLORS[t], terms: Object.keys(STAT_COLORS) },
  { className: "kw-mech", perTermColor: t => MECHANIC_COLORS[t], keepCase: true, terms: Object.keys(MECHANIC_COLORS) },
  { className: "kw-ammo", perTermColor: t => AMMO_CALIBER_TERMS[t].color, perTermGuard: t => AMMO_CALIBER_TERMS[t].contextGuard, perTermCaseSensitive: t => AMMO_CALIBER_TERMS[t].caseSensitive, terms: Object.keys(AMMO_CALIBER_TERMS) }
];

const KEYWORD_INFO = new Map();
for (const g of KEYWORD_GROUPS) {
  for (const t of g.terms) {
    if (KEYWORD_INFO.has(t.toLowerCase())) continue;
    const color = g.perTermColor ? g.perTermColor(t) : g.color;
    const contextGuard = g.perTermGuard ? g.perTermGuard(t) : undefined;
    const caseSensitive = g.perTermCaseSensitive ? !!g.perTermCaseSensitive(t) : !!g.caseSensitive;
    KEYWORD_INFO.set(t.toLowerCase(), { color, canonical: t, className: g.className, underline: !!g.underline, keepCase: !!g.keepCase, caseSensitive, contextGuard });
  }
}
const OPERATION_SIREN_TAG_COLOR = "#E8A33D";
const KEYWORD_ALTERNATIVES =
  "\\b(" + [...KEYWORD_INFO.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|") + ")s?\\b" +
  "|(\\d+(?:\\.\\d+)?%?)" +
  "|(\\[Operation Siren\\])";

// Per-skill mechanic names must match AHEAD of the fixed vocabulary, or a name
// starting with a global term ("Standard Armor Break") loses its first word to the
// shorter match. With no names to insert, group 1 compiles to "((?!))" - a group
// that can never match - so every later group keeps its number instead of the
// regex having two different shapes. The no-names case is cached because the
// Interaction list rebuilds it once per rendered entry.
let cachedKeywordRe = null;
function keywordRegExp(names) {
  if (!names || !names.length) return cachedKeywordRe || (cachedKeywordRe = new RegExp("((?!))|" + KEYWORD_ALTERNATIVES, "gi"));
  const alternatives = names.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  return new RegExp("\\b(" + alternatives + ")\\b|" + KEYWORD_ALTERNATIVES, "gi");
}

function keywordInfoFor(matchText, fullText, matchIndex) {
  const lower = matchText.toLowerCase();
  let info = null, plural = false;
  if (KEYWORD_INFO.has(lower)) info = KEYWORD_INFO.get(lower);
  else if (lower.endsWith("s") && KEYWORD_INFO.has(lower.slice(0, -1))) { info = KEYWORD_INFO.get(lower.slice(0, -1)); plural = true; }
  if (!info) return null;
  if (info.caseSensitive && matchText !== info.canonical) return null;
  if (info.contextGuard && !info.contextGuard(fullText, matchIndex)) return null;
  return { ...info, plural };
}

function highlightKeywords(container, mechanics) {
  const KEYWORD_RE = keywordRegExp(mechanics);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    KEYWORD_RE.lastIndex = 0;
    if (!KEYWORD_RE.test(text)) continue;

    KEYWORD_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m;
    while ((m = KEYWORD_RE.exec(text))) {
      if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      if (m[1] !== undefined) {
        const span = document.createElement("span");
        span.className = "kw kw-mech";
        span.style.color = NAMED_MECHANIC_COLOR;
        span.textContent = m[1];
        frag.appendChild(span);
      } else if (m[3] !== undefined) {
        const span = document.createElement("span");
        span.className = "kw kw-num";
        span.textContent = m[3];
        frag.appendChild(span);
      } else if (m[4] !== undefined) {
        const span = document.createElement("span");
        span.className = "kw";
        span.style.color = OPERATION_SIREN_TAG_COLOR;
        span.style.fontWeight = "700";
        span.textContent = m[4];
        frag.appendChild(span);
      } else {
        const info = keywordInfoFor(m[0], text, m.index);
        if (info) {
          const span = document.createElement("span");
          span.className = info.className ? "kw " + info.className : "kw";
          span.style.color = info.color;
          if (info.underline) span.style.textDecoration = "underline";
          span.textContent = info.keepCase ? m[0] : info.canonical + (info.plural ? "s" : "");
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(m[0]));
        }
      }
      lastIndex = KEYWORD_RE.lastIndex;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

(function warmUpGifDecoder() {
  for (const s of ships) {
    const firstGif = (s.barrages || []).flatMap(b => b.gifs || [])[0];
    if (firstGif) {
      const img = new Image();
      img.src = firstGif.path;
      if (img.decode) img.decode().catch(() => {});
      break;
    }
  }
})();

const active = {
  rarity: new Set(),
  hullShort: new Set(),
  role: new Set(),
  nationality: new Set()
};

const HULL_ICON_DIR = "assets/hull-icons/";

const ROLE_ORDER = ["Vanguard", "Main", "Submarine"];

// Nations below this count are folded into the "Subfactions" dropdown instead of
// getting a top-level chip; FORCE_MAJOR_NATIONS keeps a few named ones out front
// regardless of how few ships they have.
const MAJOR_NATION_MIN_SHIPS = 20;

const FORCE_MAJOR_NATIONS = ["Kingdom of Tulipa", "Liga de Pedrería", "Tempesta"];

function uniqueValues(field) {
  return [...new Set(ships.map(s => s[field]))].sort();
}

function nationCounts() {
  const counts = {};
  ships.forEach(s => { counts[s.nationality] = (counts[s.nationality] || 0) + 1; });
  return counts;
}

function makeChip(group, value) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  if (group === "nationality") {
    chip.textContent = nationDisplayName(value);
    const color = NATION_COLORS[nationDisplayName(value)];
    if (color) {
      chip.classList.add("nation-chip");
      chip.style.setProperty("--tag-color", color);
    }
  } else {
    chip.textContent = value;
  }
  if (active[group].has(value)) chip.classList.add("active");
  chip.addEventListener("click", () => {
    if (active[group].has(value)) {
      active[group].delete(value);
      chip.classList.remove("active");
    } else {
      active[group].add(value);
      chip.classList.add("active");
    }
    update();
    syncSubfactionButton();
  });
  return chip;
}

function hullShortsByRole() {
  const map = {};
  ships.forEach(s => {
    if (!s.hullShort) return;
    if (!map[s.role]) map[s.role] = new Map();
    if (!map[s.role].has(s.hullShort)) map[s.role].set(s.hullShort, s.hullType);
  });
  const result = {};
  for (const role of Object.keys(map)) {
    result[role] = [...map[role].entries()]
      .map(([short, fullName]) => ({ short, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "en"));
  }
  return result;
}

function makeCategoryLabel(role) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "category-label";
  btn.title = `Select every ${role} class`;
  btn.textContent = role;
  if (active.role.has(role)) btn.classList.add("active");
  btn.addEventListener("click", () => {
    if (active.role.has(role)) {
      active.role.delete(role);
      btn.classList.remove("active");
    } else {
      active.role.add(role);
      btn.classList.add("active");
    }
    update();
  });
  return btn;
}

function makeHullChip(short, fullName) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip hull-chip";
  chip.title = fullName;
  if (active.hullShort.has(short)) chip.classList.add("active");

  const icon = document.createElement("img");
  icon.className = "hull-chip-icon";
  icon.src = HULL_ICON_DIR + short + ".png";
  icon.alt = "";
  chip.appendChild(icon);

  const label = document.createElement("span");
  label.textContent = short;
  chip.appendChild(label);

  chip.addEventListener("click", () => {
    if (active.hullShort.has(short)) {
      active.hullShort.delete(short);
      chip.classList.remove("active");
    } else {
      active.hullShort.add(short);
      chip.classList.add("active");
    }
    update();
  });
  return chip;
}

function buildClassRow() {
  const byRole = hullShortsByRole();
  const wrap = document.createElement("div");
  wrap.className = "filter-group class-row";

  const rolesPresent = ROLE_ORDER.filter(r => byRole[r]);
  rolesPresent.forEach((role, i) => {
    wrap.appendChild(makeCategoryLabel(role));
    byRole[role].forEach(({ short, fullName }) => wrap.appendChild(makeHullChip(short, fullName)));
    if (i < rolesPresent.length - 1) {
      const sep = document.createElement("span");
      sep.className = "category-sep";
      sep.textContent = "|";
      wrap.appendChild(sep);
    }
  });

  filtersEl.appendChild(wrap);
}

function buildRarityRow() {
  const wrap = document.createElement("div");
  wrap.className = "filter-group";

  const title = document.createElement("span");
  title.className = "filter-group-label";
  title.textContent = "Rarity";
  wrap.appendChild(title);

  const present = uniqueValues("rarity");
  MAIN_RARITIES.filter(r => present.includes(r)).forEach(r => wrap.appendChild(makeChip("rarity", r)));

  const research = RESEARCH_RARITIES.filter(r => present.includes(r));
  if (research.length) {
    const sep = document.createElement("span");
    sep.className = "category-sep";
    sep.textContent = "|";
    wrap.appendChild(sep);

    const researchLabel = document.createElement("span");
    researchLabel.className = "filter-group-label filter-subgroup-label";
    researchLabel.textContent = "Research :";
    wrap.appendChild(researchLabel);

    research.forEach(r => wrap.appendChild(makeChip("rarity", r)));
  }

  filtersEl.appendChild(wrap);
}

let subfactionButton = null;
let subfactionPanel = null;

function syncSubfactionButton() {
  if (!subfactionButton) return;
  const minorNations = uniqueValues("nationality").filter(n => nationCounts()[n] < MAJOR_NATION_MIN_SHIPS && !FORCE_MAJOR_NATIONS.includes(n));
  const selectedCount = minorNations.filter(n => active.nationality.has(n)).length;
  subfactionButton.textContent = selectedCount > 0 ? `Subfactions (${selectedCount}) ▾` : "Subfactions ▾";
  subfactionButton.classList.toggle("active", selectedCount > 0);
}

function buildFilterPanel() {
  filtersEl.innerHTML = "";

  buildClassRow();
  buildRarityRow();

  const counts = nationCounts();
  const allNations = uniqueValues("nationality");
  const majorNations = allNations.filter(n => counts[n] >= MAJOR_NATION_MIN_SHIPS || FORCE_MAJOR_NATIONS.includes(n));
  const minorNations = allNations.filter(n => counts[n] < MAJOR_NATION_MIN_SHIPS && !FORCE_MAJOR_NATIONS.includes(n));

  const nationWrap = document.createElement("div");
  nationWrap.className = "filter-group";

  const nationTitle = document.createElement("span");
  nationTitle.className = "filter-group-label";
  nationTitle.textContent = "Nation";
  nationWrap.appendChild(nationTitle);

  majorNations.forEach(value => nationWrap.appendChild(makeChip("nationality", value)));

  const dropdownWrap = document.createElement("div");
  dropdownWrap.className = "subfaction-dropdown";

  subfactionButton = document.createElement("button");
  subfactionButton.type = "button";
  subfactionButton.className = "chip subfaction-toggle";

  subfactionPanel = document.createElement("div");
  subfactionPanel.className = "subfaction-panel";
  subfactionPanel.hidden = true;
  minorNations.forEach(value => subfactionPanel.appendChild(makeChip("nationality", value)));

  subfactionButton.addEventListener("click", event => {
    event.stopPropagation();
    subfactionPanel.hidden = !subfactionPanel.hidden;
  });

  dropdownWrap.appendChild(subfactionButton);
  dropdownWrap.appendChild(subfactionPanel);
  nationWrap.appendChild(dropdownWrap);
  filtersEl.appendChild(nationWrap);

  syncSubfactionButton();
}

document.addEventListener("click", event => {
  if (subfactionPanel && !subfactionPanel.hidden && !event.target.closest(".subfaction-dropdown")) {
    subfactionPanel.hidden = true;
  }
});

function applyFilters(list) {
  return list.filter(s => {
    for (const key of Object.keys(active)) {
      if (active[key].size > 0 && !active[key].has(s[key])) return false;
    }
    return true;
  });
}

// Diacritics stripped on both sides so "agir" finds "Ägir" - NFD splits a letter
// from its own combining accent mark, which the U+0300-U+036F range then removes.
function foldAccents(str) {
  return str.normalize("NFD").replace(new RegExp("[\u0300-\u036f]", "g"), "");
}

function applySearch(list) {
  const q = foldAccents(searchEl.value.trim().toLowerCase());
  const qClass = foldAccents(searchClassEl.value.trim().toLowerCase());
  let result = list;
  if (q) result = result.filter(s => foldAccents(s.displayName.toLowerCase()).includes(q));
  if (qClass) result = result.filter(s => foldAccents((s.class || "").toLowerCase()).includes(qClass));
  return result;
}

function applySort(list) {
  const sorted = [...list];
  const [field, dir] = sortEl.value.split("-");
  const mult = dir === "desc" ? -1 : 1;

  sorted.sort((a, b) => {
    let cmp = 0;
    if (field === "name") {
      cmp = a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base", numeric: true });
    } else if (field === "rarity") {
      cmp = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    } else if (field === "hullType") {
      cmp = a.hullType.localeCompare(b.hullType, "en");
    } else if (field === "nationality") {
      cmp = a.nationality.localeCompare(b.nationality, "en");
    } else if (field === "release") {
      cmp = a.releaseOrder - b.releaseOrder;
    }
    if (cmp === 0) cmp = a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base", numeric: true });
    return cmp * mult;
  });
  return sorted;
}

function cardThumbnailPath(path) {
  if (!path.startsWith("assets/thumbnails/")) return path;
  return path.replace("assets/thumbnails/", "assets/thumbnails-card/").replace(/\.png$/, ".jpg");
}

function cardThumbnailWebpPath(path, suffix = "") {
  return cardThumbnailPath(path).replace(/\.jpg$/, `${suffix}.webp`);
}

function createCardThumbnail(path, className, alt) {
  const image = document.createElement("img");
  image.className = className;
  image.src = cardThumbnailPath(path);
  image.alt = alt;
  image.width = 3;
  image.height = 4;
  image.loading = "lazy";
  image.decoding = "async";

  if (document.documentElement.dataset.webpAssets !== "true") {
    return { picture: image, image };
  }

  const picture = document.createElement("picture");
  const source = document.createElement("source");
  source.srcset = `${cardThumbnailWebpPath(path)} 144w, ${cardThumbnailWebpPath(path, "@2x")} 288w`;
  source.sizes = "143px";
  source.type = "image/webp";
  picture.appendChild(source);
  picture.appendChild(image);
  return { picture, image };
}

function createCard(ship) {
  const hasRarityShift = ship.hasRetrofit && ship.retrofitRarity !== ship.rarity;

  const card = document.createElement("article");
  card.className = ship.hasRetrofit && ship.retrofitIcon ? "card has-retrofit" : "card";
  card.dataset.id = String(ship.id);

  const strip = document.createElement("div");
  strip.className = "rarity-strip";
  const baseColor = `var(--${RARITY_CLASS[ship.rarity] || "rarity-normal"})`;
  if (hasRarityShift) {
    const retrofitColor = `var(--${RARITY_CLASS[ship.retrofitRarity] || "rarity-normal"})`;
    strip.style.background = `linear-gradient(90deg, ${baseColor} 0%, ${baseColor} 38%, ${retrofitColor} 62%, ${retrofitColor} 100%)`;
  } else {
    strip.style.background = baseColor;
  }
  card.appendChild(strip);

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "thumb-wrap";

  const baseThumbnail = createCardThumbnail(ship.thumbnail, "thumb-base", ship.displayName);
  thumbWrap.appendChild(baseThumbnail.picture);

  if (ship.hasRetrofit && ship.retrofitIcon) {
    const badge = document.createElement("span");
    badge.className = "retrofit-badge";
    badge.title = "Retrofit available — hover to preview";
    badge.textContent = "⟲";
    thumbWrap.appendChild(badge);

    const loadRetrofitPreview = () => {
      if (thumbWrap.querySelector(".thumb-retrofit")) return;
      const retrofitThumbnail = createCardThumbnail(ship.retrofitIcon, "thumb-retrofit", `${ship.displayName} (retrofit)`);
      thumbWrap.insertBefore(retrofitThumbnail.picture, badge);
    };
    card.addEventListener("pointerenter", loadRetrofitPreview, { once: true });
  }

  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = ship.displayName;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = hasRarityShift
    ? `${ship.hullType} · ${ship.rarity} → ${ship.retrofitRarity}`
    : `${ship.hullType} · ${ship.rarity}`;
  info.appendChild(name);
  info.appendChild(meta);

  card.appendChild(thumbWrap);
  card.appendChild(info);

  const activateButton = document.createElement("button");
  activateButton.className = "card-activate";
  activateButton.type = "button";
  activateButton.setAttribute("aria-label", `View ${ship.displayName} details`);
  card.appendChild(activateButton);

  return card;
}

function render(list) {
  grid.replaceChildren();
  countEl.textContent = `${list.length} character${list.length > 1 ? "s" : ""}`;

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No character matches these filters.";
    grid.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const ship of list) fragment.appendChild(createCard(ship));
  grid.appendChild(fragment);
}

function update() {
  let list = applySearch(ships);
  list = applyFilters(list);
  list = applySort(list);
  render(list);
}

function resetAll() {
  searchEl.value = "";
  searchClassEl.value = "";
  sortEl.value = "name-asc";
  for (const key of Object.keys(active)) active[key].clear();
  filtersEl.querySelectorAll(".chip.active, .category-label.active").forEach(chip => chip.classList.remove("active"));
  if (subfactionPanel) subfactionPanel.hidden = true;
  syncSubfactionButton();
  update();
}

searchEl.addEventListener("input", update);
searchClassEl.addEventListener("input", update);
sortEl.addEventListener("change", update);

refreshBtn.addEventListener("click", () => {
  resetAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

buildFilterPanel();
update();
mainEl.removeAttribute("aria-busy");

// Reproduces the game's own compact stat panel: a 3-column grid read left to right,
// HP/Armor/RLD, FP/TRP/EVA, AA/AVI/Cost, ASW/./., then SPD/ACC/LCK. The two nulls
// are slots the game leaves empty for surface ships; they render as blank cells
// rather than collapsing, or the columns stop lining up.
// Ammunition, Oxygen and Oil Consumption are deliberately absent: all three are
// 0/888 ships with any numeric value, so they would show "-" forever. Before
// removing another stat, count it across data/ships.json the same way rather than
// assuming it is empty.
// "text" marks a non-numeric value (Armor is Light/Medium/Heavy), "custom" one that
// is computed rather than read from ship.stats - which is why NUMERIC_STAT_KEYS
// excludes both.
const STAT_GRID = [
  { key: "health", label: "HP", icon: "assets/stat-icons/health.png" },
  { key: "armor", label: "Armor", icon: "assets/stat-icons/armor.png", text: true },
  { key: "reload", label: "RLD", icon: "assets/stat-icons/reload.png" },
  { key: "firepower", label: "FP", icon: "assets/stat-icons/firepower.png" },
  { key: "torpedo", label: "TRP", icon: "assets/stat-icons/torpedo.png" },
  { key: "evasion", label: "EVA", icon: "assets/stat-icons/evasion.png" },
  { key: "antiair", label: "AA", icon: "assets/stat-icons/antiair.png" },
  { key: "aviation", label: "AVI", icon: "assets/stat-icons/aviation.png" },
  { key: "cost", label: "Cost", icon: "assets/stat-icons/oilConsumption.png", custom: true },
  { key: "asw", label: "ASW", icon: "assets/stat-icons/asw.png" },
  null,
  null,
  { key: "speed", label: "SPD", icon: "assets/stat-icons/speed.png" },
  { key: "accuracy", label: "ACC", icon: "assets/stat-icons/accuracy.png" },
  { key: "luck", label: "LCK", icon: "assets/stat-icons/luck.png" }
];
const STAT_ABBR = Object.fromEntries(STAT_GRID.filter(Boolean).map(d => [d.key, d.label]));

const NUMERIC_STAT_KEYS = STAT_GRID.filter(d => d && !d.text && !d.custom).map(d => d.key);

const SKILL_TYPE_LABELS = { offense: "Offense", support: "Support", defense: "Defense" };

const modalEl = document.querySelector(".modal");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const modalImageCol = document.querySelector(".modal-image-col");

// The modal is one element reused for all 888 ships, so these four images have nothing to
// show until a ship is opened - and an <img> with an empty or absent src is invalid HTML
// (src="" is worse than invalid: it resolves to the page's own URL, so the browser refetches
// the document as an image). Creating them here instead keeps them out of the served markup
// entirely, the same way the catalog's own thumbnails are built with their src already set.
// Insertion points are not interchangeable: the watermark is absolutely positioned and the
// hull icon relatively, so the hull icon paints above it only by coming later in the DOM.
function placeImage(id, className, parent, before, hidden) {
  const img = document.createElement("img");
  img.id = id;
  img.className = className;
  img.alt = "";
  if (hidden) img.hidden = true;
  parent.insertBefore(img, before || null);
  return img;
}

const modalSkinNameEl = document.getElementById("modal-skin-name");
const modalImage = placeImage("modal-image", "modal-image", modalSkinNameEl.parentNode, modalSkinNameEl);
const modalSkinStrip = document.getElementById("modal-skin-strip");
const modalName = document.getElementById("modal-name");
const modalHullIcon = placeImage("modal-hull-icon", "modal-hull-icon", modalName.parentNode, modalName, true);
const modalNationWatermark = placeImage("modal-nation-watermark", "modal-nation-watermark", modalName.parentNode, modalHullIcon, true);
const modalTags = document.getElementById("modal-tags");
const modalRetrofitControl = document.getElementById("modal-retrofit-control");
const modalRetrofitCheckbox = document.getElementById("modal-retrofit-checkbox");
const modalAugmentControl = document.getElementById("modal-augment-control");
const modalAugmentCheckbox = document.getElementById("modal-augment-checkbox");
const modalFateSimControl = document.getElementById("modal-fatesim-control");
const modalFateSimCheckbox = document.getElementById("modal-fatesim-checkbox");
const modalLevelControl = document.getElementById("modal-level-control");
const modalLevelNotches = document.getElementById("modal-level-notches");
const modalLevelInput = document.getElementById("modal-level-input");
const modalLevelSpinUp = document.getElementById("modal-level-spin-up");
const modalLevelSpinDown = document.getElementById("modal-level-spin-down");
const modalStatsSection = document.getElementById("modal-stats-section");
const modalStatsTable = document.getElementById("modal-stats-table");
const modalCombatModifiers = document.getElementById("modal-combat-modifiers");
const modalEquipmentSection = document.getElementById("modal-equipment-section");
const modalEquipment = document.getElementById("modal-equipment");
const modalEquipmentCap = document.getElementById("modal-equipment-cap");
const modalEquipmentOptimize = document.getElementById("modal-equipment-optimize");
const modalEquipmentTarget = document.getElementById("modal-equipment-target");
const modalEquipmentGearLab = document.getElementById("modal-equipment-gearlab");
const modalEquipmentResearch = document.getElementById("modal-equipment-research");
const modalEquipmentClear = document.getElementById("modal-equipment-clear");
const modalCombatMetrics = document.getElementById("modal-combat-metrics");
const modalSkillsSection = document.getElementById("modal-skills-section");
const modalSkillsMaxToggle = document.getElementById("modal-skills-max-toggle");
const modalSkillsList = document.getElementById("modal-skills");
const modalBarragesSection = document.getElementById("modal-barrages-section");
const modalBarragesList = document.getElementById("modal-barrages");
const modalInteractionSection = document.getElementById("modal-interaction-section");
const modalInteractionList = document.getElementById("modal-interaction");
const modalInteractionMaxToggle = document.getElementById("modal-interaction-max-toggle");

let equipmentLoadPromise;
function setEquipmentControlsDisabled(disabled) {
  [modalEquipmentCap, modalEquipmentTarget, modalEquipmentGearLab, modalEquipmentResearch, modalEquipmentOptimize, modalEquipmentClear]
    .forEach(control => { control.disabled = disabled; });
}

function loadEquipmentData() {
  if (typeof EQUIPMENT_DATA !== "undefined") return Promise.resolve();
  if (equipmentLoadPromise) return equipmentLoadPromise;

  equipmentLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "data/equipment.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load equipment data."));
    document.head.appendChild(script);
  }).catch(error => {
    equipmentLoadPromise = null;
    throw error;
  });

  return equipmentLoadPromise;
}
const gifPreview = placeImage("gif-preview", "gif-preview", document.body, null, true);

const equipInfoTooltip = document.createElement("div");
equipInfoTooltip.className = "equip-info-tooltip";
equipInfoTooltip.hidden = true;

const equipInfoHeader = document.createElement("div");
equipInfoHeader.className = "equip-info-header";
const equipInfoIconWrap = document.createElement("div");
equipInfoIconWrap.className = "equip-info-icon";
const equipInfoTitle = document.createElement("div");
equipInfoTitle.className = "equip-info-title";
const equipInfoName = document.createElement("div");
equipInfoName.className = "equip-info-name";
const equipInfoRarity = document.createElement("div");
equipInfoRarity.className = "equip-info-rarity";
equipInfoTitle.append(equipInfoName, equipInfoRarity);
equipInfoHeader.append(equipInfoIconWrap, equipInfoTitle);

const equipInfoStats = document.createElement("div");
equipInfoStats.className = "equip-info-stats";

const equipInfoNotes = document.createElement("div");
equipInfoNotes.className = "skill-desc equip-info-notes";

equipInfoTooltip.append(equipInfoHeader, equipInfoStats, equipInfoNotes);
document.body.appendChild(equipInfoTooltip);

let currentShip = null;
let currentSkinIndex = 0;
let currentLevel = 1;
let retrofitApplied = false;
let augmentApplied = false;
let fateSimApplied = false;

function renderModalTags(ship, rarity) {
  modalTags.innerHTML = "";

  const rarityTag = document.createElement("span");
  rarityTag.className = "modal-tag rarity-tag";
  rarityTag.textContent = rarity;
  rarityTag.style.setProperty("--tag-color", `var(--${RARITY_CLASS[rarity] || "rarity-normal"})`);
  modalTags.appendChild(rarityTag);

  if (ship.class) {
    const classTag = document.createElement("span");
    classTag.className = "modal-tag";
    classTag.textContent = `Class : ${ship.class}`;
    modalTags.appendChild(classTag);
  }

  const nation = nationDisplayName(ship.nationality);
  [ship.hullType, ship.role, nation, ship.category].forEach(value => {
    if (!value) return;
    const tag = document.createElement("span");
    tag.className = "modal-tag";
    if (value === nation && NATION_COLORS[nation]) {
      tag.classList.add("nation-tag");
      tag.style.setProperty("--tag-color", NATION_COLORS[nation]);
    }
    tag.textContent = value;
    modalTags.appendChild(tag);
  });
}

function pickStatKeys(point) {
  const result = {};
  for (const key of NUMERIC_STAT_KEYS) {
    if (key in point) result[key] = point[key];
  }
  return result;
}

function interpolateStatsCurve(curve, level) {
  if (level <= curve[0].level) return pickStatKeys(curve[0]);
  const last = curve[curve.length - 1];
  if (level >= last.level) return pickStatKeys(last);

  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (level >= a.level && level <= b.level) {
      const t = (level - a.level) / (b.level - a.level);
      const result = {};
      for (const key of NUMERIC_STAT_KEYS) {
        if (!(key in a) || !(key in b)) continue;
        result[key] = Math.round(a[key] + (b[key] - a[key]) * t);
      }
      return result;
    }
  }
  return pickStatKeys(last);
}

// Oil cost inputs, from the wiki's Oil Cost page. MaxCost is hull + rarity, plus a
// Decisive-and-Main-Fleet bonus, a META bonus, the limit-break bonus, and a small
// per-ship modifier the wiki lists under "Ships from class".
// EXTRA_COST_MODIFIER_BY_NAME is keyed by display name, not ship.class, because two
// entries (Minato Aqua, Homura) share no class at all.
const HULL_COST_BY_SHORT = {
  DD: 1, IXS: 1, SS: 1, SSV: 1,
  CL: 2, AE: 2, AR: 2, BM: 2, IXV: 2,
  CA: 3, CVL: 3,
  CB: 4, CV: 4,
  IXM: 5, BC: 5,
  BB: 6, BBV: 6
};
const RARITY_COST = {
  Normal: 0, Rare: 1, Elite: 2, "Super Rare": 3,
  Priority: 4, "Ultra Rare": 5, Decisive: 6
};
const EXTRA_COST_MODIFIER_BY_NAME = {
  "Yuubari": -2,
  "Dorsetshire": -1, "Asanagi": -1, "Hatakaze": -1, "Hatakaze META": -1,
  "Kamikaze": -1, "Matsukaze": -1, "Oite": -1, "Mikasa": -1, "Chao Ho": -1, "Ying Swei": -1,
  "Amagi": 1, "Amagi-chan": 1, "Constellation": 1, "Odin": 1, "Prinz Rupprecht": 1,
  "Centaur": 1, "Albion": 1, "Theseus": 1,
  "Hiyou": 1, "Junyou": 1, "Hiyou META": 1, "Junyou META": 1,
  "Haruna": 1, "Hiei": 1, "Hiei-chan": 1, "Kirishima": 1, "Kongou": 1,
  "Torricelli": 1, "Minato Aqua": 1, "Homura": 1, "Mikuma": 1, "Mogami": 1
};
// Cost is a formula, not a base/growth curve like every other stat here:
//   surface:   floor(MaxCost * (100 + min(Level, 99)) / 200) + 1
//   submarine: floor((MaxCost + 1) * (100 + min(Level, 99)) / 200)
// Read off the Oil Cost page's raw MathML, not its rendered text - the flat-looking
// reading (MaxCost*100 + Level) / 200 is a different formula and does not reproduce
// the page's own worked example. Verified against all 5 columns of the MaxCost=7
// row (LB0/Lv.70 -> 1, LB1/Lv.80 -> 3, LB2/Lv.90 -> 5, MLB/Lv.100 -> 7), and
// against a real in-game screenshot (New Jersey at 125 shows 17).
// This app has no concept of limit-break investment, so the MAX limit-break bonus
// is assumed for every ship - the same fixed assumption the wiki itself mandates
// for PR/DR/UR/META, extended to all rarities for one comparable number, and
// consistent with skills already being shown at max level.
function computeOilCost(ship, level) {
  const hullCost = ship.hullShort ? HULL_COST_BY_SHORT[ship.hullShort] : undefined;
  const rarityCost = ship.rarity ? RARITY_COST[ship.rarity] : undefined;
  if (hullCost === undefined || rarityCost === undefined) return null;

  const decisiveMainBonus = (ship.rarity === "Decisive" && ship.role === "Main") ? 1 : 0;
  const metaBonus = ship.category === "META" ? 1 : 0;
  const isSubmarine = ship.hullShort === "SS" || ship.hullShort === "SSV";
  const maxLimitBreakBonus = isSubmarine ? 3 : 6;
  const extraModifier = EXTRA_COST_MODIFIER_BY_NAME[ship.displayName] || 0;

  const maxCost = hullCost + rarityCost + decisiveMainBonus + metaBonus + maxLimitBreakBonus + extraModifier;
  const cappedLevel = Math.min(level, 99);
  return isSubmarine
    ? Math.floor((maxCost + 1) * (100 + cappedLevel) / 200)
    : Math.floor(maxCost * (100 + cappedLevel) / 200) + 1;
}

// Two data shapes: ~861 datamined ships carry base/growth/enhance and scale by the
// formula below; ~27 hand-imported ones carry only a 4-point statsCurve read off
// their wiki stat table (levels 1/100/120/125) and are interpolated instead.
function computeStats(ship, level, isRetrofit) {
  if (ship.statsCurve && ship.statsCurve.length) {
    return interpolateStatsCurve(ship.statsCurve, level);
  }

  if (!ship.stats || !ship.stats.base) return null;
  const base = ship.stats.base;
  const growth = ship.stats.growth || {};
  const enhance = ship.stats.enhance || {};
  const bonus = (isRetrofit && ship.retrofitBonus) || {};
  const lvl = Math.max(level - 1, 1);

  const result = {};
  for (const key of NUMERIC_STAT_KEYS) {
    if (!(key in base)) continue;
    const b = base[key] || 0;
    const g = growth[key] || 0;
    const e = enhance[key] || 0;
    const r = bonus[key] || 0;
    result[key] = Math.floor(b + (g * lvl) / 1000 + e) + r;
  }
  return result;
}

function formatStatValue(raw) {
  return (raw === undefined || raw === null || raw === "") ? "—" : raw;
}

const COMBAT_MODIFIER_LABELS = {
  critRate: "Crit Rate",
  critDamage: "Crit DMG",
  damageDealt: "DMG Dealt",
  weaponEfficiency: "Weapon Efficiency",
  hitRate: "Hit Rate",
  evasionRate: "Evasion Rate",
  damageTaken: "DMG Taken"
};

// The one modifier that is a reduction rather than a gain: a "DMG Taken" bonus is
// captured as a positive magnitude ("decreases ... by 15%" -> amount 15), but showing
// it with the same leading "+" every other pill uses would read as MORE damage taken,
// the opposite of what the skill does.
const REDUCTION_MODIFIER_KEYS = new Set(["damageTaken"]);

const MODIFIER_TERM_RE = /\b(?:DMG dealt|damage dealt|DMG taken|damage taken|DMG|damage|crit(?:ical)?(?:\s+(?:rate|dmg|damage))?|evasion rate|hit rate|accuracy|efficiency)\b/gi;

// A qualifier's "source" half only counts if it names a weapon from this list.
// That is what rejects possessives ("this boat's", "Tirpitz's") and other stats
// riding the same sentence ("FP and Crit Rate"). The values also fix casing, since
// the wiki writes both "Main Gun efficiency" and "main gun efficiency" and the
// resulting pills sit side by side.
const MODIFIER_SOURCES = {
  "main gun": "Main Gun",
  "secondary gun": "Secondary Gun",
  "aa gun": "AA Gun",
  torpedo: "Torpedo",
  torpedoes: "Torpedo",
  airstrike: "Airstrike",
  aircraft: "Aircraft",
  cannon: "Cannon",
  burn: "Burn",
  barrage: "Barrage",
  salvo: "Salvo",
  volley: "Volley"
};
const MODIFIER_SOURCE_RE = new RegExp(`\\b(?:${Object.keys(MODIFIER_SOURCES).join("|")})\\b`, "gi");

const MODIFIER_TARGET_RE = /^(?:to|against|with|from|for|while|during|when|vs\.?)\s/i;

// A combat-modifier pill is worthless without its restriction: Alvitr's "DMG Dealt
// +15%" only applies to Light Armor enemies, and summing it with an unconditional
// +10% would produce a "+25%" that applies to nothing. So bonuses are grouped per
// (stat, qualifier) rather than per stat.
// The qualifier is recovered from the bonus's own raw phrase - a target after the
// stat term ("to Light Armor enemies", "with AP") and a source weapon before it.
// A target only counts if it opens with a restriction preposition, which is what
// drops the "dealt" left over from "Crit DMG dealt".
function modifierQualifier(raw) {
  const phrase = (raw || "")
    .replace(/\s*\bby\s+[-+\d.]+\s*%?[\s\S]*$/i, "")
    .replace(/^\s*(?:increase[sd]?|decrease[sd]?|raise[sd]?|boost(?:s|ed)?)\s+/i, "")
    .replace(/^\s*(?:this ship(?:'s)?|this character(?:'s)?|this boat(?:'s)?|her|his|its|their|own|the)\s+/i, "")
    .trim();

  MODIFIER_TERM_RE.lastIndex = 0;
  let first = null;
  let last = null;
  let match;
  while ((match = MODIFIER_TERM_RE.exec(phrase))) {
    if (!first) first = match;
    last = match;
  }
  if (!first) return { source: "", target: "" };

  const before = phrase.slice(0, first.index).trim();
  const after = phrase.slice(last.index + last[0].length).trim();
  const sourceAt = before.search(MODIFIER_SOURCE_RE);
  return {
    source: sourceAt < 0 ? "" : before.slice(sourceAt).replace(/'s$/, "")
      .replace(MODIFIER_SOURCE_RE, term => MODIFIER_SOURCES[term.toLowerCase()]),
    target: MODIFIER_TARGET_RE.test(after) ? after : ""
  };
}

function addModifier(modifiers, index, key, amount, skill, raw) {
  const { source, target } = modifierQualifier(raw);
  const groupKey = `${key}|${source.toLowerCase()}|${target.toLowerCase()}`;
  let entry = index.get(groupKey);
  if (!entry) {
    entry = { key, source, target, amount: 0, sources: [] };
    index.set(groupKey, entry);
    modifiers.push(entry);
  }
  entry.amount += amount;
  entry.sources.push({ skill, raw });
  return entry;
}

function modifierLabel(modifier) {
  const label = COMBAT_MODIFIER_LABELS[modifier.key] || modifier.key;
  if (!modifier.source) return label;
  return modifier.key === "weaponEfficiency"
    ? `${modifier.source} Efficiency`
    : `${modifier.source} ${label}`;
}

// raw drops whatever gated the bonus, and that gate is often the real precision
// ("Once per battle, when this barrage scores a total of 3 hits: ..."). So the
// tooltip quotes the whole sentence the number came from, at whichever skill level
// this skill's own Max Level toggle is currently showing, to match the pill's figure.
function modifierSourceText(entry) {
  const atMax = isSkillAtMaxLevel(entry.skill);
  const text = stripHtml(entry.skill.description || "").replace(/\s+/g, " ").trim();
  const needle = (entry.raw || "").replace(/\s+/g, " ").trim();
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return `${entry.skill.name} — ${renderLevelValues(needle, atMax)}`;
  const start = text.lastIndexOf(". ", at);
  let end = text.indexOf(". ", at + needle.length);
  end = end < 0 ? text.length : end + 1;
  const sentence = text.slice(start < 0 ? 0 : start + 2, end).trim();
  return `${entry.skill.name} — ${renderLevelValues(sentence, atMax)}`;
}

// statBonuses[].scope was auto-extracted from skill text by a one-off script and is
// wrong in both directions, so it is never trusted alone - the bonus's own raw text
// decides.
// SELF_LANGUAGE_RE catches "fleet" entries that are really self (Brest: "increases
// this ship's EVA by 5%"); OTHER_SHIPS_TARGET_RE catches "self" entries that are
// really about other ships (Shinano: "increases the FP, EVA, and ASW of your DDs").
// If another mislabelled case turns up, add a targeted pattern here - do not try to
// re-run the original extraction script, it no longer exists.
const SELF_LANGUAGE_RE = /\b(this ship('s)?|her own|own)\b/i;
const OTHER_SHIPS_TARGET_RE = /\byour\s+(DDs?|CLs?|CAs?|CBs?|BBs?|BCs?|CVs?|CVLs?|SSs?|SSVs?|Vanguard|Main Fleet|fleet)\b/i;

// Some skills grant a bonus only while a particular kind of gear is equipped, and a
// few grant a DIFFERENT bonus depending on which branch applies - "If equipped with a
// Sakura Empire aircraft: AVI/ACC... If not equipped with any Sakura Empire aircraft:
// AA/ACC... instead" (Hakuryuu's "The Great One's Shadow"). Summing every self bonus
// unconditionally, as this whole section otherwise does, would double-count both
// branches at once now that equipped gear is real data instead of an unknown. 25
// skills in the dataset carry an "equipped with X" clause governing a self bonus
// (surveyed with a node -e scan over ships.json before writing this).
//
// A condition this cannot confidently parse is left ungated (returns true) rather
// than excluded - this only ADDS precision for the shapes recognised below, it never
// takes away a bonus that used to count under the old "assumed met" behaviour.
const AIRCRAFT_CATEGORIES = ["Fighter", "Seaplane", "Dive Bomber", "Torpedo Bomber"];
const GUN_CATEGORY_SUFFIX_RE = /Gun$/;

function shipGunSlotKeys(ship) {
  const slots = ship.equipment || {};
  return Object.keys(slots)
    .sort((a, b) => a - b)
    .filter(k => GUN_TYPE_CODES.has((slots[k].type || [])[0]));
}

function shipActiveEquippedItems(ship, categories) {
  const slots = ship.equipment || {};
  const items = [];
  for (const [key, slot] of Object.entries(slots)) {
    const item = activeEquipmentForSlot(ship, key, slot);
    if (item && (!categories || categories.includes(item.category))) items.push(item);
  }
  return items;
}

function equipCaliberMm(item) {
  const m = /(\d+)\s*mm/i.exec(item.name || "");
  return m ? Number(m[1]) : null;
}

function resolveEquipNationTerm(text) {
  const t = text.trim();
  return ALL_NATION_TERMS.find(n => n.toLowerCase() === t.toLowerCase())
    || ALL_NATION_TERMS.find(n => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(t));
}

// A skill's own text is the only source for a catalog item name ("the Quadruple 380mm
// (Mle 1935) gun", "an F6F Hellcat"), and it does not always spell the name the way
// the catalog does - the catalog keeps "Grumman"/"Consolidated" prefixes the skill
// text drops - so this checks both directions instead of assuming the catalog name is
// a literal substring of the skill text.
function equipTargetNamesCatalogItem(strippedTarget) {
  if (strippedTarget.length < 5) return null;
  const needle = strippedTarget.toLowerCase();
  return EQUIPMENT_DATA.find(item => {
    const name = item.name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  }) || null;
}

function equipConditionClauseForRaw(plainText, raw) {
  if (!raw) return null;
  const lower = plainText.toLowerCase();
  const idx = lower.indexOf(raw.toLowerCase().trim());
  if (idx < 0) return null;
  let sentStart = plainText.lastIndexOf(". ", idx);
  sentStart = sentStart < 0 ? 0 : sentStart + 2;
  const clause = plainText.slice(sentStart, idx);
  return /equipped|otherwise/i.test(clause) ? clause : null;
}

// clause is everything from the sentence start up to (not including) the bonus's own
// raw text - "otherwise" only ever shows up in that span when it is negating an equip
// condition stated earlier in the SAME sentence (Gneisenau META), never the bonus's
// own condition, so its mere presence is enough to flip negate without needing to
// re-parse which branch it belongs to.
function parseEquipCondition(clause) {
  const equipMatch = /equipped\s+with\s+((?:at least one\s+)?(?:a|an|the|any)?\s*[^,:;.]+)/i.exec(clause);
  if (!equipMatch) return null;
  const negate = /\botherwise\b/i.test(clause) || /\bnot\s+equipped\b|\bisn'?t\s+equipped\b/i.test(clause);
  const rawTarget = equipMatch[1]
    .replace(/^(?:at least one|a|an|the|any)\s+/i, "")
    .replace(/\bhigh[- ]explosive\b/gi, "HE")
    .replace(/\bsemi[- ]armor[- ]piercing\b/gi, "SAP")
    .replace(/\barmor[- ]piercing\b/gi, "AP")
    .trim();

  // Béarn and Seattle point at a specific SLOT rather than "her" gear in general, so
  // the target category has to be checked against that one slot, not the ship's
  // Main Gun (the default every other shape below assumes).
  if (/third slot/i.test(clause)) {
    const wantDiveBomber = /dive bomber/i.test(rawTarget);
    return { negate, test: ship => {
      const item = activeEquipmentForSlot(ship, "3", (ship.equipment || {})["3"]);
      if (!item) return false;
      return wantDiveBomber ? item.category === "Dive Bomber" : GUN_CATEGORY_SUFFIX_RE.test(item.category);
    } };
  }
  if (/secondary weapon slot/i.test(clause)) {
    // Seattle (the only ship with this phrasing) has her "Secondary Weapon slot" typed
    // as a plain AA slot (code 6) in the data, so shipGunSlotKeys() - which only looks
    // at gun-type codes - can never find it; it is always the ship's physical slot "2".
    const wantAA = /anti-air gun/i.test(rawTarget);
    return { negate, test: ship => {
      const item = activeEquipmentForSlot(ship, "2", (ship.equipment || {})["2"]);
      if (!item) return false;
      return wantAA ? /AA/i.test(item.category) : GUN_CATEGORY_SUFFIX_RE.test(item.category) && !/AA/i.test(item.category);
    } };
  }

  // Nation-restricted gun of a specific hull category, e.g. Kitakaze's "an IJN
  // (Sakura Empire) DD Gun" - the nation sits in a parenthetical alias here, so that
  // is tried before falling back to a plain nation name elsewhere in the target.
  const gunCategoryNames = ["DD Gun", "CL Gun", "CA Gun", "BB Gun", "CB Gun"];
  const gunCategory = gunCategoryNames.find(c => new RegExp(`\\b${c}\\b`, "i").test(rawTarget));
  if (gunCategory) {
    const paren = /\(([^)]+)\)/.exec(rawTarget);
    const nation = (paren && resolveEquipNationTerm(paren[1]))
      || resolveEquipNationTerm(rawTarget.replace(new RegExp(gunCategory, "i"), ""));
    if (nation) {
      return { negate, test: ship => shipActiveEquippedItems(ship, [gunCategory]).some(i => i.nation === nation) };
    }
  }

  if (/high[- ]?caliber/i.test(rawTarget)) {
    const mmMatch = /(\d+)\s*mm/i.exec(rawTarget);
    const threshold = mmMatch ? Number(mmMatch[1]) : 280;
    return { negate, test: ship => {
      const key = shipGunSlotKeys(ship)[0];
      if (key == null) return false;
      const item = activeEquipmentForSlot(ship, key, ship.equipment[key]);
      const mm = item && equipCaliberMm(item);
      return mm != null && mm >= threshold;
    } };
  }

  const ammoTypes = rawTarget.match(/\b(Normal|AP|HE|SAP)\b/gi);
  if (ammoTypes && /main gun/i.test(rawTarget)) {
    const wanted = new Set(ammoTypes.map(a => a.toUpperCase()));
    return { negate, test: ship => {
      const key = shipGunSlotKeys(ship)[0];
      if (key == null) return false;
      const item = activeEquipmentForSlot(ship, key, ship.equipment[key]);
      return !!item && wanted.has((item.ammoType || "").toUpperCase());
    } };
  }

  let m = /aircraft\b/i.test(rawTarget) && /^([\w\s]+?)\s+aircraft\b/i.exec(rawTarget);
  if (m) {
    const nation = resolveEquipNationTerm(m[1]);
    if (nation) {
      return { negate, test: ship => shipActiveEquippedItems(ship, AIRCRAFT_CATEGORIES).some(i => i.nation === nation) };
    }
  }

  m = /gear\b/i.test(rawTarget) && /^([\w\s]+?)\s+gear\b/i.exec(rawTarget);
  if (m) {
    const nation = resolveEquipNationTerm(m[1]);
    if (nation) {
      return { negate, test: ship => shipActiveEquippedItems(ship, null).some(i => i.nation === nation) };
    }
  }

  m = /main gun\b/i.test(rawTarget) && /^([\w\s,]+?)\s+main gun\b/i.exec(rawTarget);
  if (m) {
    const nations = m[1].split(/\s*,\s*|\s+or\s+/i).map(resolveEquipNationTerm).filter(Boolean);
    if (nations.length) {
      return { negate, test: ship => {
        const key = shipGunSlotKeys(ship)[0];
        if (key == null) return false;
        const item = activeEquipmentForSlot(ship, key, ship.equipment[key]);
        return !!item && nations.includes(item.nation);
      } };
    }
  }

  // Fuzzy named-item match, tried last since it is the least exact: a bare category
  // word ("gun", "aircraft") would otherwise risk matching some unrelated catalog name
  // that happens to share a short substring with it.
  const isGenericCategoryPhrase = /^(gun|main gun|dive bomber|aircraft|gear|anti-air gun)$/i.test(rawTarget);
  if (!isGenericCategoryPhrase) {
    const named = equipTargetNamesCatalogItem(rawTarget);
    if (named) {
      const needle = named.name.toLowerCase();
      return { negate, test: ship => shipActiveEquippedItems(ship, null).some(i => i.name.toLowerCase() === needle) };
    }
  }

  return null;
}

function equipConditionAllows(ship, plainText, raw) {
  const clause = equipConditionClauseForRaw(plainText, raw);
  if (!clause) return true;
  const parsed = parseEquipCondition(clause);
  if (!parsed) return true;
  const result = parsed.test(ship);
  return parsed.negate ? !result : result;
}

// Skill bonuses, plus flat stat contributions from equipped gear (equipFlat below).
// No Meowfficer or Fleet Tech data exists here. Conditions are assumed met UNLESS the
// condition is specifically about equipped gear (equipConditionAllows above) - that is
// the one category this app can actually check against a real loadout, so it does.
// Note this "conditions assumed met" stance is deliberately NOT shared with the
// Interaction section, which excludes conditionally gated buffs entirely.
function computeEffectiveStats(ship, level, isRetrofit, isAugmented, isFateSim) {
  const base = computeStats(ship, level, isRetrofit);
  if (!base) return null;
  const equipFlat = equippedGearFlatStats(ship);

  const skills = getSkillsForState(ship, isRetrofit, isAugmented, isFateSim);
  const percentSum = {};
  const flatSum = {};
  const modifiers = [];
  const modifierIndex = new Map();
  const seenRaw = new Set();

  for (const skill of skills) {
    const plainDesc = skill.description ? stripHtml(skill.description) : "";
    for (const b of (skill.statBonuses || [])) {
      const isSelfScoped = b.scope === "self" || (b.raw && SELF_LANGUAGE_RE.test(b.raw));
      if (!isSelfScoped) continue;
      if (b.raw && OTHER_SHIPS_TARGET_RE.test(b.raw)) continue;
      if (!equipConditionAllows(ship, plainDesc, b.raw)) continue;
      const dedupeKey = `${skill.name}::${b.raw}::${b.min}::${b.max}`;
      if (seenRaw.has(dedupeKey)) continue;
      seenRaw.add(dedupeKey);
      const atMax = isSkillAtMaxLevel(skill);
      const amount = atMax
        ? (typeof b.max === "number" ? b.max : b.min)
        : (typeof b.min === "number" ? b.min : b.max);
      if (typeof amount !== "number") continue;
      for (const key of (b.stats || [])) {
        if (key in COMBAT_MODIFIER_LABELS) {
          addModifier(modifiers, modifierIndex, key, amount, skill, b.raw);
        } else if (NUMERIC_STAT_KEYS.includes(key)) {
          const bucket = b.isPercent ? percentSum : flatSum;
          bucket[key] = (bucket[key] || 0) + amount;
        }
      }
    }
  }

  // The wiki's CurrentScalingStat, from the Damage Calculations page:
  //   [ (ShipBaseStat x CatStatMultiplier) + sum(FlatStatBuffs) ]
  //     x (1 + sum(StatPercentBuffs)) + sum(SkillFlatBuffs)
  // Equipment is a FlatStatBuff, so it is added BEFORE the percentage and is itself
  // amplified by skill buffs. Skill flat buffs are a separate, later term and are not.
  // Getting those two positions the wrong way round changes the result whenever a ship
  // has both. CatStatMultiplier stays 1: no Meowfficer or Fleet Tech data exists here.
  const stats = {};
  for (const key of NUMERIC_STAT_KEYS) {
    if (!(key in base)) continue;
    const pct = percentSum[key] || 0;
    const skillFlat = flatSum[key] || 0;
    const equip = equipFlat[key] || 0;
    const value = pct || skillFlat || equip
      ? Math.round((base[key] + equip) * (1 + pct / 100) + skillFlat)
      : base[key];
    stats[key] = { value, delta: value - base[key], base: base[key], equip, pct, skillFlat };
  }

  return { stats, modifiers };
}

// A boosted cell renders as "{base}+{delta} ({real})" rather than the final number
// alone: with no Base column anywhere in this section, a lone "355" is impossible
// to tell from an unboosted base value. An unboosted cell stays a plain number,
// so the compound form only appears where there is a delta to explain.
// The grid shows one delta, but it can now come from two different places at once, and
// they apply at different points in the formula. Spelling the terms out is the only way
// a reader can tell which gear or which skill is responsible.
function statBreakdownText(label, entry) {
  const lines = [`${label}  base ${entry.base}`];
  if (entry.equip) lines.push(`equipment  ${entry.equip > 0 ? "+" : ""}${entry.equip}`);
  if (entry.pct) lines.push(`skills  ${entry.pct > 0 ? "+" : ""}${entry.pct}%`);
  if (entry.skillFlat) lines.push(`skills (flat)  ${entry.skillFlat > 0 ? "+" : ""}${entry.skillFlat}`);
  lines.push(`= ${entry.value}`);
  return lines.join("\n");
}

function buildStatsGrid(container, gridDefs, ship, level, base, effective) {
  for (const def of gridDefs) {
    const cell = document.createElement("div");
    cell.className = "stat-grid-cell";
    if (!def) {
      cell.classList.add("stat-grid-blank");
      container.appendChild(cell);
      continue;
    }

    const entry = (def.text || def.custom) ? null : effective.stats[def.key];
    const baseRaw = def.custom ? computeOilCost(ship, level) : def.text ? ship.armorType : base[def.key];
    const delta = entry ? entry.delta : 0;

    const iconLabel = document.createElement("span");
    iconLabel.className = "stat-grid-icon-label";
    iconLabel.title = def.label;
    const icon = document.createElement("img");
    icon.className = "stat-icon";
    icon.src = def.icon;
    icon.alt = def.label;
    iconLabel.appendChild(icon);
    iconLabel.appendChild(document.createTextNode(def.label));
    cell.appendChild(iconLabel);

    const value = document.createElement("span");
    value.className = "stat-grid-value";
    if (delta) {
      cell.title = statBreakdownText(def.label, entry);
      value.appendChild(document.createTextNode(formatStatValue(baseRaw)));
      const equipDelta = entry.equip || 0;
      const skillDelta = delta - equipDelta;
      if (equipDelta) {
        const equipEl = document.createElement("span");
        equipEl.className = "stat-delta-equip";
        equipEl.textContent = equipDelta > 0 ? `+${equipDelta}` : `${equipDelta}`;
        value.appendChild(equipEl);
      }
      if (skillDelta) {
        const deltaEl = document.createElement("span");
        deltaEl.className = "stat-delta";
        deltaEl.textContent = skillDelta > 0 ? `+${skillDelta}` : `${skillDelta}`;
        value.appendChild(deltaEl);
      }
      const realEl = document.createElement("span");
      realEl.className = "stat-grid-real";
      realEl.textContent = ` (${entry.value})`;
      value.appendChild(realEl);
    } else {
      value.textContent = formatStatValue(baseRaw);
    }
    cell.appendChild(value);

    container.appendChild(cell);
  }
}

// Slot type codes are bare numbers in the datamine. These names were derived, not
// guessed: 837 saved wiki ship pages name what their slots 1-3 accept, and
// cross-referencing those against the codes made every listed code unambiguous.
// The wiki never lists the auxiliary slots 4-5, which is where the leftovers live.
// Code 17 has no source anywhere (2 ships, Koln and Koln META) so it is deliberately
// absent and simply does not render - better than an invented name. Code 21 never
// appears alone, only glued to 6, and the wiki labels every slot carrying the pair
// plainly "Anti-Air Guns", so it maps to the same string and dedupes away.
const EQUIPMENT_TYPE_NAMES = {
  1: "DD Main Guns",
  2: "CL Main Guns",
  3: "CA Main Guns",
  4: "BB Main Guns",
  5: "Torpedoes",
  6: "Anti-Air Guns",
  7: "Fighters",
  8: "Torpedo Bombers",
  9: "Dive Bombers",
  10: "Auxiliaries",
  11: "CB Main Guns",
  12: "Seaplanes",
  13: "Submarine Torpedoes",
  14: "Anti-Sub Equipment",
  15: "ASW Bombers",
  18: "Cargo",
  20: "Missiles",
  21: "Anti-Air Guns"
};

const UNIVERSAL_AUGMENT_MODULES = new Set([
  "Hammer", "Dual Swords", "Crossbow", "Sword", "Lance", "Greatsword",
  "Bowgun", "Officer's Sword", "Scepter", "Hunting Bow", "Kunai", "Dagger"
]);

// A slot's type code alone cannot name it: a BB's slot 2 takes DD guns as her
// SECONDARY battery while a DD's slot 1 takes the same DD guns as her MAIN one.
// Rule: the first gun-taking slot is "Main Gun", any later one "Secondary".
// Checked against all 156 distinct (hull, slot, types) combinations - it also lands
// right on the awkward ones: a submarine's deck gun sits in slot 3 behind two
// torpedo slots and still reads "Main Gun", and Akashi's slot 1 reads "Auxiliary".
const EQUIPMENT_SHORT_NAMES = {
  5: "Torpedo",
  6: "AA Gun",
  7: "Fighter",
  8: "Torpedo Bomber",
  9: "Dive Bomber",
  10: "Auxiliary",
  12: "Seaplane",
  13: "Torpedo",
  14: "Anti-Sub",
  15: "ASW Plane",
  18: "Cargo",
  20: "Missile",
  21: "AA Gun"
};
const GUN_TYPE_CODES = new Set([1, 2, 3, 4, 11]);

function equipmentSlotTypes(slot) {
  return [...new Set((slot.type || []).map(code => EQUIPMENT_TYPE_NAMES[code]).filter(Boolean))];
}

// A slot's short name used to collapse to whatever its FIRST type code meant, which
// hides real dual-purpose slots - Rikka Takarada's and Reisalin Stout's "Main Gun"
// slot also takes an Auxiliary (code 10 riding alongside the gun code), and it showed
// as a plain gun slot with no visible hint of that. Every distinct short name across
// ALL of a slot's codes is now listed, gun codes collapsed to the one gunLabel the
// caller already worked out (Main Gun/Secondary) so [1,2] (two gun families) still
// reads as one slot rather than "Main Gun / Main Gun".
function equipmentSlotLabel(slot, gunLabel) {
  const codes = slot.type || [];
  const parts = [];
  if (gunLabel) parts.push(gunLabel);
  for (const code of codes) {
    if (GUN_TYPE_CODES.has(code)) continue;
    const name = EQUIPMENT_SHORT_NAMES[code];
    if (name && !parts.includes(name)) parts.push(name);
  }
  return parts.join(" / ");
}

// Built by hand because the two vocabularies are worded differently on purpose
// ("DD Main Guns" here vs "DD Gun" in the catalog).
// Codes 6 and 21 are NOT the same permission, though the wiki labels both slots plainly
// "Anti-Air Guns": "Time Fuze AA Guns are special AA Guns only equippable by Battleships
// and Battlecruisers" (Damage Calculations page), and code 21 appears on BB, BC and BBV
// slots only - 142 of them, never on any other hull. So 6 grants ordinary AA guns and 21
// grants the Time Fuze ones; a BB slot carries both codes and gets both.
// Code 18 (Cargo) stays unmapped: no Cargo category was ever extracted, and it is not
// combat gear. Code 20 (Missiles) IS mapped, to the Torpedo catalog page - checked, that
// is where the SY-1 missiles live. equipmentOptionsForSlot then splits that category in
// two, since a missile slot must not offer torpedoes nor the reverse.
const EQUIPMENT_TYPE_CODE_CATEGORIES = {
  1: ["DD Gun"],
  2: ["CL Gun"],
  3: ["CA Gun"],
  4: ["BB Gun"],
  5: ["Torpedo"],
  20: ["Torpedo"],
  6: ["AA Gun"],
  21: ["AA Time Fuze Gun"],
  7: ["Fighter"],
  8: ["Torpedo Bomber"],
  9: ["Dive Bomber"],
  10: ["Auxiliary"],
  11: ["CB Gun"],
  12: ["Seaplane"],
  13: ["Submarine Torpedo"],
  14: ["ASW"]
};

// The Torpedo catalog page also lists the two SY-1 missiles, but a missile is NOT a
// torpedo as far as slots go: type code 20 (Missiles) appears ALONE on exactly 4 slots
// (An Shan, Chang Chun, Fu Shun, Tai Yuan - the Fu Shun-class retrofit) and code 5
// appears on 446 slots, never together. So the two sets are disjoint and each code takes
// its own half. Before this split a plain destroyer was offered SY-1A, which Optimize
// would then have picked because it outscores every real torpedo.
// Every gear slot has a built-in weapon the ship uses when the slot is empty; its id is
// already in the ship data as slot.default, and data/default-equipment.js carries the
// items themselves, extracted from the wiki's User:ArdWar/DefaultEquips page.
// Resolves 2579 of the 2583 slots that declare a default. The 4 that do not are id 158
// (Ganj-i-Sawai, Pearl, Queen Anne's Revenge, Sao Martinho), which that page never
// documented - they degrade to no default rather than to a guessed one.
//
// NOTE for the DPS work: the page's aircraft table has no DPS column at all, only
// Ordnance and reload, so the 346 aircraft slots will need their damage derived rather
// than read. Guns, torpedoes, AA and ASW all carry their own DPS figures.
const DEFAULT_EQUIPMENT_BY_ID = new Map(
  (typeof DEFAULT_EQUIPMENT_DATA === "undefined" ? [] : DEFAULT_EQUIPMENT_DATA).map(item => [item.id, item])
);

function defaultEquipmentForSlot(slot) {
  if (!slot || slot.default == null) return null;
  return DEFAULT_EQUIPMENT_BY_ID.get(slot.default) || null;
}

// What the slot actually fights with: the equipped item, or the built-in default.
// Returns null only for a slot with neither, i.e. an empty auxiliary.
function activeEquipmentForSlot(ship, slotKey, slot) {
  return getEquippedGear(ship, slotKey) || defaultEquipmentForSlot(slot);
}

const EQUIPMENT_MISSILE_RE = /missile/i;
function isMissileItem(item) {
  return item.category === "Torpedo" && EQUIPMENT_MISSILE_RE.test(item.name);
}

// An item's own wiki page carries a "Used By" table marking every hull that may mount it,
// which is a real restriction the slot's type code does not express: a Destroyer's
// auxiliary slot accepts Auxiliaries, but not an Anti-Torpedo Bulge. Only 145 of the 581
// catalog records have that table saved, so an item without `usedBy` stays unrestricted
// rather than being hidden on a guess.
// A hull the page marks "maybe" counts as allowed: those are the ones where only named
// ships qualify, and the slot's own type already picks exactly those ships out - the two
// BCs and two CBs with a torpedo slot are Odin, Scharnhorst META, Agir and Little Agir,
// which are the wiki's own examples.
function equipmentAllowedOnHull(item, ship) {
  return !item.usedBy || !ship || item.usedBy.includes(ship.hullShort);
}

function equipmentOptionsForSlot(slot, ship) {
  if (!EQUIPMENT_DATA || !slot) return [];
  const categories = new Set();
  for (const code of slot.type || []) {
    for (const cat of EQUIPMENT_TYPE_CODE_CATEGORIES[code] || []) categories.add(cat);
  }
  const wantsMissiles = (slot.type || []).includes(20);
  return EQUIPMENT_DATA.filter(item => {
    if (!categories.has(item.category)) return false;
    if (!equipmentAllowedOnHull(item, ship)) return false;
    if (item.category !== "Torpedo") return true;
    return wantsMissiles === isMissileItem(item);
  });
}

const EQUIPMENT_RARITY_ORDER = ["Common", "Rare", "Elite", "Super Rare", "Ultra Rare"];
function equipmentRarityColor(rarity) {
  return `var(--${RARITY_CLASS[rarity === "Common" ? "Normal" : rarity] || "rarity-normal"})`;
}

const STAT_ICON_BY_KEY = Object.fromEntries(STAT_GRID.filter(Boolean).map(d => [d.key, d.icon]));

// Every numeric figure worth showing for an item: its combat headline (DPS/AA DPS/
// ASW DPS, whichever it has) plus every flat stat it grants - not just the one
// equipmentPrimaryStat() picks as the single at-a-glance figure for a picker cell.
// A built-in default weapon (data/default-equipment.json) is a different schema -
// dpsLight/dpsMedium/dpsHeavy as flat fields instead of a dps object, no rarity, no
// statBonus - so its own DPS is read from there instead of being left blank.
function equipmentStatRows(item) {
  const rows = [];
  // Ammo type first for a gun - which armor type a shot is actually good against
  // depends on it, and the user asked for it named up front rather than left to the
  // armorMod numbers to imply.
  if (item.ammoType) rows.push({ label: "Ammo", value: item.ammoType });
  if (item.dps) {
    const value = typeof item.dps.raw === "number" ? item.dps.raw : `${item.dps.light}/${item.dps.medium}/${item.dps.heavy}`;
    rows.push({ label: "DPS", value });
    // Per-hull-type damage, spelled out rather than left folded into the single DPS
    // figure above (which is the no-armor baseline, not what any of the three
    // actually take) - Light/Medium/Heavy in that fixed order every time.
    if (typeof item.dps.light === "number") {
      rows.push({ label: "DMG L/M/H", value: `${item.dps.light}/${item.dps.medium}/${item.dps.heavy}` });
    }
  } else if (typeof item.dpsLight === "number") {
    rows.push({ label: "DPS", value: `${item.dpsLight}/${item.dpsMedium}/${item.dpsHeavy}` });
  }
  if (typeof item.aaDps === "number") rows.push({ label: "AA DPS", value: item.aaDps });
  if (typeof item.dmg === "number") rows.push({ label: "DMG", value: item.dmg });
  if (typeof item.aswDps === "number") rows.push({ label: "ASW DPS", value: item.aswDps });
  if (typeof item.ordnance === "number") rows.push({ label: "Ordnance", value: item.ordnance });
  if (typeof item.reload === "number") rows.push({ label: "Reload", value: `${item.reload}s` });
  for (const [rawKey, amount] of Object.entries(item.statBonus || {})) {
    if (typeof amount !== "number") continue;
    const key = EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey;
    rows.push({ label: STAT_ABBR[key] || rawKey, value: `+${amount}`, icon: STAT_ICON_BY_KEY[key] });
  }
  return rows;
}

function equipmentPrimaryStat(item) {
  if (item.dps) return { label: "DPS", value: item.dps.raw ?? item.dps.light };
  if (item.aaDps != null) return { label: "AA DPS", value: item.aaDps };
  if (item.aswDps != null) return { label: "ASW DPS", value: item.aswDps };
  if (item.preloadDps) return { label: "DPS", value: item.preloadDps.light };
  if (item.statBonus) {
    const key = Object.keys(item.statBonus)[0];
    if (key) return { label: STAT_ABBR[key] || key, value: item.statBonus[key] };
  }
  return null;
}

function equipmentSummaryText(item) {
  const stat = equipmentPrimaryStat(item);
  return stat ? `${stat.label} ${stat.value}` : "";
}

// Every catalog record has artwork at assets/equipment-icons/{id}.png, taken from
// the saved wiki list pages' own Icon column (581/581 matched on category, link
// text and tier). The error handler falls back to the item's name so a catalog
// entry added later without a file degrades to text rather than a broken image.
function equipmentIconImg(item, className) {
  const img = document.createElement("img");
  img.className = className;
  img.src = `assets/equipment-icons/${item.id}.png`;
  img.alt = item.name;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    const fallback = document.createElement("span");
    fallback.className = className + "-fallback";
    fallback.textContent = item.name;
    img.replaceWith(fallback);
  });
  return img;
}

// Name, rarity and headline stat live in the tooltip so the tile and picker cells
// can show artwork only, the way the game's own gear panel does.
function equipmentTooltip(item) {
  return [item.name, item.rarity, equipmentSummaryText(item)].filter(Boolean).join(" — ");
}

// ---------------------------------------------------------------------------
// Combat metrics: DPS, AA DPS, ASW DPS, eHP
// ---------------------------------------------------------------------------

// Which stat a weapon scales off, and which of the four figures it feeds. Keyed by both
// the catalog's `category` and the built-in items' `kind`, since a slot can hold either.
const WEAPON_ROLES = {
  "DD Gun": { metric: "dps", stat: "firepower" },
  "CL Gun": { metric: "dps", stat: "firepower" },
  "CA Gun": { metric: "dps", stat: "firepower" },
  "CB Gun": { metric: "dps", stat: "firepower" },
  "BB Gun": { metric: "dps", stat: "firepower" },
  "Torpedo": { metric: "dps", stat: "torpedo" },
  "Submarine Torpedo": { metric: "dps", stat: "torpedo" },
  "Fighter": { metric: "dps", stat: "aviation" },
  "Seaplane": { metric: "dps", stat: "aviation" },
  "Dive Bomber": { metric: "dps", stat: "aviation" },
  "Torpedo Bomber": { metric: "dps", stat: "aviation" },
  "AA Gun": { metric: "dpsAA", stat: "antiair" },
  "AA Time Fuze Gun": { metric: "dpsAA", stat: "antiair" },
  "ASW": { metric: "dpsASW", stat: "asw" },
  gun: { metric: "dps", stat: "firepower" },
  torpedo: { metric: "dps", stat: "torpedo" },
  aircraft: { metric: "dps", stat: "aviation" },
  aa: { metric: "dpsAA", stat: "antiair" },
  asw: { metric: "dpsASW", stat: "asw" },
};

function weaponRole(item) {
  return WEAPON_ROLES[item.category] || WEAPON_ROLES[item.kind] || null;
}

// The item's damage per second BEFORE any ship stat is applied. Verified against the
// catalog: a gun's dps.raw is exactly dmg x coef x roundsPerSec, with no stat term, so
// these figures are a stat-0 baseline and the stat multiplier below is not double
// counting.
//
// The mean of the light/medium/heavy columns is what is used, NOT dps.raw, so no target
// armour type is assumed. raw is the figure at a 100% armour modifier, which almost no
// ammunition actually has - HE is punished against heavy armour and torpedoes rewarded -
// so comparing two items on raw quietly favours whichever is tuned for a target that is
// not there. This matters most where a gun is weighed against a barrage: their ammo
// types differ, and their armour modifiers with them. raw remains the fallback for an
// item that has no per-armour breakdown.
function equipmentBaseDps(item) {
  if (typeof item.aaDps === "number") return item.aaDps;
  if (typeof item.aswDps === "number") return item.aswDps;
  if (typeof item.dps === "number") return item.dps;
  const dps = item.dps;
  if (dps && typeof dps === "object") {
    const values = [dps.light, dps.medium, dps.heavy].filter(v => typeof v === "number");
    if (values.length) return values.reduce((a, b) => a + b, 0) / values.length;
    if (typeof dps.raw === "number") return dps.raw;
  }
  const builtIn = [item.dpsLight, item.dpsMedium, item.dpsHeavy].filter(v => typeof v === "number");
  if (builtIn.length) return builtIn.reduce((a, b) => a + b, 0) / builtIn.length;
  return null;
}

// The reference attacker eHP is measured against. The wiki's HitRate needs the SHOOTER's
// Accuracy and Luck, which this app has no source for, so a fixed reference stands in and
// is named in the UI rather than hidden. Its exact value barely affects which ship is
// tankier than which - it shifts every eHP by roughly the same factor - but it does mean
// the number is comparative, not an absolute the game would show.
const EHP_REFERENCE_ACCURACY = 100;
const EHP_REFERENCE_LUCK = 0;

// HitRate = 0.1 + Hit/(Hit + Eva + 2) + (AttackerLuck - TargetLuck + LevelDiff)/1000,
// clamped to [0.1, 1]. Level difference is 0: the reference attacker is assumed to be the
// same level as the ship being looked at.
function referenceHitRate(evasion, luck) {
  const raw =
    0.1 +
    EHP_REFERENCE_ACCURACY / (EHP_REFERENCE_ACCURACY + evasion + 2) +
    (EHP_REFERENCE_LUCK - luck) / 1000;
  return Math.min(1, Math.max(0.1, raw));
}

// Damage a slot contributes per second: the item's own figure, times how many copies fire
// (mounts), times the slot's efficiency, times the wiki's WeaponStatMultiplier
// (1 + ScalingStat/100). WeaponScalingCoefficient is left at its default of 1; the
// Damage Calculations page gives 0.8 for some bombs and rockets, which the catalog does
// not distinguish, so aircraft numbers are slightly optimistic.
function slotDamage(slot, item, effective) {
  const role = weaponRole(item);
  if (!role) return null;
  const base = equipmentBaseDps(item);
  if (base === null) return { metric: role.metric, value: 0, unknown: true };
  const statEntry = effective.stats[role.stat];
  const stat = statEntry ? statEntry.value : 0;
  const mounts = slot.mount || 1;
  const efficiency = typeof slot.efficiency === "number" ? slot.efficiency : 1;
  return { metric: role.metric, value: base * mounts * efficiency * (1 + stat / 100), unknown: false };
}

// "DDs and CLs are equipped with a default depth charge launcher" (Anti-Submarine Warfare
// page): 15 range, 60 x 2 damage, cooldown 6.32s for destroyers and 6.99s for light
// cruisers. That is not a slot - no anti-submarine slot in the dataset declares a built-in
// weapon - it is intrinsic to the hull, which is why it is keyed by hull rather than read
// off ship.equipment. The two ids are the built-in table's own DC rows, matched by those
// exact figures (#141 at 6.32s, #147 at 6.98s), and their dps already counts both charges.
// Equipped depth charges add to this launcher rather than replacing it, per the same page.
const INNATE_DEPTH_CHARGE_BY_HULL = { DD: 141, CL: 147 };

function innateDepthCharge(ship) {
  const id = INNATE_DEPTH_CHARGE_BY_HULL[ship.hullShort];
  return id ? DEFAULT_EQUIPMENT_BY_ID.get(id) || null : null;
}

// A barrage that fires every N main gun volleys is damage these figures used to ignore
// entirely, and ignoring it made the optimiser and the displayed DPS contradict each
// other: a ship handed a faster gun so she fires her barrage twice as often would show
// a LOWER DPS than before. It is not a slot - no slot declares it - so it is added here,
// the same way the innate depth charge launcher above is.
//
// The gun's catalog reload stands in for the true volley interval. That is the same
// baseline-100-reload approximation every other figure here already makes, and it is
// what the optimiser scores against, so the two agree.
function volleyBarrageDps(ship, effective, level) {
  const barrage = volleyBarrage(ship, level);
  if (!barrage) return 0;
  const key = shipGunSlotKeys(ship)[0];
  if (key == null) return 0;
  const gun = activeEquipmentForSlot(ship, key, ship.equipment[key]);
  if (!gun) return 0;
  const cycle = (gun.reload || 0) + (gun.volleyTime || 0);
  if (cycle <= 0) return 0;
  return (volleyBarrageDamage(barrage, effective, null) / barrage.n) / cycle;
}

// The four headline figures. Every slot contributes through whatever it actually fights
// with - the equipped item if there is one, otherwise the ship's built-in weapon - so a
// ship with an empty loadout still reports the damage she really does.
function computeCombatMetrics(ship, level, effective) {
  const totals = { dps: 0, dpsAA: 0, dpsASW: 0 };
  let unknownSlots = 0;
  for (const [slotKey, slot] of Object.entries(ship.equipment || {})) {
    const item = activeEquipmentForSlot(ship, slotKey, slot);
    if (!item) continue;
    const contribution = slotDamage(slot, item, effective);
    if (!contribution) continue;
    if (contribution.unknown) { unknownSlots++; continue; }
    totals[contribution.metric] += contribution.value;
  }

  const launcher = innateDepthCharge(ship);
  if (launcher) {
    const contribution = slotDamage({ mount: 1, efficiency: 1 }, launcher, effective);
    if (contribution && !contribution.unknown) totals[contribution.metric] += contribution.value;
  }

  const barrageDps = volleyBarrageDps(ship, effective, level);
  totals.dps += barrageDps;

  const hp = effective.stats.health ? effective.stats.health.value : 0;
  const evasion = effective.stats.evasion ? effective.stats.evasion.value : 0;
  const luck = effective.stats.luck ? effective.stats.luck.value : 0;
  const hitRate = referenceHitRate(evasion, luck);

  return {
    dps: totals.dps,
    dpsAA: totals.dpsAA,
    dpsASW: totals.dpsASW,
    ehp: hp / hitRate,
    hitRate,
    unknownSlots,
    volleyBarrageDps: barrageDps,
    innateDepthCharge: Boolean(launcher),
  };
}

// ---------------------------------------------------------------------------
// Hull role - drives which weight profile and which special-cased slot logic
// (CV aircraft orientation, the AA gun's fast-vs-slow pick, BB skipping
// survivability) applies. Read off hullShort rather than kept as one shared
// profile, per the user's own breakdown of how differently each role gears up.
// ---------------------------------------------------------------------------
function shipOptimizeRole(ship) {
  switch (ship.hullShort) {
    case "CV": case "CVL": return "carrier";
    case "CL": return "cl";
    case "CA": return "ca";
    case "CB": return "cb";
    case "BB": case "BC": case "BM": case "BBV": return "bb";
    case "SS": case "SSV": return "sub";
    default: return "general";
  }
}

// AA guns split into two playstyles the user named directly: a few fast, low-damage
// guns that always have a target to shoot at, and most guns which hit harder but
// reload slower. Reload is the cleanest signal the catalog has for this (no separate
// "fast/slow" field exists), so "fast" is simply below the AA Gun category's own
// median reload - a real split measured from the 68 AA Gun/AA Time Fuze Gun records
// (0.32s-1.97s, median 0.9s), not a guessed cutoff.
let aaGunReloadMedianCache = null;
function aaGunReloadMedian() {
  if (aaGunReloadMedianCache != null) return aaGunReloadMedianCache;
  const reloads = EQUIPMENT_DATA
    .filter(i => (i.category === "AA Gun" || i.category === "AA Time Fuze Gun") && typeof i.reload === "number")
    .map(i => i.reload)
    .sort((a, b) => a - b);
  aaGunReloadMedianCache = reloads.length ? reloads[Math.floor(reloads.length / 2)] : 1;
  return aaGunReloadMedianCache;
}
function isFastFiringAaGun(item) {
  return typeof item.reload === "number" && item.reload <= aaGunReloadMedian();
}

function shipHasSelfStatSkill(ship, statKey) {
  for (const skill of ship.skills || []) {
    for (const b of skill.statBonuses || []) {
      const isSelf = b.scope === "self" || (b.raw && SELF_LANGUAGE_RE.test(b.raw));
      if (isSelf && (b.stats || []).includes(statKey)) return true;
    }
  }
  return false;
}

// "Low AA" is read off the whole roster rather than an arbitrary flat number, cached
// once since it is the same lookup for every ship: base AA (no skills, no gear) at
// level 125, ranked against every other ship's. Below the median is "low" - a ship
// with no AA-boosting skill either then wants a fast gun that always has something to
// shoot, per the user's rule, rather than a hard-hitting one she is slow to use.
let antiairBaselineSorted = null;
function shipHasLowAntiAir(ship) {
  if (!antiairBaselineSorted) {
    antiairBaselineSorted = SHIPS_DATA
      .map(s => { const st = computeStats(s, 125, false); return st ? st.antiair : null; })
      .filter(v => typeof v === "number")
      .sort((a, b) => a - b);
  }
  const base = computeStats(ship, 125, false);
  const value = base ? base.antiair : 0;
  const median = antiairBaselineSorted[Math.floor(antiairBaselineSorted.length / 2)];
  return value <= median;
}

// 20 skills dataset-wide reduce an enemy's own SPD (survey done before writing this) -
// the signal the user gave for when placing a Torpedo Bomber is worth it, since her
// slower torpedo runs actually land more often against a slowed target.
const ENEMY_SLOW_RE = /\b(?:reduces?|decreases?)\b[^.;]{0,40}\benemy[^.;]{0,20}\bSPD\b|\bSPD\b[^.;]{0,20}\bof\b[^.;]{0,20}\benemy|slows? (?:down )?(?:the )?enem/i;
function shipHasEnemySlowSkill(ship) {
  return (ship.skills || []).some(sk => ENEMY_SLOW_RE.test(stripHtml(sk.description || "")));
}

// A BB/BC/BM/BBV's special barrage is either a per-shot roll ("40% (70%) chance to
// fire a barrage") or a fixed timer ("Every 15s: fires a barrage"), and which one she
// has decides whether her Main/Secondary Gun and Firepower auxiliary should chase
// firing FREQUENCY (more rolls) or raw per-shot POWER (a timer fires regardless of
// how fast she reloads, so only the hit's own size matters). "Proc" is checked before
// "timer" since a gated timer ("every 20s: 45% chance...") reads as a proc first -
// verified dataset-wide before writing this (149 BB-family ships: 77 proc, 15 timer,
// 57 with neither pattern, which fall back to ordinary damage-based scoring).
const BARRAGE_PROC_RE = /\d+%\s*\(\d+%\)\s*chance\s+to\s+(?:launch|fire|trigger)\b.{0,60}?\bbarrage/i;
const BARRAGE_TIMER_RE = /\bevery\s+\d+(?:\.\d+)?s\b.{0,80}?\b(?:fires?|launches?)\b.{0,40}?\bbarrage/i;
function shipBarrageTriggerType(ship) {
  const texts = (ship.skills || []).map(sk => stripHtml(sk.description || ""));
  if (texts.some(t => BARRAGE_PROC_RE.test(t))) return "proc";
  if (texts.some(t => BARRAGE_TIMER_RE.test(t))) return "timer";
  return null;
}

// How a skill switches on decides what its ship should carry, so the optimiser reads
// the activation clause rather than the effect. The full vocabulary this was drawn
// from is in CLAUDE.md; the one family that changes a gun choice is here.
//
// A barrage costing "every N times the main gun is fired" is paid for in VOLLEYS, not
// in seconds, so a faster gun fires it more often. That makes the barrage worth a
// share of every volley, which is what lets a fast gun beat a harder-hitting one on
// arithmetic instead of on a rule. The pair in "Every 15 (10) times" is skill level 1
// (max), so the max-level figure is the one taken, as renderLevelValues() does.
const MAIN_GUN_VOLLEY_RE = /\bevery\s+(\d+)\s*(?:\((\d+)\))?\s*(?:nd|rd|th|st)?\s*times?\b[^.]{0,45}?\bmain\s+gun/i;

// Limit break ranks unlock at these levels. They are three of the level control's own
// notches, which is what makes the control read as a progression rather than a scale.
const LIMIT_BREAK_LEVEL = { first: 30, second: 70, third: 100 };

// A barrage row tagged "enhanced" is the post-limit-break version of its skill's
// barrage, and that skill's untagged rows are the version before it: Kumano fires
// 15x30 until her third limit break and 15x35 plus a piercing volley after it, never
// both. Which rank grants the upgrade is written on each ship's own wiki page under
// "Limit Break ranks" - the Third for 22 of the 23 ships whose table names an upgrade
// outright, the exception being Kronshtadt, whose FIRST rank reads "Improves special
// barrage". The ships whose table names no upgrade at all reach their enhanced row
// through a mount or aircraft count that those same tables put at the Third, so Third
// is the measured default rather than a guess.
const BARRAGE_ENHANCED_AT_LEVEL = { "Kronshtadt": LIMIT_BREAK_LEVEL.first };

function barrageEnhancedLevel(ship) {
  return BARRAGE_ENHANCED_AT_LEVEL[ship.displayName] || LIMIT_BREAK_LEVEL.third;
}

// What a row's trigger says BEYOND plain enhanced/unenhanced. Rows sharing a qualifier
// are components of one pattern; rows with different qualifiers are alternatives the
// ship picks between - Azuma fires her Close OR her Far pattern, never both, and summing
// them doubled her barrage. The wiki sometimes writes the attack's name into the trigger
// too ("All Out Assault enhanced"), which is not a condition, so it is stripped first.
function barrageQualifier(row) {
  return String(row.trigger || "")
    .replace(/^all out assault\s+/i, "")
    .replace(/\b(un)?enhanced?\b/ig, "")
    .replace(/[,\s]+/g, " ")
    .trim()
    .toLowerCase();
}

function isEnhancedBarrageRow(row) {
  const trigger = String(row.trigger || "");
  return /enhanc/i.test(trigger) && !/unenhanc/i.test(trigger);
}

// The rows that actually fire at this level. Within one skill the enhanced rows REPLACE
// the plain ones from the upgrade level onward - counting both would add a barrage to
// its own replacement, which is what the DPS figure was doing. A skill whose rows are
// ALL enhanced has no recorded "before" version (3 of the 56 such groups), so its rows
// always show: hiding them would make the barrage vanish rather than downgrade.
function barragesAtLevel(ship, rows, level) {
  const upgraded = level >= barrageEnhancedLevel(ship);
  const groups = new Map();
  for (const row of rows) {
    const skill = matchSkillForBarrage(ship, row.skillName);
    const key = skill ? skill.name : row.skillName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const dropped = new Set();
  for (const group of groups.values()) {
    const enhanced = group.filter(isEnhancedBarrageRow);
    if (!enhanced.length || enhanced.length === group.length) continue;
    for (const row of group) if (isEnhancedBarrageRow(row) !== upgraded) dropped.add(row);
  }
  return dropped.size ? rows.filter(row => !dropped.has(row)) : rows;
}

// A barrage row's `effect` can set a burn or a flood, which is real damage none of the
// row's own DMG columns carry. Algérie META's enhanced barrage is SMALLER than the one
// it replaces - 8x25 against 12x40 - and still the upgrade, because it sets a burn of
// 186 DMG every 1.5s for 8s: 8/1.5 x 186, near a thousand damage the columns never show.
//
// Two shapes occur. A scaling one, "DMG equal to 5 + Barrage DMG * (1 + (FP / 100)) *
// 0.6", and a flat one, "186 DMG". Both are written as a per-tick figure with an
// interval and a duration, and both are prefixed by the chance of applying at all.
// Everything else an effect can say - Armor Break, "increase DMG taken", a smokescreen -
// is a debuff on a target this app never models, so only these two are read.
const BARRAGE_DOT_RE = /(?:Standard|Special)\s+(?:Burn|Flood)/i;
// Hass REMOVES burns rather than setting them, which the plain pattern would read
// backwards as damage dealt.
const BARRAGE_DOT_REMOVAL_RE = /\bremoves?\s+(?:standard|special)\s+(?:burn|flood)/i;
const BARRAGE_DOT_CHANCE_RE = /^\s*(\d+(?:\.\d+)?)\s*%\s*:/;
// The interval is written "every 3 seconds", "every 1.5s", or just "every second".
const BARRAGE_DOT_SCALED_RE = /DMG equal to\s+([\d.]+)\s*\+\s*Barrage DMG\s*\*\s*\(1\s*\+\s*\((FP|TRP|AVI|AA|ASW)\s*\/\s*100\)\)\s*\*\s*([\d.]+)[^)]*?every\s*([\d.]+)?\s*(?:s\b|seconds?)[^)]*?for\s+([\d.]+)\s*s/i;
const BARRAGE_DOT_FLAT_RE = /\(\s*([\d.]+)\s+DMG[^)]*?every\s*([\d.]+)?\s*(?:s\b|seconds?)[^)]*?for\s+([\d.]+)\s*s/i;
const BARRAGE_DOT_ID_RE = /ID:\s*(\d+)/i;
const DOT_STAT_KEY = { FP: "firepower", TRP: "torpedo", AVI: "aviation", AA: "antiair", ASW: "asw" };

// Returns the burn as terms in the same shape the row damage uses, so it needs no
// separate handling downstream: a scaling burn splits cleanly into a flat part and a
// stat-scaled one, and a flat burn is all flat. The chance is applied here, so a 30%
// burn counts for 30% of its total - counting a chance-gated burn in full would flatter
// whichever ships happen to have one.
function barrageDot(row) {
  const effect = String(row.effect || "");
  if (!BARRAGE_DOT_RE.test(effect) || BARRAGE_DOT_REMOVAL_RE.test(effect)) return null;
  const chanceMatch = BARRAGE_DOT_CHANCE_RE.exec(effect);
  const chance = chanceMatch ? Number(chanceMatch[1]) / 100 : 1;
  const idMatch = BARRAGE_DOT_ID_RE.exec(effect);
  let flat = 0, scaled = null, interval, duration;
  const s = BARRAGE_DOT_SCALED_RE.exec(effect);
  if (s) {
    interval = Number(s[4]) || 1;
    duration = Number(s[5]);
    flat = Number(s[1]);
    scaled = { stat: DOT_STAT_KEY[s[2].toUpperCase()], damage: (Number(row.baseDmg) || 0) * Number(s[3]) };
  } else {
    const f = BARRAGE_DOT_FLAT_RE.exec(effect);
    if (!f) return null;
    interval = Number(f[2]) || 1;
    duration = Number(f[3]);
    flat = Number(f[1]);
  }
  if (!interval || !duration) return null;
  const ticks = chance * (duration / interval);
  const terms = [];
  if (flat) terms.push({ stat: null, multiplier: 0, damage: flat * ticks });
  if (scaled && scaled.stat && scaled.damage) terms.push({ stat: scaled.stat, multiplier: 1, damage: scaled.damage * ticks });
  if (!terms.length) return null;
  // No id means nothing to key the no-stacking rule on, so the effect text stands in.
  return { id: idMatch ? idMatch[1] : effect, terms, size: terms.reduce((a, t) => a + t.damage, 0) };
}

const volleyBarrageCache = new Map();

// The barrage rows belonging to a skill, found by running the existing row-to-skill
// matcher backwards rather than writing a second name match. Where a ship has more
// than one such barrage, the one worth most PER VOLLEY wins - a small barrage every 2
// volleys can beat a large one every 10.
// Level-aware because a limit break swaps which rows fire, so the cache is keyed on the
// one bit of the level that can change the answer rather than on the level itself.
function volleyBarrage(ship, level) {
  const upgraded = (level || 0) >= barrageEnhancedLevel(ship);
  const cacheKey = ship.id + (upgraded ? "@lb" : "");
  if (volleyBarrageCache.has(cacheKey)) return volleyBarrageCache.get(cacheKey);
  const rows = barragesAtLevel(ship, ship.barrages || [], level || 0);
  let best = null;
  for (const skill of ship.skills || []) {
    const m = MAIN_GUN_VOLLEY_RE.exec(stripHtml(skill.description || ""));
    if (!m) continue;
    const n = Number(m[2] || m[1]);
    if (!n) continue;
    const mine = rows.filter(b => matchSkillForBarrage(ship, b.skillName) === skill);
    const terms = new Map();
    let damage = 0;
    const addTerm = (stat, multiplier, amount) => {
      if (!amount) return;
      const key = stat + "|" + multiplier;
      const term = terms.get(key) || { stat, multiplier: Number(multiplier) || 0, damage: 0 };
      term.damage += amount;
      terms.set(key, term);
      damage += amount;
    };
    // Rows sharing a qualifier are one pattern; different qualifiers are alternatives
    // the ship picks between, so each gets a share rather than all of them being summed.
    const byQualifier = new Map();
    for (const b of mine) {
      const q = barrageQualifier(b);
      if (!byQualifier.has(q)) byQualifier.set(q, []);
      byQualifier.get(q).push(b);
    }
    const share = 1 / (byQualifier.size || 1);
    for (const group of byQualifier.values()) {
    const dots = new Map();
    for (const b of group) {
      // A row is only counted when it plainly belongs to this trigger. Rows whose name
      // carries a qualifier past the skill name do not: they are alternatives rather
      // than components (Asuka fires ONE of "New Link Chance! (Variant 1..5)", not all
      // five), or they are a second trigger the same skill also has ("Happy D (every
      // 5s)" alongside her every-2-volleys attack). Summing either inflates the barrage
      // and hands the ship a gun she does not want, so an ambiguous row is dropped -
      // unless its own trigger field names the main gun, which settles it outright.
      // Costs 8% of the counted damage across the roster and leaves 502 of 507 ships
      // with a figure; the 5 that lose it fall back to no barrage term at all.
      const suffix = b.skillName.toLowerCase().startsWith(skill.name.toLowerCase())
        ? b.skillName.slice(skill.name.length)
        : b.skillName;
      if (/\([^)]+\)/.test(suffix) && !/main gun/i.test(b.trigger || "")) continue;
      // The Light/Medium/Heavy columns of the Barrages table, averaged - the same
      // armour-neutral figure equipmentBaseDps() uses for gear, so the two are
      // comparable. Each already includes the row's Count, so this is the whole row.
      // Count x Base DMG would be the pre-armour figure instead, and the difference is
      // not a constant: it runs from 0.567x (Jintsuu, whose barrage is punished by
      // armour) to 1.200x (Prinz Eugen mu, whose torpedo barrage is rewarded by it), so
      // it decides which ships are worth a faster gun rather than merely rescaling them.
      const armour = [b.lightDmg, b.mediumDmg, b.heavyDmg].map(Number).filter(v => Number.isFinite(v));
      const rowDamage = (armour.length
        ? armour.reduce((a, c) => a + c, 0) / armour.length
        : (Number(b.count) || 0) * (Number(b.baseDmg) || 0)) * share;
      const scaling = b.statScaling || {};
      addTerm(scaling.stat, scaling.multiplier, rowDamage);
      // A burn of a given id refreshes rather than stacks, so a barrage that applies
      // the same one from several rows still only burns once - Alsace writes id 150028
      // three times over. Different ids are different effects and do stack, which is
      // why Azuma's 311 and 357 both count.
      const dot = barrageDot(b);
      if (dot && (!dots.has(dot.id) || dots.get(dot.id).size < dot.size)) dots.set(dot.id, dot);
    }
    for (const dot of dots.values()) {
      for (const t of dot.terms) addTerm(t.stat, t.multiplier, t.damage * share);
    }
    }
    if (damage > 0 && (!best || damage / n > best.damage / best.n)) {
      best = { n, damage, terms: [...terms.values()] };
    }
  }
  volleyBarrageCache.set(cacheKey, best);
  return best;
}

// Most volley barrages scale off Firepower exactly as the gun does, but 83 rows across
// 64 ships scale off Torpedo instead - a destroyer whose All Out Assault launches
// torpedoes - so applying Firepower to everything would overstate them. Each term keeps
// its own stat and the wiki's own coefficient for it; with a coefficient of 1 this is
// the gun's own (1 + stat/100). A row whose stat is not one this app tracks contributes
// its flat damage and nothing more, rather than being dropped.
// `item` is the gun being considered: its own stat bonus lifts the barrage too.
function volleyBarrageDamage(barrage, effective, item) {
  let total = 0;
  for (const term of barrage.terms) {
    const entry = term.stat ? effective.stats[term.stat] : null;
    const stat = (entry ? entry.value : 0) + (item ? itemStatBonus(item, term.stat) : 0);
    total += term.damage * (1 + term.multiplier * stat / 100);
  }
  return total;
}

function findEquipmentByName(name) {
  return EQUIPMENT_DATA.find(i => i.name === name) || null;
}

// The one item the user singled out by name: Repair Toolkit's own passive HP regen is
// real value the single-hit eHP formula below cannot represent (it only ever compares
// one hit against current HP/Evasion, never sustained recovery over a fight), so a
// candidate whose notes promise it gets a deliberate score bump on top of its eHP.
// General on the notes' own wording rather than hardcoded to Repair Toolkit's id, in
// case a similar item is added later - checked dataset-wide, only Repair Toolkit and
// the unrelated, collab-gated Elixir mention "recovers ... HP" at all, and Elixir's
// phrasing (no recurring "every Ns") does not match this pattern.
const HP_REGEN_NOTES_RE = /recovers?\s+\d+(?:\.\d+)?%\s+of\s+(?:this ship'?s\s+)?max\s*HP\s+every\s+\d+(?:\.\d+)?s/i;
function itemGrantsHpRegen(item) {
  return !!(item && item.notes && HP_REGEN_NOTES_RE.test(item.notes));
}
const HP_REGEN_SCORE_BONUS = 1.15;

// Simulates equipping one candidate into one slot and reads back the REAL resulting
// eHP (same HP/HitRate formula computeCombatMetrics renders) rather than approximating
// it from the item's own flat numbers - a flat HP/Evasion bonus is added before the
// ship's own skill percentages apply, so an approximation would not track a boosted
// ship correctly. Cheap enough to call once per candidate: this only runs from an
// explicit Optimize click, not on every render.
function candidateEhp(ship, slotKey, item) {
  const original = getEquippedGear(ship, slotKey);
  setEquippedGear(ship, slotKey, item);
  const eff = computeEffectiveStats(ship, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
  const hp = eff.stats.health ? eff.stats.health.value : 0;
  const evasion = eff.stats.evasion ? eff.stats.evasion.value : 0;
  const luck = eff.stats.luck ? eff.stats.luck.value : 0;
  let ehp = hp / referenceHitRate(evasion, luck);
  if (itemGrantsHpRegen(item)) ehp *= HP_REGEN_SCORE_BONUS;
  if (original) setEquippedGear(ship, slotKey, original);
  else setEquippedGear(ship, slotKey, null);
  return ehp;
}

const SURVIVAL_STAT_KEYS = new Set(["health", "evasion", "luck"]);
// CA is the one role the user gave an explicit override for: "quasiment que des
// auxiliaire d'augmentation de HP théorique" - almost only HP-boosting auxiliaries,
// not the general stat-driven eHP simulation everyone else gets (which is what
// already produces "destroyers usually prefer HP over Evasion" on its own, since a
// DD's already-high base Evasion means an EVA item's eHP return is small next to a
// flat HP item's). So a CA's candidate pool is narrowed to items that grant HP at
// all (an HP+Evasion hybrid like Improved Hydraulic Rudder still qualifies) rather
// than opened to pure-Evasion options the simulation might otherwise prefer.
function itemIsSurvivalCandidate(item, role) {
  if (item.category !== "Auxiliary") return false;
  const bonus = item.statBonus || {};
  const keys = Object.keys(bonus).map(rawKey => EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey);
  if (role === "ca" || role === "cb") return keys.includes("health");
  return keys.some(key => SURVIVAL_STAT_KEYS.has(key));
}

// ---------------------------------------------------------------------------
// Optimisation targets
// ---------------------------------------------------------------------------

// Two rules from the user drive every weight below.
// 1. Survivability comes first, then AA - so every target keeps a real weight on
//    health/evasion and a smaller one on anti-air, even a purely offensive one.
//    BB is the deliberate exception - see roleRecommendedWeights.
// 2. Optimising means amplifying what a ship already does well, NOT patching what she is
//    bad at - the one exception being survivability, which everyone wants. That is why
//    the offensive weight in "recommended" is chosen from the ship's own strongest
//    scaling stat rather than her weakest.
const SURVIVAL_BASE = { health: 0.5, evasion: 0.4 };
const OPTIMIZE_TARGETS = {
  auto: { label: "Recommended", weights: null },
  survival: { label: "Survivability", weights: { health: 1, evasion: 1, antiair: 0.3 } },
  firepower: { label: "Firepower", weights: { firepower: 1, accuracy: 0.7, antiair: 0.3, ...SURVIVAL_BASE } },
  torpedo: { label: "Torpedo", weights: { torpedo: 1, antiair: 0.3, ...SURVIVAL_BASE } },
  aviation: { label: "Aviation", weights: { aviation: 1, accuracy: 0.4, antiair: 0.3, ...SURVIVAL_BASE } },
  antiair: { label: "Anti-Air", weights: { antiair: 1, ...SURVIVAL_BASE } },
  asw: { label: "Anti-Sub", weights: { asw: 1, health: 0.4, evasion: 0.3 } },
  // Carrier-only: her aviation-stat slots can hold Fighter/Seaplane, Dive Bomber or
  // Torpedo Bomber families that a single "aviation" weight cannot tell apart, since
  // all three scale off the same stat. Dispatched by pickCarrierAircraft, not weights.
  cvFighter: { label: "Fighter (AA)", weights: null, carrierOrientation: "fighter" },
  cvBomber: { label: "Dive Bomber", weights: null, carrierOrientation: "bomber" },
  cvTorpedo: { label: "Torpedo Bomber", weights: null, carrierOrientation: "torpedo" },
};

// Only the Anti-Sub target may pull in anything that boosts ASW, per the user's rule.
// This covers both halves: ASW equipment proper, and an auxiliary whose bonus is ASW.
function targetAllowsAsw(targetId) {
  return targetId === "asw";
}

function itemBoostsAsw(item) {
  if (item.category === "ASW") return true;
  const bonus = item.statBonus || {};
  return typeof bonus.asw === "number" && bonus.asw > 0;
}

// The offensive stats a ship can actually scale, read off her real slots rather than a
// hardcoded hull list - so each hull naturally gets its own set of orientations, and a
// ship with an unusual loadout is not forced into the wrong one. Carriers get their
// three dedicated aircraft orientations instead of the single generic "Aviation" -
// Fighter, Dive Bomber and Torpedo Bomber all scale off the same stat, so one weight
// can never tell them apart the way pickCarrierAircraft's category preference can.
function availableOptimizeTargets(ship) {
  const ids = new Set(["auto", "survival"]);
  const isCarrier = shipOptimizeRole(ship) === "carrier";
  for (const slot of Object.values(ship.equipment || {})) {
    for (const item of equipmentOptionsForSlot(slot, ship)) {
      const role = weaponRole(item);
      if (!role) continue;
      if (role.metric === "dpsAA") ids.add("antiair");
      else if (role.metric === "dpsASW") ids.add("asw");
      else if (role.stat === "firepower") ids.add("firepower");
      else if (role.stat === "torpedo") ids.add("torpedo");
      else if (role.stat === "aviation" && !isCarrier) ids.add("aviation");
    }
  }
  if (isCarrier) { ids.add("cvFighter"); ids.add("cvBomber"); ids.add("cvTorpedo"); }
  return Object.keys(OPTIMIZE_TARGETS).filter(id => ids.has(id));
}

// "Recommended": survivability and AA as a floor, plus whichever scaling stat this ship
// is already best at, compared as a share of the ship's own total so the three are on
// the same scale rather than raw magnitude - EXCEPT the three roles the user described
// as needing their own emphasis regardless of what "already good" happens to compute
// to: CL leans on Anti-Air (she is usually the fleet's AA platform), CA leans hard on
// Firepower and HP over Evasion (a tank amplifies raw damage and theoretical HP, not
// dodge), and BB drops survivability to near nothing (she leans on Firepower/Accuracy
// and is not expected to carry a defensive auxiliary except when nothing else scores).
function recommendedWeights(ship, effective) {
  const role = shipOptimizeRole(ship);
  const candidates = ["firepower", "torpedo", "aviation"];
  let best = null, bestValue = 0;
  for (const key of candidates) {
    const entry = effective.stats[key];
    const value = entry ? entry.value : 0;
    if (value > bestValue) { best = key; bestValue = value; }
  }

  if (role === "bb") {
    const weights = { firepower: 1, accuracy: 0.8, health: 0.05, evasion: 0.05, antiair: 0.2 };
    return weights;
  }
  if (role === "ca" || role === "cb") {
    // CB adds nothing to the CA profile here - her own difference (heavy-caliber gun,
    // hard-hitting AA) is a weapon-slot rule, not an auxiliary weight.
    const weights = { health: 1, firepower: 0.9, evasion: 0.3, antiair: 0.4 };
    return weights;
  }
  if (role === "cl") {
    const weights = { health: 1, evasion: 0.8, antiair: 0.9 };
    if (best) { weights[best] = 0.9; if (best === "firepower") weights.accuracy = 0.6; }
    return weights;
  }
  // Carrier: no survivability weight at all, per the user's own instruction - purely
  // raw Aviation (Steam Catapult's own preference is applied directly in
  // optimizeEquipment, ahead of any weight here).
  if (role === "carrier") {
    return { aviation: 1, accuracy: 0.3, antiair: 0.2 };
  }

  const weights = { health: 1, evasion: 0.8, antiair: 0.6 };
  if (best) {
    weights[best] = 0.9;
    if (best === "firepower") weights.accuracy = 0.6;
  }
  return weights;
}

function optimizeWeights(ship, targetId, effective) {
  if (targetId === "auto") return recommendedWeights(ship, effective);
  return (OPTIMIZE_TARGETS[targetId] || OPTIMIZE_TARGETS.auto).weights || recommendedWeights(ship, effective);
}

// Auxiliary bonuses are on wildly different scales - a few hundred HP against a dozen
// Evasion - so each is expressed as a share of the largest bonus available for that stat.
// Without that, a weight of 1 on Evasion could never outrank a weight of 0.1 on Health.
// Computed on first use, not at load: EQUIPMENT_STAT_KEY_ALIASES is declared further down
// the file, and reading it from a top-level IIFE up here throws on the temporal dead zone
// - which aborts the whole script silently, leaving every later const uninitialised.
let auxiliaryStatMax = null;
function auxiliaryStatMaxima() {
  if (auxiliaryStatMax) return auxiliaryStatMax;
  auxiliaryStatMax = {};
  for (const item of typeof EQUIPMENT_DATA === "undefined" ? [] : EQUIPMENT_DATA) {
    for (const [rawKey, amount] of Object.entries(item.statBonus || {})) {
      const key = EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey;
      if (typeof amount === "number" && amount > (auxiliaryStatMax[key] || 0)) auxiliaryStatMax[key] = amount;
    }
  }
  return auxiliaryStatMax;
}

// HP/Evasion/Luck cannot be ranked by raw magnitude the way Firepower or Aviation
// can - Evasion has diminishing returns baked into the HitRate formula, so 49
// Evasion is not "worth less than" 640 flat HP just because 640 is the bigger
// number. That comparison is exactly what put Plum-Petal Poetry's flat 640 HP ahead
// of Improved Hydraulic Rudder's 72 HP + 49 Evasion on Roon, when a real eHP
// simulation the guaranteed survivability slot already ran shows the Rudder is
// ahead by ~1400 eHP. So every aux slot compares its survival-stat candidates by
// real simulated eHP, not the proportional-to-maximum heuristic the other stats
// still use (there is no equivalent diminishing-returns effect to get wrong there).
function statPreferenceScore(item, weights, ship, slotKey, baseEhp) {
  const maxima = auxiliaryStatMaxima();
  const bonus = item.statBonus || {};
  let score = 0;
  let hasSurvivalStat = false;
  for (const [rawKey, amount] of Object.entries(bonus)) {
    const key = EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey;
    if (SURVIVAL_STAT_KEYS.has(key)) { hasSurvivalStat = true; continue; }
    const weight = weights[key];
    if (!weight || typeof amount !== "number") continue;
    score += weight * (amount / (maxima[key] || amount));
  }
  if (hasSurvivalStat && ship && slotKey && baseEhp) {
    const survivalWeight = Math.max(weights.health || 0, weights.evasion || 0, weights.luck || 0);
    if (survivalWeight > 0) {
      const ehp = candidateEhp(ship, slotKey, item);
      score += survivalWeight * ((ehp - baseEhp) / baseEhp);
    }
  }
  return score;
}

// What Optimize maximises: the slot's own damage figure, ignoring rarity entirely.
// Rarity is NOT a proxy for power here - in 4 of 14 categories the highest-rarity item
// is not the strongest (a Super Rare Twin 410mm out-damages every Ultra Rare BB gun),
// so taking the top of sortEquipmentOptions would pick the wrong item.
//
// Guns carry dps.raw, the figure before armour modifiers. Torpedoes and aircraft do not,
// and carry no armorMod either, so raw cannot be recovered - the mean of light/medium/
// heavy stands in for it. That is deliberately neutral: picking dps.light instead would
// silently assume the target is light-armoured and reorder the torpedo list.
// AA guns and ASW gear have their own single figure.
// Auxiliaries have none, and there is no defensible way to rank HP against Evasion
// against Accuracy without knowing what the player wants - so they score null and
// Optimize leaves them alone rather than inventing a preference.
function equipmentOptimizeScore(item) {
  if (item.dps) {
    if (typeof item.dps.raw === "number") return item.dps.raw;
    const values = [item.dps.light, item.dps.medium, item.dps.heavy].filter(v => typeof v === "number");
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  if (typeof item.aaDps === "number") return item.aaDps;
  if (typeof item.aswDps === "number") return item.aswDps;
  return null;
}

function itemStatBonus(item, key) {
  const bonus = item.statBonus || {};
  for (const [rawKey, amount] of Object.entries(bonus)) {
    if ((EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey) === key && typeof amount === "number") return amount;
  }
  return 0;
}

// The catalog's DPS is a stat-0 baseline, so ranking on it alone compares guns as if the
// ship had no Firepower - which is not how any of them will actually fire. A weapon that
// carries a big stat bonus raises the very stat that multiplies its own damage, and the
// difference is not marginal: the Prototype Quadruple 152mm (45.88 raw, +65 FP) scored
// BELOW the Single 152mm (6"/45 Pattern 1892) (45.89 raw, +12 FP) purely on the 0.01 of
// raw DPS between them, when at any real Firepower it is far ahead.
//
// So a weapon is scored the way computeCombatMetrics already renders it - the wiki's
// WeaponStatMultiplier, (1 + ScalingStat/100) - with the item's own bonus to that stat
// added in. Mounts and efficiency belong to the slot and are equal for every candidate in
// it, so they are left out; they would not change the order.
//
// Two second-order effects are knowingly ignored: a gun's Firepower bonus also lifts the
// ship's OTHER gun slots, and the picks are made slot by slot rather than jointly. Both
// would need a whole-loadout search to model, and neither changes which gun wins a slot.
// barragePerVolley is what this ship's volley-triggered barrage adds to each main gun
// volley - 0 for every other slot and every ship without one. Dividing it by the
// candidate's own cycle time puts it on the same footing as the gun's DPS, before the
// ship's stat multiplies both, which is right: these barrages scale off Firepower
// exactly as the gun does.
//
// slotFactor is the slot's mounts x efficiency. It used to be left out on the grounds
// that it multiplies every candidate in a slot equally and so cannot change their
// order - true until the barrage term arrived, and false afterwards: a gun fires from
// every mount at the slot's efficiency, while the barrage is one fixed pattern that
// neither touches. Omitting it made the barrage look mounts x efficiency times more
// important than it is - about 4.5x on a typical 3-mount 150% slot - and handed 137
// ships a weaker gun. It also keeps this identical to slotDamage(), which is what makes
// the optimiser and the displayed DPS agree.
function weaponScoreForShip(item, damage, effective, barragePerVolley, slotFactor) {
  const role = weaponRole(item);
  if (!role || !effective) return damage;
  const entry = effective.stats[role.stat];
  const stat = (entry ? entry.value : 0) + itemStatBonus(item, role.stat);
  let dps = damage * (slotFactor || 1) * (1 + stat / 100);
  if (barragePerVolley) {
    const cycle = (item.reload || 0) + (item.volleyTime || 0);
    if (cycle > 0) dps += barragePerVolley / cycle;
  }
  return dps;
}

// Global, like the Skills tab's Max Level state: it survives switching ships, because a
// player comparing two ships means the same cap on both.
let equipmentRarityCap = "Ultra Rare";
let equipmentTarget = "auto";
// Gear Lab gear is crafted and Research gear has to be researched, so a player who has not
// unlocked either wants it out of the optimiser's reach. Both flags mean "obtainable ONLY
// that way" - gear you can also buy or farm is unaffected by turning a source off. They
// still show in the picker: the restriction is about what this player has, not about what
// the ship may mount.
let includeGearLab = true;
let includeResearch = true;

function equipmentWithinCap(item) {
  return EQUIPMENT_RARITY_ORDER.indexOf(item.rarity) <= EQUIPMENT_RARITY_ORDER.indexOf(equipmentRarityCap);
}

// Per slot, the highest-scoring option at or below the cap. Slots whose options have no
// score at all (Auxiliary) are left untouched, and so is any slot with nothing under the
// cap - clearing it instead would silently throw away a pick the user made by hand.
// A handful of skills call out a specific piece of equipment by name - Jean Bart's
// "If this ship is equipped with the Quadruple 380mm (Mle 1935) gun...", Helena's "When
// this ship has an SG Radar equipped...". 15 catalog names appear across the dataset's
// skills, and the ship whose skill names one is exactly the ship meant to carry it.
// Two things follow, both asked for directly:
//  - Optimize prefers a named item over an unnamed one, ahead of any score.
//  - An item flagged `unique` (see below) is off the table entirely unless named here.
// Matched per ship rather than globally: a unique event item named in someone else's
// skill is no reason to hand it to this ship.
let equipmentNameRe = null;
const equipmentNameByLower = new Map();
const skillNamedCache = new Map();

function equipmentNamePattern() {
  if (equipmentNameRe) return equipmentNameRe;
  const names = [...new Set(EQUIPMENT_DATA.map(i => i.name))].sort((a, b) => b.length - a.length);
  for (const n of names) equipmentNameByLower.set(n.toLowerCase(), n);
  // Longest first, so "Twin 127mm (5\"/38 Mk 38)" is not shadowed by a shorter sibling.
  equipmentNameRe = new RegExp("(?<![A-Za-z])(?:" + names.map(escapeRegExp).join("|") + ")(?![A-Za-z])", "gi");
  return equipmentNameRe;
}

function skillNamedEquipment(ship) {
  if (skillNamedCache.has(ship.id)) return skillNamedCache.get(ship.id);
  const found = new Set();
  const re = equipmentNamePattern();
  for (const skill of ship.skills || []) {
    const text = stripHtml(skill.description) + " " + (skill.name || "");
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const canonical = equipmentNameByLower.get(m[0].toLowerCase());
      if (canonical) found.add(canonical);
    }
  }
  skillNamedCache.set(ship.id, found);
  return found;
}

// `unique` marks an item that none of the five obtainable-gear pages lists - gear boxes,
// Gear Lab, Research Academy, Shops, and the campaign Equipment Drop Table. What is left
// is event rewards and event-shop gear, which a player cannot simply go and get, so the
// optimiser only reaches for one when a skill names it.
function equipmentReachable(item, named) {
  return !item.unique || named.has(item.name);
}
// A weapon slot has one sensible answer - the biggest damage figure it can hold - so the
// goal does not change it. What the goal decides is the auxiliary slots, which have no
// damage figure and were previously left empty because "best" was undefined without
// knowing what the player wants. It also decides whether ASW is on the table at all.
// Candidates are ranked on three keys in order, because the later ones are only
// comparable within the earlier: a slot that can hold a weapon is always decided by
// damage, so a stat-only item may only win a slot where nothing else shoots; then a
// skill-named item outranks an unnamed one; then the score decides.
function betterCandidate(a, b) {
  if (!b) return true;
  if (a.isWeapon !== b.isWeapon) return a.isWeapon;
  if (a.isNamed !== b.isNamed) return a.isNamed;
  return a.score > b.score;
}

// A BB's AA Gun slot is picked for what it ALSO gives her, not for its own AA damage -
// only 6 of 68 AA guns carry a secondary Accuracy or Firepower bonus, so that bonus
// dominates the score when present; aaDps is kept only as the tiebreaker so a BB with
// no such option available still gets her strongest AA gun rather than none at all.
function bbAntiAirScore(item) {
  const secondary = itemStatBonus(item, "accuracy") + itemStatBonus(item, "firepower");
  return secondary * 1000 + (equipmentOptimizeScore(item) || 0);
}

const AIRCRAFT_CATEGORIES_CV = ["Fighter", "Seaplane", "Dive Bomber", "Torpedo Bomber"];
const CV_ORIENTATION_CATEGORIES = {
  fighter: ["Fighter", "Seaplane"],
  bomber: ["Dive Bomber"],
  torpedo: ["Torpedo Bomber"],
};

function slotAircraftCategories(slot, ship) {
  return [...new Set(equipmentOptionsForSlot(slot, ship).map(i => i.category).filter(c => AIRCRAFT_CATEGORIES_CV.includes(c)))];
}

const AIRCRAFT_ROCKET_ORDNANCE_RE = /\brocket/i;

function bestAircraftForSlot(ship, slot, categories, effective, filterItem, named) {
  // Only checked once per slot, not per candidate - shipHasEnemySlowSkill re-scans
  // every skill's text each call, and a slot's candidate list can run into the
  // hundreds.
  const preferSlowSynergy = shipHasEnemySlowSkill(ship);
  let best = null;
  for (const item of equipmentOptionsForSlot(slot, ship)) {
    if (!categories.includes(item.category)) continue;
    if (!filterItem(item)) continue;
    const damage = equipmentOptimizeScore(item);
    if (damage === null) continue;
    let score = weaponScoreForShip(item, damage, effective);
    // When this ship can actually slow the enemy her torpedoes need that for, Sakura
    // Empire torpedo bombers and rocket-armed fighters are the named preference.
    if (preferSlowSynergy) {
      if (item.category === "Torpedo Bomber" && item.nation === "Sakura Empire") score += 1;
      if (item.category === "Fighter" && item.ordnance && AIRCRAFT_ROCKET_ORDNANCE_RE.test(item.ordnance)) score += 1;
    }
    const candidate = { item, isWeapon: true, isNamed: named.has(item.name), score };
    if (betterCandidate(candidate, best)) best = candidate;
  }
  return best ? best.item : null;
}

// Fighter/Dive Bomber/Torpedo Bomber all scale off the same Aviation stat, so a slot's
// own accepted categories - not a stat weight - decide what actually differs between
// them. A picked orientation (fighter/bomber/torpedo) tries every eligible slot for
// that family first, falling back to whatever the slot accepts if it cannot take it.
// "Recommended" instead spreads the three families across her slots, best-efficiency
// slot first, per the user's own "mets le bon avion sur la meilleure efficiency" -
// and only offers Torpedo Bomber where a slot cannot do anything else, unless this
// ship actually has a way to slow the enemy her torpedoes need that for.
function pickCarrierAircraft(ship, effective, orientation, filterItem, named) {
  const slots = Object.entries(ship.equipment || {})
    .map(([key, slot]) => ({ key, slot, categories: slotAircraftCategories(slot, ship) }))
    .filter(s => s.categories.length > 0);
  const picks = {};
  if (!slots.length) return picks;

  if (orientation === "fighter" || orientation === "bomber" || orientation === "torpedo") {
    const preferred = CV_ORIENTATION_CATEGORIES[orientation];
    for (const s of slots) {
      const wantCats = s.categories.filter(c => preferred.includes(c));
      picks[s.key] = bestAircraftForSlot(ship, s.slot, wantCats.length ? wantCats : s.categories, effective, filterItem, named);
    }
    return picks;
  }

  const allowTorpedo = shipHasEnemySlowSkill(ship);
  const ordered = [...slots].sort((a, b) => (b.slot.efficiency || 1) - (a.slot.efficiency || 1));
  const rotation = ["Fighter", "Dive Bomber", "Torpedo Bomber"];
  let rotationIndex = 0;
  for (const s of ordered) {
    let chosen = null;
    for (let tries = 0; tries < rotation.length && !chosen; tries++) {
      const candidate = rotation[(rotationIndex + tries) % rotation.length];
      const mandatory = s.categories.length === 1 && s.categories[0] === "Torpedo Bomber";
      if (candidate === "Torpedo Bomber" && !allowTorpedo && !mandatory) continue;
      const matchCats = candidate === "Fighter" ? ["Fighter", "Seaplane"] : [candidate];
      const reachable = s.categories.filter(c => matchCats.includes(c));
      if (reachable.length) { chosen = reachable; rotationIndex = (rotationIndex + tries + 1) % rotation.length; }
    }
    if (!chosen) {
      chosen = s.categories.filter(c => c !== "Torpedo Bomber" || allowTorpedo);
      if (!chosen.length) chosen = s.categories;
    }
    picks[s.key] = bestAircraftForSlot(ship, s.slot, chosen, effective, filterItem, named);
  }
  return picks;
}

function optimizeEquipment(ship, effective, level = currentLevel) {
  const targetId = OPTIMIZE_TARGETS[equipmentTarget] ? equipmentTarget : "auto";
  const targetDef = OPTIMIZE_TARGETS[targetId] || OPTIMIZE_TARGETS.auto;
  const weights = optimizeWeights(ship, targetId, effective);
  const allowAsw = targetAllowsAsw(targetId);
  const named = skillNamedEquipment(ship);
  const role = shipOptimizeRole(ship);
  // CB never wants the fast-AA preference - "ok but not critical, prefer whatever
  // hits harder" is the opposite bias, which is just the ordinary damage-based score
  // this exclusion falls back to.
  const wantFastAa = role !== "bb" && role !== "cb" && shipHasLowAntiAir(ship) && !shipHasSelfStatSkill(ship, "antiair");
  const barrageTrigger = role === "bb" ? shipBarrageTriggerType(ship) : null;
  // Only the FIRST gun slot fires the barrage: the trigger counts main gun volleys,
  // and a later gun slot is a secondary battery (see EQUIPMENT_SHORT_NAMES).
  const volley = volleyBarrage(ship, level);
  const mainGunSlotKey = volley ? shipGunSlotKeys(ship)[0] : null;
  let changed = 0;

  const filterItem = item =>
    equipmentWithinCap(item) &&
    (includeGearLab || !item.gearLab) &&
    (includeResearch || !item.research) &&
    (allowAsw || !itemBoostsAsw(item)) &&
    equipmentReachable(item, named);

  // Carrier aircraft slots are dispatched separately - Fighter/Dive Bomber/Torpedo
  // Bomber cannot be told apart by a stat weight, see pickCarrierAircraft.
  const carrierPicks = role === "carrier"
    ? pickCarrierAircraft(ship, effective, targetDef.carrierOrientation || "auto", filterItem, named)
    : {};

  const usedAuxNames = new Set();
  const auxSlotKeys = Object.entries(ship.equipment || {})
    .filter(([, slot]) => (slot.type || []).includes(10))
    .map(([key]) => key);

  // Submarines run on Oxygen, not HP - Improved Snorkel (Oxygen+Accuracy) and Type 93
  // Pure Oxygen Torpedo (a Torpedo+Reload bonus filed under Auxiliary, not Torpedo, in
  // the catalog) are the named pair the user asked for, tried on her two aux slots in
  // that order before anything else gets a chance to fill them.
  const subPicks = {};
  if (role === "sub" && auxSlotKeys.length) {
    const subNamed = [findEquipmentByName("Improved Snorkel"), findEquipmentByName("Type 93 Pure Oxygen Torpedo")].filter(Boolean);
    const remainingSlots = [...auxSlotKeys];
    for (const item of subNamed) {
      if (!remainingSlots.length || !filterItem(item)) continue;
      const options = equipmentOptionsForSlot(ship.equipment[remainingSlots[0]], ship);
      if (!options.some(i => i.name === item.name)) continue;
      subPicks[remainingSlots.shift()] = item;
    }
  }

  // Exactly one aux slot is reserved for a guaranteed survivability pick, skipped for
  // BB (near-zero survivability weight already covers "except when nothing else
  // scores" - see recommendedWeights), for carriers (no survivability tool at all in
  // Recommended, purely AVI - see the Steam Catapult preference below), and for
  // submarines (their aux slots are Oxygen-driven, handled by subPicks above).
  // Real eHP is simulated per candidate rather than approximated from its own stat
  // numbers, since a flat bonus is amplified by this ship's own skill percentages
  // before it becomes real eHP. The reserved slot is the ship's first
  // Auxiliary-capable slot; efficiency does not apply to a flat stat bonus, so which
  // of her aux slots holds it changes nothing about the result.
  const survivalSlotKey = role !== "bb" && role !== "carrier" && role !== "sub" && auxSlotKeys.length
    ? auxSlotKeys[0]
    : null;
  if (survivalSlotKey) {
    const slot = ship.equipment[survivalSlotKey];
    let bestItem = null, bestEhp = -Infinity;
    for (const item of equipmentOptionsForSlot(slot, ship)) {
      if (!filterItem(item) || !itemIsSurvivalCandidate(item, role)) continue;
      const ehp = candidateEhp(ship, survivalSlotKey, item);
      if (ehp > bestEhp) { bestEhp = ehp; bestItem = item; }
    }
    if (bestItem) {
      setEquippedGear(ship, survivalSlotKey, bestItem);
      usedAuxNames.add(bestItem.name);
      changed++;
    }
  }

  for (const [slotKey, slot] of Object.entries(ship.equipment || {})) {
    if (carrierPicks[slotKey] !== undefined) {
      if (carrierPicks[slotKey]) { setEquippedGear(ship, slotKey, carrierPicks[slotKey]); changed++; }
      continue;
    }
    if (subPicks[slotKey]) {
      setEquippedGear(ship, slotKey, subPicks[slotKey]);
      usedAuxNames.add(subPicks[slotKey].name);
      changed++;
      continue;
    }
    if (slotKey === survivalSlotKey) continue;

    const isBbAntiAir = role === "bb" && (slot.type || []).some(c => c === 6 || c === 21);
    const isAuxSlot = auxSlotKeys.includes(slotKey);
    // Baseline for this slot's own real eHP comparisons (see statPreferenceScore) -
    // computed once per slot, not per candidate, since it never depends on the item
    // being scored.
    const baseEhp = isAuxSlot ? candidateEhp(ship, slotKey, null) : null;

    let best = null;
    for (const item of equipmentOptionsForSlot(slot, ship)) {
      if (!filterItem(item)) continue;
      // Auxiliaries stacking the same passive on one ship is a bug the user asked to
      // close, not a feature - "Effect does not stack" is written on most of them, and
      // even the ones that do not say so rarely benefit from two identical copies.
      // A carrier's two aux slots are the deliberate exception: Steam Catapult (the
      // strongest non-unique Aviation auxiliary in the catalog, see the note below)
      // is meant to fill BOTH of them.
      const isCarrierCatapult = role === "carrier" && item.name === "Steam Catapult";
      if (isAuxSlot && item.category === "Auxiliary" && usedAuxNames.has(item.name) && !isCarrierCatapult) continue;

      const damage = isBbAntiAir ? null : equipmentOptimizeScore(item);
      const isWeapon = damage !== null;
      let score;
      if (isBbAntiAir) score = bbAntiAirScore(item);
      else if (isWeapon) {
        const barragePerVolley = slotKey === mainGunSlotKey
          ? volleyBarrageDamage(volley, effective, item) / volley.n
          : 0;
        const slotFactor = (slot.mount || 1) * (typeof slot.efficiency === "number" ? slot.efficiency : 1);
        score = weaponScoreForShip(item, damage, effective, barragePerVolley, slotFactor);
        if (item.category === "AA Gun" || item.category === "AA Time Fuze Gun") {
          if (wantFastAa && !isFastFiringAaGun(item)) score *= 0.01;
        }
        // BB/BC/BM/BBV: a proc barrage wants more rolls of the dice (a faster reload),
        // a timer barrage fires regardless of reload so only the hit's own size
        // matters and the ordinary damage-based score already rewards that.
        if (barrageTrigger === "proc" && GUN_TYPE_CODES.has((slot.type || [])[0]) && typeof item.reload === "number" && item.reload > 0) {
          score *= 1 / item.reload;
        }
        // CB: always a heavy-caliber main gun - the single rule the user called
        // "hyper important" for this hull, applied as a strong multiplier rather than
        // a hard filter so a CB with nothing 280mm+ reachable still gets her best gun.
        if (role === "cb" && (item.category === "CA Gun" || item.category === "CB Gun")) {
          const mm = equipCaliberMm(item);
          score *= mm != null && mm >= 280 ? 1.5 : 0.4;
        }
      } else {
        score = statPreferenceScore(item, weights, ship, slotKey, baseEhp);
        // Same proc/timer split, for the one auxiliary each rewards: Admiralty Fire
        // Control Table cuts the first volley's reload (more rolls for a proc),
        // Super Heavy Shell raises Main Gun Crit Rate (bigger single hits for a
        // timer). Neither is tracked as its own stat, so this is a direct name match
        // rather than something statPreferenceScore's weights could express.
        if (role === "bb" && barrageTrigger === "proc" && item.name === "Admiralty Fire Control Table") score += 1;
        if (role === "bb" && barrageTrigger === "timer" && item.name === "Super Heavy Shell") score += 1;
        if (isCarrierCatapult) score += 1;
      }
      if (!isWeapon && !isBbAntiAir && score <= 0) continue;
      const candidate = { item, isWeapon: isWeapon || isBbAntiAir, isNamed: named.has(item.name), score };
      if (betterCandidate(candidate, best)) best = candidate;
    }
    if (!best) continue;
    setEquippedGear(ship, slotKey, best.item);
    if (isAuxSlot && best.item.category === "Auxiliary") usedAuxNames.add(best.item.name);
    changed++;
  }
  return changed;
}

// Best-in-slot first: highest rarity, then highest headline stat within that rarity.
// Browsing order only - Optimize does NOT use this, see equipmentOptimizeScore above.
function sortEquipmentOptions(options) {
  return [...options].sort((a, b) => {
    const rarityDiff = EQUIPMENT_RARITY_ORDER.indexOf(b.rarity) - EQUIPMENT_RARITY_ORDER.indexOf(a.rarity);
    if (rarityDiff) return rarityDiff;
    const av = equipmentPrimaryStat(a)?.value ?? -Infinity;
    const bv = equipmentPrimaryStat(b)?.value ?? -Infinity;
    if (av !== bv) return bv - av;
    return a.name.localeCompare(b.name);
  });
}

const equippedGear = {};
function getEquippedGear(ship, slotKey) {
  return (equippedGear[ship.id] || {})[slotKey] || null;
}
function setEquippedGear(ship, slotKey, item) {
  if (!equippedGear[ship.id]) equippedGear[ship.id] = {};
  if (item) equippedGear[ship.id][slotKey] = item;
  else delete equippedGear[ship.id][slotKey];
}

function clearEquippedGear(ship) {
  delete equippedGear[ship.id];
}

// data/equipment.json spells Anti-Air "antiAir"; STAT_GRID spells it "antiair". Without
// this the 106 catalog entries carrying an AA bonus would contribute silently nothing.
// "oxygen" has no alias on purpose - the stat grid does not track Oxygen at all, so the
// 2 items carrying it are correctly ignored.
const EQUIPMENT_STAT_KEY_ALIASES = { antiAir: "antiair" };

// Flat stats from everything currently equipped on this ship. Mounts do not multiply it:
// an item's stat bonus applies once, mounts only decide how many shells leave the ship.
function equippedGearFlatStats(ship) {
  const totals = {};
  for (const item of Object.values(equippedGear[ship.id] || {})) {
    for (const [rawKey, amount] of Object.entries(item.statBonus || {})) {
      const key = EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey;
      if (!NUMERIC_STAT_KEYS.includes(key) || typeof amount !== "number") continue;
      totals[key] = (totals[key] || 0) + amount;
    }
  }
  return totals;
}

function buildEquipmentSlot(name, tooltip, meta, gearCtx) {
  const card = document.createElement("div");
  card.className = "equip-slot";

  const tile = document.createElement("div");
  tile.className = "equip-tile";
  card.appendChild(tile);

  function paintTile() {
    tile.innerHTML = "";
    tile.classList.remove("equip-tile-filled");
    tile.style.removeProperty("--equip-tile-color");
    const equipped = gearCtx ? getEquippedGear(gearCtx.ship, gearCtx.slotKey) : null;
    if (equipped) {
      tile.classList.add("equip-tile-filled");
      tile.style.setProperty("--equip-tile-color", equipmentRarityColor(equipped.rarity));
      tile.appendChild(equipmentIconImg(equipped, "equip-tile-icon"));
    } else {
      // A slot with a built-in weapon is not empty, so it says DEFAULT instead of showing
      // the "+" that invites a pick; the "+" is for the slots that really are bare.
      const builtIn = gearCtx ? defaultEquipmentForSlot(gearCtx.slot) : null;
      const mark = document.createElement("span");
      mark.className = builtIn ? "equip-tile-default" : "equip-tile-empty";
      mark.textContent = builtIn ? "DEFAULT" : "+";
      tile.appendChild(mark);
      // A genuinely empty slot has nothing for showEquipInfoTooltip to show (no item),
      // so it keeps the plain title naming what the slot accepts. A slot with a
      // built-in weapon does not need it repeated here - the rich tooltip covers it.
      tile.title = builtIn ? "" : tooltip;
    }
  }
  paintTile();

  if (gearCtx) {
    const currentTileItem = () => getEquippedGear(gearCtx.ship, gearCtx.slotKey) || defaultEquipmentForSlot(gearCtx.slot);
    tile.addEventListener("mouseenter", () => showEquipInfoTooltip(currentTileItem(), tile));
    tile.addEventListener("focus", () => showEquipInfoTooltip(currentTileItem(), tile));
    tile.addEventListener("mouseleave", hideEquipInfoTooltip);
    tile.addEventListener("blur", hideEquipInfoTooltip);
  }

  if (gearCtx && gearCtx.options.length) {
    tile.classList.add("equip-tile-pickable");
    tile.tabIndex = 0;
    tile.addEventListener("click", () => toggleEquipmentPicker(card, gearCtx, paintTile));
  }

  const label = document.createElement("span");
  label.className = "equip-slot-name";
  label.textContent = name;
  card.appendChild(label);

  const foot = document.createElement("div");
  foot.className = "equip-slot-meta";
  for (const entry of meta) {
    const chip = document.createElement("span");
    chip.textContent = entry.text;
    if (entry.title) chip.title = entry.title;
    foot.appendChild(chip);
  }
  card.appendChild(foot);
  return card;
}

function toggleEquipmentPicker(card, gearCtx, onPick) {
  let panel = card.querySelector(".equip-picker");
  if (!panel) {
    closeAllEquipmentPickers();
    panel = document.createElement("div");
    panel.className = "equip-picker";

    if (getEquippedGear(gearCtx.ship, gearCtx.slotKey)) {
      const clearRow = document.createElement("button");
      clearRow.type = "button";
      clearRow.className = "equip-picker-clear";
      clearRow.textContent = "Unequip";
      clearRow.addEventListener("click", () => {
        setEquippedGear(gearCtx.ship, gearCtx.slotKey, null);
        onPick();
        refreshStatsAfterGearChange();
        panel.remove();
        hideEquipInfoTooltip();
      });
      panel.appendChild(clearRow);
    }

    const caption = document.createElement("div");
    caption.className = "equip-picker-caption";
    caption.textContent = "";

    const list = document.createElement("div");
    list.className = "equip-picker-list";
    for (const item of sortEquipmentOptions(gearCtx.options)) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "equip-picker-item";
      cell.style.setProperty("--equip-tile-color", equipmentRarityColor(item.rarity));
      cell.appendChild(equipmentIconImg(item, "equip-picker-icon"));

      const describe = () => {
        caption.textContent = equipmentTooltip(item);
        showEquipInfoTooltip(item, cell);
      };
      cell.addEventListener("mouseenter", describe);
      cell.addEventListener("focus", describe);
      cell.addEventListener("mouseleave", hideEquipInfoTooltip);
      cell.addEventListener("blur", hideEquipInfoTooltip);

      cell.addEventListener("click", () => {
        setEquippedGear(gearCtx.ship, gearCtx.slotKey, item);
        onPick();
        refreshStatsAfterGearChange();
        panel.remove();
        hideEquipInfoTooltip();
      });
      list.appendChild(cell);
    }
    list.addEventListener("mouseleave", () => { caption.textContent = ""; hideEquipInfoTooltip(); });
    panel.appendChild(list);
    panel.appendChild(caption);
    card.appendChild(panel);
    clampPickerToSection(panel);
    return;
  }
  panel.remove();
}

// The panel is centred on its own 7rem card but is far wider, so opened from an
// edge slot it hangs outside the Equipment row and is clipped by .modal-info's
// overflow. A margin shift keeps the CSS centring as the default and corrects only
// the edge cases.
// The first measurement lands a few px short because the panel's own scrollbar has
// not settled yet, hence one correcting pass on the next frame. It ACCUMULATES onto
// the current margin instead of recomputing from zero, which is what makes the
// second pass a no-op once the panel is already inside.
function clampPickerToSection(panel) {
  const bounds = modalEquipment.getBoundingClientRect();
  const rect = panel.getBoundingClientRect();
  let shift = parseFloat(panel.style.marginLeft) || 0;
  if (rect.left < bounds.left) shift += bounds.left - rect.left;
  else if (rect.right > bounds.right) shift += bounds.right - rect.right;
  else return;
  panel.style.marginLeft = `${Math.round(shift)}px`;
  requestAnimationFrame(() => { if (panel.isConnected) clampPickerToSection(panel); });
}

// Equipping feeds computeEffectiveStats, so the grid is stale until it is rebuilt. Only
// the stats section needs it - the tile repaints itself, and nothing else reads gear.
function refreshStatsAfterGearChange() {
  if (!currentShip) return;
  renderModalStatsTable(currentShip, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
}

function closeAllEquipmentPickers() {
  document.querySelectorAll(".equip-picker").forEach(p => p.remove());
  hideEquipInfoTooltip();
}

document.addEventListener("click", event => {
  if (!event.target.closest(".equip-slot")) closeAllEquipmentPickers();
});

function syncEquipmentCapOptions() {
  if (modalEquipmentCap.options.length) return;
  for (const rarity of [...EQUIPMENT_RARITY_ORDER].reverse()) {
    const option = document.createElement("option");
    option.value = rarity;
    option.textContent = rarity;
    modalEquipmentCap.appendChild(option);
  }
  modalEquipmentCap.value = equipmentRarityCap;
}

modalEquipmentCap.addEventListener("change", () => {
  equipmentRarityCap = modalEquipmentCap.value;
});

modalEquipmentTarget.addEventListener("change", () => {
  equipmentTarget = modalEquipmentTarget.value;
});

function syncSourceToggle(button, on, source) {
  button.classList.toggle("active", on);
  button.setAttribute("aria-pressed", String(on));
  button.title = on
    ? `Optimize may use equipment obtainable only through ${source}. Click to leave it out.`
    : `Optimize leaves equipment obtainable only through ${source} out. Click to allow it.`;
}

function syncGearLabToggle() {
  syncSourceToggle(modalEquipmentGearLab, includeGearLab, "the Gear Lab");
}

function syncResearchToggle() {
  syncSourceToggle(modalEquipmentResearch, includeResearch, "Research");
}

modalEquipmentGearLab.addEventListener("click", () => {
  includeGearLab = !includeGearLab;
  syncGearLabToggle();
});

modalEquipmentResearch.addEventListener("click", () => {
  includeResearch = !includeResearch;
  syncResearchToggle();
});

syncGearLabToggle();
syncResearchToggle();

// Rebuilt per ship: the orientations offered depend on what her slots can actually hold.
// A goal that no longer applies falls back to Recommended rather than silently persisting.
function syncEquipmentTargetOptions(ship) {
  const available = availableOptimizeTargets(ship);
  modalEquipmentTarget.innerHTML = "";
  for (const id of available) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = OPTIMIZE_TARGETS[id].label;
    modalEquipmentTarget.appendChild(option);
  }
  if (!available.includes(equipmentTarget)) equipmentTarget = "auto";
  modalEquipmentTarget.value = equipmentTarget;
}

// Only this ship's picks: the map is keyed by ship, and clearing every ship would throw
// away work done while comparing two of them.
modalEquipmentClear.addEventListener("click", () => {
  if (!currentShip) return;
  closeAllEquipmentPickers();
  clearEquippedGear(currentShip);
  renderModalEquipment(currentShip);
  refreshStatsAfterGearChange();
});

modalEquipmentOptimize.addEventListener("click", () => {
  if (!currentShip) return;
  closeAllEquipmentPickers();
  // Weighting reads the ship's CURRENT stats, so "amplify her strongest" reflects
  // whatever is equipped and toggled right now, not her bare hull.
  const effective = computeEffectiveStats(currentShip, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
  if (effective) optimizeEquipment(currentShip, effective);
  renderModalEquipment(currentShip);
  refreshStatsAfterGearChange();
});

function renderModalEquipment(ship) {
  const slots = ship.equipment;
  const modules = ship.augmentModules || [];
  if (!slots && !modules.length) {
    modalEquipmentSection.hidden = true;
    return;
  }
  modalEquipmentSection.hidden = false;
  if (typeof EQUIPMENT_DATA === "undefined") {
    setEquipmentControlsDisabled(true);
    modalEquipment.textContent = "Loading equipment...";
    loadEquipmentData().then(() => {
      if (currentShip === ship && !modalOverlay.hidden) renderModalEquipment(ship);
    }).catch(() => {
      if (currentShip === ship && !modalOverlay.hidden) {
        modalEquipment.textContent = "Equipment data could not be loaded.";
      }
    });
    return;
  }

  setEquipmentControlsDisabled(false);
  syncEquipmentCapOptions();
  syncEquipmentTargetOptions(ship);
  modalEquipment.innerHTML = "";

  let gunSlotSeen = false;
  for (const key of Object.keys(slots || {}).sort((a, b) => a - b)) {
    const slot = slots[key];
    const codes = slot.type || [];
    let gunLabel = null;
    if (codes.some(c => GUN_TYPE_CODES.has(c))) {
      gunLabel = gunSlotSeen ? "Secondary" : "Main Gun";
      gunSlotSeen = true;
    }
    const name = equipmentSlotLabel(slot, gunLabel) || "Slot " + key;

    const types = equipmentSlotTypes(slot);
    const tooltip = [
      types.length ? "Accepts: " + types.join(", ") : "",
      slot.preload ? "Preload " + slot.preload : ""
    ].filter(Boolean).join(" \u2014 ");

    const meta = [];
    if (slot.mount) meta.push({ text: "Mounts \u00d7" + slot.mount });
    if (slot.efficiency) meta.push({ text: "Efficiency " + Math.round(slot.efficiency * 100) + "%" });
    const gearCtx = { ship, slotKey: key, slot, options: equipmentOptionsForSlot(slot, ship) };
    modalEquipment.appendChild(buildEquipmentSlot(name, tooltip, meta, gearCtx));
  }

  if (modules.length) {
    const fits = modules
      .map(module => UNIVERSAL_AUGMENT_MODULES.has(module) ? module : module + " (unique)")
      .join(", ");
    const augment = buildEquipmentSlot("Augment", "Fits: " + fits + " \u2014 requires max Limit Break", []);
    augment.classList.add("equip-augment");
    modalEquipment.appendChild(augment);
  }
}

const COMBAT_METRIC_FIELDS = [
  { key: "dps", label: "DPS", hint: "Surface damage per second from guns, torpedoes and aircraft." },
  { key: "ehp", label: "eHP", hint: "Effective HP: how much damage she absorbs once evasion is accounted for." },
  { key: "dpsASW", label: "DPS ASW", hint: "Anti-submarine damage per second." },
  { key: "dpsAA", label: "DPS AA", hint: "Anti-air damage per second." },
];

// The 27 ships imported from their own wiki pages have slots but no built-in weapon ids -
// the wiki's Gear table names what a slot accepts, never what it comes armed with - so
// their empty slots really do contribute nothing, unlike a datamined ship's.
function hasBuiltInWeapons(ship) {
  return Object.values(ship.equipment || {}).some(slot => slot.default);
}

// A hull with no innate launcher (every CA carrying an ASW slot) really does no anti-
// submarine damage until depth charges go in the slot, which reads as a missing figure
// unless the tooltip says why.
function hasAswSlot(ship) {
  return Object.values(ship.equipment || {}).some(slot => (slot.type || []).includes(14));
}

const COMBAT_METRIC_ROWS = 2;

// Two figures per row, each name in a column of its own with its value in the next one.
// The pairs are laid out column-first - DPS above eHP, DPS ASW above DPS AA - so the two
// surface figures share a column and the two specialised ones share the next, rather than
// the reading order splitting them across rows.
function renderCombatMetrics(ship, effective) {
  modalCombatMetrics.innerHTML = "";
  if (!ship.equipment || !effective) return;
  const metrics = computeCombatMetrics(ship, currentLevel, effective);
  const columns = Math.ceil(COMBAT_METRIC_FIELDS.length / COMBAT_METRIC_ROWS);
  for (let row = 0; row < COMBAT_METRIC_ROWS; row++) {
    for (let column = 0; column < columns; column++) {
      const field = COMBAT_METRIC_FIELDS[column * COMBAT_METRIC_ROWS + row];
      if (!field) continue;
      const value = metrics[field.key];

      const label = document.createElement("div");
      label.className = "combat-metric-label";
      label.textContent = field.label;

      // A figure a ship simply does not have is left blank rather than dashed. The cell
      // keeps its width, so the columns still line up, and its tooltip still explains why.
      const number = document.createElement("div");
      number.className = "combat-metric-value";
      number.textContent = value ? Math.round(value).toLocaleString("en-US") : "";

      const notes = [field.hint];
      if (field.key === "ehp") {
        notes.push(
          `Against a reference attacker: Accuracy ${EHP_REFERENCE_ACCURACY}, Luck ${EHP_REFERENCE_LUCK}, same level.`,
          `Hit rate ${(metrics.hitRate * 100).toFixed(1)}% -> ${Math.round(metrics.ehp).toLocaleString("en-US")} eHP from ${effective.stats.health.value} HP.`,
          "Comparative, not a figure the game shows: the wiki's formula needs the shooter's stats, which this app has no source for."
        );
      } else {
        notes.push(hasBuiltInWeapons(ship)
          ? "Empty slots count as the ship's built-in weapon."
          : "Her built-in weapons are not documented, so an empty weapon slot counts as nothing: equip something, or optimise.");
        if (metrics.unknownSlots) {
          notes.push(`${metrics.unknownSlots} slot(s) not counted: their built-in aircraft have no published damage.`);
        }
        if (field.key === "dps" && metrics.volleyBarrageDps) {
          notes.push(`Includes ${Math.round(metrics.volleyBarrageDps).toLocaleString("en-US")} DPS from her volley-triggered barrage, which fires off the main gun: a faster gun fires it more often.`);
        }
        if (field.key === "dpsASW") {
          if (metrics.innateDepthCharge) {
            notes.push("Includes the default depth charge launcher every DD and CL carries; equipped depth charges add to it.");
          } else if (!value && hasAswSlot(ship)) {
            notes.push("Her anti-submarine slot is empty and her hull carries no default launcher: equip depth charges, or optimise for Anti-Sub.");
          }
        }
      }
      label.title = number.title = notes.join("\n");
      modalCombatMetrics.appendChild(label);
      modalCombatMetrics.appendChild(number);
    }
  }
}

function renderModalStatsTable(ship, level, isRetrofit, isAugmented, isFateSim) {
  const base = computeStats(ship, level, isRetrofit);
  if (!base) {
    modalStatsSection.hidden = true;
    modalLevelControl.hidden = true;
    return;
  }
  modalLevelControl.hidden = false;
  modalStatsSection.hidden = false;

  const effective = computeEffectiveStats(ship, level, isRetrofit, isAugmented, isFateSim);
  modalStatsTable.innerHTML = "";
  modalCombatModifiers.innerHTML = "";

  buildStatsGrid(modalStatsTable, STAT_GRID, ship, level, base, effective);
  renderCombatMetrics(ship, effective);

  for (const modifier of effective.modifiers) {
    const pill = document.createElement("span");
    pill.className = "combat-modifier-pill";
    if (modifier.target) pill.classList.add("has-target");
    pill.title = modifier.sources.map(modifierSourceText).join("\n\n");

    const value = document.createElement("span");
    value.className = "combat-modifier-value";
    const sign = REDUCTION_MODIFIER_KEYS.has(modifier.key) ? "-" : "+";
    value.textContent = `${modifierLabel(modifier)} ${sign}${Math.round(modifier.amount * 100) / 100}%`;
    pill.appendChild(value);

    if (modifier.target) {
      const target = document.createElement("span");
      target.className = "combat-modifier-target";
      target.textContent = modifier.target;
      pill.appendChild(target);
    }

    modalCombatModifiers.appendChild(pill);
  }
}

// Skill text writes scaled values as "5% (15%)" - level 1 then max level. The gap
// pattern allows <b> tags between the two, because the wiki's own markup often
// opens or closes bold in the middle of the pair.
// keepTags re-emits whatever tags sat in a discarded gap, so dropping the unused
// half can never leave the surrounding bold unbalanced.
const LEVEL_PAIR_GAP = "(?:\\s|<\\/?b>)*";

const LEVEL_PAIR_NUMBER_RE = new RegExp(
  `([+-]?)(\\d+(?:\\.\\d+)?)(%|s)?(${LEVEL_PAIR_GAP})\\((${LEVEL_PAIR_GAP})([+-]?)(\\d+(?:\\.\\d+)?)(%|s)?(${LEVEL_PAIR_GAP})\\)`,
  "g"
);

const LEVEL_PAIR_LV_RE = new RegExp(
  `(Lv\\.\\s?\\d+)(${LEVEL_PAIR_GAP})\\((${LEVEL_PAIR_GAP})(Lv\\.\\s?\\d+)(${LEVEL_PAIR_GAP})\\)`,
  "g"
);

const LEVEL_PAIR_TIER_RE = new RegExp(
  `(I|Ⅰ)(${LEVEL_PAIR_GAP})\\((${LEVEL_PAIR_GAP})(II|Ⅱ)(${LEVEL_PAIR_GAP})\\)`,
  "g"
);
const LEVEL_PAIR_TIER_REVERSED_RE = new RegExp(
  `\\((${LEVEL_PAIR_GAP})(I|Ⅰ)(${LEVEL_PAIR_GAP})\\)(${LEVEL_PAIR_GAP})(II|Ⅱ)`,
  "g"
);

function keepTags(text) {
  return (text.match(/<\/?b>/g) || []).join("");
}

function renderLevelValues(html, atMaxLevel) {
  return html
    .replace(LEVEL_PAIR_NUMBER_RE, (full, baseSign, baseValue, baseUnit, gap1, gap2, maxSign, maxValue, maxUnit, gap3) => {
      if ((baseUnit || "") !== (maxUnit || "") || baseSign !== maxSign) return full;
      const kept = atMaxLevel ? maxSign + maxValue + (maxUnit || "") : baseSign + baseValue + (baseUnit || "");
      return kept + keepTags(gap1) + keepTags(gap2) + keepTags(gap3);
    })
    .replace(LEVEL_PAIR_LV_RE, (full, baseLevel, gap1, gap2, maxLevel, gap3) =>
      (atMaxLevel ? maxLevel : baseLevel) + keepTags(gap1) + keepTags(gap2) + keepTags(gap3))
    .replace(LEVEL_PAIR_TIER_RE, (full, baseTier, gap1, gap2, maxTier, gap3) =>
      (atMaxLevel ? maxTier : baseTier) + keepTags(gap1) + keepTags(gap2) + keepTags(gap3))
    .replace(LEVEL_PAIR_TIER_REVERSED_RE, (full, gap1, baseTier, gap2, gap3, maxTier) =>
      keepTags(gap1) + keepTags(gap2) + keepTags(gap3) + (atMaxLevel ? maxTier : baseTier));
}

// Splits only at depth 0, so a separator inside parentheses is ignored - without
// this, "5% (15%, up to 3 times)" would split on the comma inside the aside.
function topLevelMatches(text, separator) {
  const found = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      separator.lastIndex = i;
      const match = separator.exec(text);
      if (match && match.index === i) {
        found.push({ start: i, end: separator.lastIndex });
        i = separator.lastIndex - 1;
      }
    }
  }
  return found;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let last = 0;
  for (const { start, end } of topLevelMatches(text, separator)) {
    parts.push(text.slice(last, start));
    last = end;
  }
  parts.push(text.slice(last));
  return parts.filter(part => part.trim());
}

// The lookbehind keeps "Lv.1", "No.3" and single-initial abbreviations from being
// read as sentence ends.
// ENUMERATION_SEPARATOR handles the "1) ... 2) ..." lists a few skills use; it has
// to tolerate <b> tags around the digit because the wiki bolds those markers
// inconsistently (Juneau's "Martyr+" is the messiest case).
const SENTENCE_SEPARATOR = /(?<!\bLv|\bNo|\b[A-Z])\.(?:\s+(?=[A-Z0-9"“(])|(?=[A-Z[]))/gy;
const SEMICOLON_SEPARATOR = /;\s*/gy;
const CLAUSE_SEPARATOR = /,\s+/gy;

const ENUMERATION_SEPARATOR = new RegExp(
  `(?:^|(?<=[\\s>;:]))${LEVEL_PAIR_GAP}\\d\\)${LEVEL_PAIR_GAP}:?(?:\\s|<\\/?b>)+`,
  "gy"
);

const SUBORDINATE_CLAUSE_RE = /^(?:and |or |but |then )?(?:when(?:ever)?\b|while\b|during\b|if\b|once\b|after\b|before\b|upon\b|every\b|each time\b|the first time\b|at the (?:start|beginning|end)\b|for (?:every|each)\b|as long as\b)/i;

// "All Out Assault II:" is an attack's NAME followed by a colon, not a condition
// introducing an effect list, so it must not become a clause header.
const ATTACK_NAME_COLON_RE = /all[- ]?out assault\s*(?:i{1,3}|Ⅰ|Ⅱ)?\s*(?:\([^)]*\))?\s*$/i;

function lastConditionColon(text) {
  let depth = 0;
  let found = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === ":" && depth === 0 && !ATTACK_NAME_COLON_RE.test(text.slice(0, i))) found = i;
  }
  return found;
}

function leadingConditionClauses(text) {
  const clauses = splitTopLevel(text, CLAUSE_SEPARATOR);
  let count = 0;
  while (count < clauses.length && SUBORDINATE_CLAUSE_RE.test(clauses[count].trim())) count++;
  return { count, clauses };
}

function buildClauseBlock(sentence) {
  const colon = lastConditionColon(sentence);
  if (colon > -1) {
    const header = sentence.slice(0, colon + 1).trim();
    const items = splitTopLevel(sentence.slice(colon + 1), SEMICOLON_SEPARATOR);
    if (items.length && (items.length >= 2 || leadingConditionClauses(header).count >= 2)) {
      return { header, items };
    }
    return { text: sentence };
  }

  const { count, clauses } = leadingConditionClauses(sentence);
  if (count >= 2 && count < clauses.length) {
    return { header: clauses.slice(0, count).join(", ") + ",", items: [clauses.slice(count).join(", ")] };
  }
  return { text: sentence };
}

function governsSegmentList(segments) {
  const withColon = segments.filter(segment => lastConditionColon(segment) > -1).length;
  return withColon === 1 && lastConditionColon(segments[0]) > -1;
}

function startSentence(html) {
  return html.replace(/^((?:<[^>]*>|\s)*)([a-z])/, (full, prefix, letter) => prefix + letter.toUpperCase());
}

function firstTopLevelBoundary(text) {
  let earliest = null;
  for (const separator of [SENTENCE_SEPARATOR, SEMICOLON_SEPARATOR]) {
    const match = topLevelMatches(text, separator)[0];
    if (match && (!earliest || match.start < earliest.start)) earliest = match;
  }
  return earliest;
}

function buildSkillBlocks(html) {
  const marks = topLevelMatches(html, ENUMERATION_SEPARATOR);
  if (marks.length < 2) return buildSentenceBlocks(html);

  const spans = marks.map((mark, i) =>
    html.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : html.length));

  let tail = "";
  const siblingsSpanSentences = spans.slice(0, -1)
    .some(span => topLevelMatches(span, SENTENCE_SEPARATOR).length > 0);
  if (!siblingsSpanSentences) {
    const last = spans[spans.length - 1];
    const cut = firstTopLevelBoundary(last);
    if (cut) {
      const endedSentence = last[cut.start] === ".";
      spans[spans.length - 1] = last.slice(0, cut.start) + (endedSentence ? "." : "");
      tail = last.slice(cut.end);
    }
  }

  const blocks = buildSentenceBlocks(html.slice(0, marks[0].start));
  const caption = blocks.length && blocks[blocks.length - 1].text ? blocks.pop().text : null;
  blocks.push({ header: caption, list: spans.map(span => buildSentenceBlocks(span.replace(/[;\s]+$/, ""))) });
  if (tail.trim()) blocks.push(...buildSentenceBlocks(tail));
  return blocks;
}

function buildSentenceBlocks(html) {
  const blocks = [];
  const rawSentences = splitTopLevel(html, SENTENCE_SEPARATOR);
  for (let i = 0; i < rawSentences.length; i++) {
    const sentence = rawSentences[i].trim() + (i < rawSentences.length - 1 ? "." : "");

    const segments = splitTopLevel(sentence, SEMICOLON_SEPARATOR);
    if (segments.length >= 2 && !governsSegmentList(segments)) {
      for (let s = 0; s < segments.length; s++) {
        const promoted = segments[s].trim() + (s < segments.length - 1 ? "." : "");
        blocks.push(buildClauseBlock(s === 0 ? promoted : startSentence(promoted)));
      }
      continue;
    }
    blocks.push(buildClauseBlock(sentence));
  }
  return mergeUlrichProsaicListSentence(blocks);
}

// One skill writes a colon-introduced effect list as separate sentences instead of
// semicolon-separated clauses, so its second item loses its bullet.
// A general "a subjectless sentence continues the previous list" rule was tried and
// REJECTED against the whole dataset: even narrowed hard it still matched 65
// candidates, mostly ordinary independent statements that merely open with a bare
// imperative verb, and the tightest version wrongly merged Vanguard's "Scatter,
// Minions of Darkness!", whose next sentence opens its own distinct condition.
// Keyed on the header string rather than a ship name, since no other skill can
// carry that sentence verbatim. If another skill shows the same shape, verify it
// the same way and add another narrow merge - do not generalise this.
const ULRICH_PROSAIC_HEADER = "As long as this ship is afloat, whenever ANOTHER fleet engages in one of its first five battles this sortie:";
function mergeUlrichProsaicListSentence(blocks) {
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].header === ULRICH_PROSAIC_HEADER && blocks[i + 1].text) {
      blocks[i].items.push(blocks[i + 1].text);
      blocks.splice(i + 1, 1);
      break;
    }
  }
  return blocks;
}

// Mode tags are stripped before mechanic detection so the bracket cue cannot
// capture "[Operation Siren]", which has its own colour.
const SKILL_MODE_TAG_RE = /(?:<\/?b>|\s)*\[(Regular play|Regular|Operation Siren only|Operation Siren|Exercise only|Non-Exercise Only)\](?:<\/?b>|\s)*/gi;
const SENTENCE_END_RE = /[.!?][)\]"”]*$/;

function skillModeColor(label) {
  return /Operation Siren/i.test(label) ? OPERATION_SIREN_TAG_COLOR : "var(--text-muted)";
}

// Cues for names a skill coins for itself ("Berserk Mode", "Frostshred"). These are
// loose by design, so namedMechanics filters what they catch.
const MECHANIC_CUE_RES = [
  /\benters?\s+((?:[A-Z][\w'’-]*\s+){0,2}[A-Z][\w'’-]*\s+Mode)\b/g,
  /\b(?:gains?|receives?)\s+(?:the\s+)?((?:[A-Z][\w'’-]*\s+){0,3}[A-Z][\w'’-]*)\s+status\b/g,
  /\bgrants?\s+[^.:;]{0,45}?the\s+((?:[A-Z][\w'’-]*\s+){0,3}[A-Z][\w'’-]*)\s+status\b/g,
  /\bapplies\s+(?:the\s+)?((?:[A-Z][\w'’-]*\s+){0,3}[A-Z][\w'’-]*)\s+(?:status|debuff|ailment)\b/g,
  /\binflicts\s+((?:[A-Z][\w'’-]*\s+){0,2}[A-Z][\w'’-]*)\b/g,
  /\[([A-Z][^\]]{2,30})\]/g,
];

function blockPlainText(block) {
  const text = block.text || block.header || "";
  const rest = block.list
    ? block.list.map(item => item.map(blockPlainText).join(" "))
    : (block.items || []);
  return (text + " " + rest.join(" ")).replace(/<[^>]*>/g, "");
}

function mechanicNames(text) {
  const names = new Set();
  for (const cue of MECHANIC_CUE_RES) {
    cue.lastIndex = 0;
    let match;
    while ((match = cue.exec(text))) names.add(match[1].trim());
  }
  return [...names];
}

// The only two things the cues pick up that are not names: "Lv" (from Alsace's
// "inflicts Lv.1 Holy Judgment" - note the real mechanic there is what the cue
// MISSES) and "DMG" (Little Prinz Eugen's "inflicts DMG up to 6 times"). Named
// outright rather than filtered by a minimum length, which would be arbitrary in
// both directions.
// The >= 2 use test is the "qui reviennent" rule: a name must actually recur in the
// skill to be worth colouring, and it is cheap protection against a loose cue.
const NAMED_MECHANIC_STOPLIST = new Set(["lv", "dmg"]);

function namedMechanics(html) {
  SKILL_MODE_TAG_RE.lastIndex = 0;
  const text = html.replace(SKILL_MODE_TAG_RE, " ").replace(/<[^>]*>/g, "");
  return mechanicNames(text).filter(name => {
    const lower = name.toLowerCase();
    if (NAMED_MECHANIC_STOPLIST.has(lower) || KEYWORD_INFO.has(lower)) return false;
    const uses = text.match(new RegExp("\\b" + escapeRegExp(name) + "\\b", "gi"));
    return uses && uses.length >= 2;
  });
}

function introducesMechanic(text, name) {
  for (const cue of MECHANIC_CUE_RES) {
    cue.lastIndex = 0;
    let match;
    while ((match = cue.exec(text))) if (match[1].trim() === name) return true;
  }
  return new RegExp("\\b(?:gives?|grants?|applies|inflicts?|bestows?)\\b[^.]{0,60}?\\b" +
    escapeRegExp(name) + "\\b", "i").test(text);
}

function endsMechanic(text, name) {
  return new RegExp("\\b" + escapeRegExp(name) +
    "\\b[^.]{0,24}?\\b(?:ends?|expires?|is (?:removed|over)|wears off)\\b", "i").test(text);
}

function findMechanicRun(blocks) {
  const texts = blocks.map(blockPlainText);
  const names = mechanicNames(texts.join(" "));
  const runs = [];
  for (const name of names) {
    const pattern = new RegExp("\\b" + escapeRegExp(name) + "\\b");
    const flags = texts.map(text => pattern.test(text));
    const first = flags.indexOf(true);
    const last = flags.lastIndexOf(true);
    if (first === -1 || first === last) continue;
    if (!flags.slice(first, last + 1).every(Boolean)) continue;
    if (first === 0 && last === blocks.length - 1) continue;
    runs.push({ name, first, last });
  }
  if (runs.length !== 1) return null;
  const run = runs[0];
  const inside = texts.slice(run.first, run.last + 1).join(" ");
  const competing = names.some(name => name !== run.name &&
    new RegExp("\\b" + escapeRegExp(name) + "\\b").test(inside));
  if (competing) return null;
  let { first, last } = run;
  if (introducesMechanic(texts[first], run.name)) first++;
  if (last > first && endsMechanic(texts[last], run.name)) last--;
  return first <= last ? { name: run.name, first, last } : null;
}

function withMechanicSection(blocks) {
  const run = blocks.length >= 3 ? findMechanicRun(blocks) : null;
  if (!run) return [{ mode: null, blocks }];
  const sections = [];
  if (run.first > 0) sections.push({ mode: null, blocks: blocks.slice(0, run.first) });
  sections.push({ mechanic: run.name, blocks: blocks.slice(run.first, run.last + 1) });
  if (run.last < blocks.length - 1) sections.push({ mode: null, blocks: blocks.slice(run.last + 1) });
  return sections;
}

function buildSkillSections(html) {
  const marks = [];
  SKILL_MODE_TAG_RE.lastIndex = 0;
  let match;
  while ((match = SKILL_MODE_TAG_RE.exec(html))) {
    const before = html.slice(0, match.index).replace(/(?:<\/?b>|\s)+$/, "");
    if (before === "" || SENTENCE_END_RE.test(before)) {
      marks.push({ start: match.index, end: SKILL_MODE_TAG_RE.lastIndex, label: match[1] });
    }
  }
  if (!marks.length) return withMechanicSection(buildSkillBlocks(html));

  const sections = [];
  const lead = html.slice(0, marks[0].start).trim();
  if (lead) {
    const impliesRegular = /Operation Siren/i.test(marks[0].label);
    sections.push({ mode: impliesRegular ? "Regular" : null, blocks: buildSkillBlocks(lead) });
  }
  for (let i = 0; i < marks.length; i++) {
    const body = html.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : html.length).trim();
    if (body) sections.push({ mode: marks[i].label, blocks: buildSkillBlocks(body) });
  }
  return sections;
}

// Blocks are cut out of a larger description, so a fragment can open or close bold
// without its partner. Re-balancing per fragment keeps one skill's stray tag from
// bleeding into the rest of the modal.
function balanceBoldTags(html) {
  const unclosed = (html.match(/<b>/g) || []).length - (html.match(/<\/b>/g) || []).length;
  if (unclosed > 0) return html + "</b>".repeat(unclosed);
  if (unclosed < 0) return "<b>".repeat(-unclosed) + html;
  return html;
}

function appendSkillBlocks(container, blocks) {
  for (const block of blocks) {
    if (block.text) {
      const line = document.createElement("p");
      line.className = "skill-line";
      line.innerHTML = balanceBoldTags(block.text);
      container.appendChild(line);
      continue;
    }
    if (block.header) {
      const condition = document.createElement("p");
      condition.className = "skill-condition";
      condition.innerHTML = balanceBoldTags(block.header);
      container.appendChild(condition);
    }
    const actions = document.createElement("ul");
    actions.className = "skill-actions";
    for (const item of block.items || block.list) {
      const action = document.createElement("li");
      if (block.list) {
        action.className = "skill-actions-blocks";
        appendSkillBlocks(action, item);
      } else {
        action.innerHTML = balanceBoldTags(item.trim());
      }
      actions.appendChild(action);
    }
    container.appendChild(actions);
  }
}

// Some source descriptions bold every word individually ("<b>Increases</b>
// <b>this</b> <b>ship's</b> <b>SPD</b>"), almost certainly the wiki's auto-linker
// surviving a tag strip. 21 skills carry such a run; Belfast's "Smokescreen:
// Belfast" is the worst at 60 words. Every sampled case is noise, not emphasis -
// Colorado's "Big Seven" even bolds a stray "(gif)" marker.
// Requiring 2+ CONSECUTIVE single-token tags is what makes this safe: one <b>
// around a real phrase contains a space, so it can never match, and an isolated
// single-word tag with plain text on both sides survives too. No per-skill
// denylist is needed.
const LONE_BOLD_TOKEN_RUN_RE = /(?:<b>[^\s<>]+<\/b>\s*){2,}/g;
function stripAccidentalWordBoldRuns(html) {
  return html.replace(LONE_BOLD_TOKEN_RUN_RE, run => run.replace(/<\/?b>/g, ""));
}

function appendSkillDescription(container, html) {
  html = stripAccidentalWordBoldRuns(html);
  container.innerHTML = "";
  for (const section of buildSkillSections(html)) {
    const name = section.mode || section.mechanic;
    if (!name) {
      appendSkillBlocks(container, section.blocks);
      continue;
    }
    const label = document.createElement("p");
    label.className = "skill-mode";
    label.textContent = name;
    const group = document.createElement("div");
    group.className = "skill-mode-group";
    for (const element of [label, group]) {
      element.style.setProperty("--mode-color", section.mechanic ? "var(--accent)" : skillModeColor(name));
      container.appendChild(element);
    }
    appendSkillBlocks(group, section.blocks);
  }
}

function getSkillsForState(ship, isRetrofit, isAugmented, isFateSim) {
  const skills = ship.skills || [];
  return skills.filter((s, i) => {
    if (s.marker === "R") return isRetrofit;
    if (s.isModified && !s.isRetrofitVersion && isRetrofit) return false;
    if (s.marker === "Aug") return isAugmented;
    if (s.marker === "FS") return isFateSim;
    const next = skills[i + 1];
    if (isAugmented && next && next.marker === "Aug") return false;
    if (isFateSim && next && next.marker === "FS") return false;
    return true;
  });
}

let skillsAtMaxLevel = true;
let skillMaxLevelToggles = [];
// Per-skill override so toggling one skill's Max Level button (leaving others alone)
// also moves that skill's own contribution to the stats grid and combat-modifier
// pills - computeEffectiveStats reads this, not just the header's skillsAtMaxLevel.
// Keyed by the skill object itself (stable across a modal's re-renders), not a
// string, so no per-ship bookkeeping is needed and nothing to clear on ship switch.
const skillLevelState = new WeakMap();
function isSkillAtMaxLevel(skill) {
  return skillLevelState.has(skill) ? skillLevelState.get(skill) : skillsAtMaxLevel;
}

function createMaxLevelToggle() {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "max-level-toggle";
  const dot = document.createElement("span");
  dot.className = "max-level-dot";
  toggle.appendChild(dot);
  toggle.appendChild(document.createTextNode("Max Level"));
  return toggle;
}

function isMaxLevelToggleOn(toggle) {
  return toggle.getAttribute("aria-pressed") === "true";
}

function setMaxLevelToggle(toggle, isOn) {
  toggle.setAttribute("aria-pressed", String(isOn));
  toggle.classList.toggle("active", isOn);
}

function syncSkillsMaxLevelToggle() {
  modalSkillsMaxToggle.hidden = skillMaxLevelToggles.length === 0;
  if (modalSkillsMaxToggle.hidden) return;
  skillsAtMaxLevel = skillMaxLevelToggles.every(({ toggle }) => isMaxLevelToggleOn(toggle));
  setMaxLevelToggle(modalSkillsMaxToggle, skillsAtMaxLevel);
}

modalSkillsMaxToggle.addEventListener("click", () => {
  skillsAtMaxLevel = !isMaxLevelToggleOn(modalSkillsMaxToggle);
  setMaxLevelToggle(modalSkillsMaxToggle, skillsAtMaxLevel);
  for (const { toggle, paintDescription, skill } of skillMaxLevelToggles) {
    setMaxLevelToggle(toggle, skillsAtMaxLevel);
    paintDescription(skillsAtMaxLevel);
    skillLevelState.set(skill, skillsAtMaxLevel);
  }
  renderModalStatsTable(currentShip, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
});

let interactionAtMaxLevel = false;
// Interaction paginates, so at most one page of toggles is ever in the DOM and a
// persistent array like the Skills tab's would go stale on every page flip.
// Instead nothing is kept: the sync queries the live DOM each time, and each
// toggle's paint function hangs off a WeakMap keyed on the toggle element, pruned
// by GC when its page is replaced.
const interactionMaxLevelPaint = new WeakMap();

function syncInteractionMaxLevelToggle() {
  const toggles = [...modalInteractionList.querySelectorAll(".max-level-toggle")];
  modalInteractionMaxToggle.hidden = toggles.length === 0;
  if (modalInteractionMaxToggle.hidden) return;
  interactionAtMaxLevel = toggles.every(t => isMaxLevelToggleOn(t));
  setMaxLevelToggle(modalInteractionMaxToggle, interactionAtMaxLevel);
}

modalInteractionMaxToggle.addEventListener("click", () => {
  interactionAtMaxLevel = !isMaxLevelToggleOn(modalInteractionMaxToggle);
  setMaxLevelToggle(modalInteractionMaxToggle, interactionAtMaxLevel);
  for (const toggle of modalInteractionList.querySelectorAll(".max-level-toggle")) {
    setMaxLevelToggle(toggle, interactionAtMaxLevel);
    const paint = interactionMaxLevelPaint.get(toggle);
    if (paint) paint(interactionAtMaxLevel);
  }
});

function renderModalSkills(ship, isRetrofit, isAugmented, isFateSim) {
  const skills = getSkillsForState(ship, isRetrofit, isAugmented, isFateSim);
  skillMaxLevelToggles = [];
  if (skills.length === 0) {
    modalSkillsSection.hidden = true;
    return;
  }
  modalSkillsSection.hidden = false;
  modalSkillsList.innerHTML = "";

  for (const skill of skills) {
    const item = document.createElement("div");
    item.className = `skill-item skill-${skill.type || "other"}`;

    if (isRetrofit && ((skill.isModified && skill.isRetrofitVersion) || skill.isNewOnRetrofit)) {
      item.classList.add("skill-changed");
      const rarity = ship.retrofitRarity || ship.rarity;
      item.style.setProperty("--skill-changed-color", `var(--${RARITY_CLASS[rarity] || "rarity-normal"})`);
    } else if (isAugmented && skill.marker === "Aug") {
      item.classList.add("skill-changed");
      item.style.setProperty("--skill-changed-color", "var(--gold)");
    } else if (isFateSim && skill.marker === "FS") {
      item.classList.add("skill-changed");
      item.style.setProperty("--skill-changed-color", "var(--rarity-elite)");
    }

    if (skill.icon) {
      const icon = document.createElement("img");
      icon.className = "skill-icon";
      icon.src = skill.icon;
      icon.alt = "";
      icon.loading = "lazy";
      item.appendChild(icon);
    }

    const body = document.createElement("div");
    body.className = "skill-body";

    const head = document.createElement("div");
    head.className = "skill-head";
    const name = document.createElement("span");
    name.className = "skill-name";
    name.textContent = skill.name;
    head.appendChild(name);
    if (skill.type && SKILL_TYPE_LABELS[skill.type]) {
      const typeTag = document.createElement("span");
      typeTag.className = `skill-type-tag skill-type-${skill.type}`;
      typeTag.textContent = SKILL_TYPE_LABELS[skill.type];
      head.appendChild(typeTag);
    }
    if (skill.marker === "Aug") {
      const augTag = document.createElement("span");
      augTag.className = "skill-type-tag skill-type-aug";
      augTag.title = "Unique Augment — a separate upgrade system, independent of retrofit";
      augTag.textContent = "Unique Augment";
      head.appendChild(augTag);
    }
    if (skill.marker === "FS") {
      const fsTag = document.createElement("span");
      fsTag.className = "skill-type-tag skill-type-aug";
      fsTag.title = "Fate Simulation — a Research ship upgrade system, independent of retrofit";
      fsTag.textContent = "Fate Simulation";
      head.appendChild(fsTag);
    }
    body.appendChild(head);

    if (skill.description) {
      const desc = document.createElement("div");
      desc.className = "skill-desc";
      const atBase = renderLevelValues(skill.description, false);
      const atMax = renderLevelValues(skill.description, true);
      const mechanics = namedMechanics(atBase);

      const paintDescription = (atMaxLevel) => {
        appendSkillDescription(desc, atMaxLevel ? atMax : atBase);
        highlightKeywords(desc, mechanics);
      };

      if (atBase !== atMax) {
        const maxToggle = createMaxLevelToggle();
        maxToggle.title = "Show this skill's values (and its contribution to Stats) at max skill level (Lv.10)";
        maxToggle.addEventListener("click", () => {
          const isOn = maxToggle.getAttribute("aria-pressed") !== "true";
          setMaxLevelToggle(maxToggle, isOn);
          paintDescription(isOn);
          skillLevelState.set(skill, isOn);
          syncSkillsMaxLevelToggle();
          renderModalStatsTable(currentShip, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
        });
        setMaxLevelToggle(maxToggle, skillsAtMaxLevel);
        skillLevelState.set(skill, skillsAtMaxLevel);
        head.appendChild(maxToggle);
        skillMaxLevelToggles.push({ toggle: maxToggle, paintDescription, skill });
      }

      paintDescription(skillsAtMaxLevel);
      body.appendChild(desc);
    }

    item.appendChild(body);
    modalSkillsList.appendChild(item);
  }

  syncSkillsMaxLevelToggle();
}

function showGifPreview(path) {
  gifPreview.src = path;
  gifPreview.hidden = false;

  const rect = modalImageCol.getBoundingClientRect();
  const margin = 14;
  const left = rect.left + margin;
  const maxWidth = rect.width - margin * 2;

  gifPreview.style.left = `${left}px`;
  gifPreview.style.top = "";
  gifPreview.style.bottom = `${window.innerHeight - rect.bottom + margin}px`;
  gifPreview.style.width = `${maxWidth}px`;
}

function hideGifPreview() {
  gifPreview.hidden = true;
}

// Icon, name, rarity and every numeric figure the item carries, plus its Notes (when
// it has one) run through the same rendering pipeline as skill text - bullets,
// condition/action grouping, keyword colors - rather than a plain title attribute,
// which cannot carry any of that. The border is tinted to the item's own rarity color,
// the same --equip-tile-color convention the tile and picker cell already use.
function showEquipInfoTooltip(item, anchorEl) {
  if (!item) return;
  equipInfoTooltip.style.setProperty("--equip-tile-color", equipmentRarityColor(item.rarity));

  equipInfoIconWrap.innerHTML = "";
  equipInfoIconWrap.appendChild(equipmentIconImg(item, "equip-info-icon-img"));
  equipInfoName.textContent = item.name;
  equipInfoRarity.textContent = item.rarity || "Built-in";

  equipInfoStats.innerHTML = "";
  for (const row of equipmentStatRows(item)) {
    const el = document.createElement("span");
    el.className = "equip-info-stat";
    if (row.icon) {
      const icon = document.createElement("img");
      icon.className = "equip-info-stat-icon";
      icon.src = row.icon;
      icon.alt = "";
      el.appendChild(icon);
    }
    el.appendChild(document.createTextNode(`${row.label} ${row.value}`));
    equipInfoStats.appendChild(el);
  }

  equipInfoNotes.hidden = !item.notes;
  if (item.notes) {
    appendSkillDescription(equipInfoNotes, item.notes);
    highlightKeywords(equipInfoNotes, namedMechanics(item.notes));
  }

  equipInfoTooltip.hidden = false;

  const rect = anchorEl.getBoundingClientRect();
  const margin = 10;
  equipInfoTooltip.style.left = "0px";
  equipInfoTooltip.style.top = "0px";
  const tw = equipInfoTooltip.offsetWidth;
  const th = equipInfoTooltip.offsetHeight;
  let left = rect.right + margin;
  if (left + tw > window.innerWidth - margin) left = rect.left - tw - margin;
  left = Math.max(margin, left);
  let top = rect.top;
  if (top + th > window.innerHeight - margin) top = window.innerHeight - th - margin;
  top = Math.max(margin, top);
  equipInfoTooltip.style.left = `${left}px`;
  equipInfoTooltip.style.top = `${top}px`;
}

function hideEquipInfoTooltip() {
  equipInfoTooltip.hidden = true;
}

// A barrage row names its skill inconsistently (extra suffixes, hyphen and spacing
// differences), so it is matched by longest normalised prefix rather than equality.
// Longest wins because several skills share a prefix.
function matchSkillForBarrage(ship, barrageSkillName) {
  const skills = ship.skills || [];
  const norm = t => t.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const rowNorm = norm(barrageSkillName);
  let best = null;
  for (const sk of skills) {
    if (rowNorm.startsWith(norm(sk.name))) {
      if (!best || sk.name.length > best.name.length) best = sk;
    }
  }
  return best;
}

function getBarragesForState(ship, isRetrofit, isAugmented, isFateSim, level) {
  const skills = ship.skills || [];
  const rows = level == null ? (ship.barrages || []) : barragesAtLevel(ship, ship.barrages || [], level);
  return rows.filter(b => {
    const matched = matchSkillForBarrage(ship, b.skillName);
    if (!matched) return true;
    if (matched.marker === "R") return isRetrofit;
    if (matched.marker === "Aug") return isAugmented;
    if (matched.marker === "FS") return isFateSim;
    if (matched.isModified && !matched.isRetrofitVersion && isRetrofit) return false;
    const idx = skills.indexOf(matched);
    const next = skills[idx + 1];
    if (isAugmented && next && next.marker === "Aug") return false;
    if (isFateSim && next && next.marker === "FS") return false;
    return true;
  });
}

function renderModalBarrages(ship, isRetrofit, isAugmented, isFateSim, level) {
  const barrages = getBarragesForState(ship, isRetrofit, isAugmented, isFateSim, level);
  if (barrages.length === 0) {
    modalBarragesSection.hidden = true;
    return;
  }
  modalBarragesSection.hidden = false;
  modalBarragesList.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "barrage-table-wrap";
  const table = document.createElement("table");
  table.className = "barrage-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr>" +
    ["GIF", "Skill Name", "Stat Scaling", "Ammo Type", "Base DMG", "Count", "Light DMG", "Medium DMG", "Heavy DMG", "Notes", "Effect"]
      .map(h => `<th>${h}</th>`).join("") +
    "</tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const cell = (text, className, clampClass) => {
    const td = document.createElement("td");
    if (className) td.className = className;
    const content = (text === null || text === undefined || text === "") ? "" : text;
    if (clampClass) {
      const span = document.createElement("span");
      span.className = clampClass;
      span.textContent = content;
      td.appendChild(span);
    } else {
      td.textContent = content;
    }
    return td;
  };

  const shownGifIds = new Set();

  for (const b of barrages) {
    const tr = document.createElement("tr");

    const gifTd = document.createElement("td");
    gifTd.className = "barrage-gif-cell";
    const gifWrap = document.createElement("div");
    gifWrap.className = "barrage-gif-wrap";
    const newGifs = (b.gifs || []).filter(g => !shownGifIds.has(g.id));
    newGifs.forEach(g => {
      shownGifIds.add(g.id);
      const img = document.createElement("img");
      img.className = "barrage-gif";
      img.src = "assets/gif-icon.png";
      img.alt = g.label;
      img.loading = "lazy";
      img.addEventListener("mouseenter", () => showGifPreview(g.path));
      img.addEventListener("mouseleave", hideGifPreview);
      gifWrap.appendChild(img);
    });
    gifTd.appendChild(gifWrap);
    tr.appendChild(gifTd);

    const nameTd = cell(b.skillName, "barrage-name-cell", "barrage-name-clamp");
    if (b.trigger) {
      const triggerEl = document.createElement("span");
      triggerEl.className = "barrage-trigger";
      triggerEl.textContent = b.trigger;
      if (isEnhancedBarrageRow(b)) {
        triggerEl.title = `Replaces the plain version from level ${barrageEnhancedLevel(ship)}, when the limit break that upgrades this barrage lands.`;
      }
      nameTd.appendChild(triggerEl);
    }
    tr.appendChild(nameTd);

    tr.appendChild(cell(b.statScaling && b.statScaling.raw));
    tr.appendChild(cell([b.ammoType, b.armorModifiers].filter(Boolean).join(" · ")));
    tr.appendChild(cell(b.baseDmg));
    tr.appendChild(cell(b.count));
    tr.appendChild(cell(b.lightDmg));
    tr.appendChild(cell(b.mediumDmg));
    tr.appendChild(cell(b.heavyDmg));
    tr.appendChild(cell(b.notes, "barrage-note-cell", "barrage-note-clamp"));
    tr.appendChild(cell(b.effect, "barrage-note-cell", "barrage-note-clamp"));

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  modalBarragesList.appendChild(wrap);

  preloadBarrageGifs(ship);
}

// The first barrage gif hover felt slow; eagerly decoding each gif once removes a
// one-time codec-init cost. Resizing the gifs was measured and made decode time
// WORSE - do not retry that.
const preloadedGifIds = new Set();
function preloadBarrageGifs(ship) {
  (ship.barrages || []).forEach(b => {
    (b.gifs || []).forEach(g => {
      if (preloadedGifIds.has(g.id)) return;
      preloadedGifIds.add(g.id);
      const preloadImg = new Image();
      preloadImg.src = g.path;
      if (preloadImg.decode) preloadImg.decode().catch(() => {});
    });
  });
}

const INTERACTION_CATEGORY_LABELS = {
  nation: "By Nation",
  hull: "By Hull Type",
  role: "By Fleet Role",
  class: "By Class",
  name: "By Name"
};

// A marked skill always sits IMMEDIATELY AFTER the base skill it replaces in the
// array - that adjacency, not name matching, is how the two are paired, because
// replacement names follow no consistent convention.
// A few "+" skills carry no marker at all (3 in the dataset, e.g. Drake's
// "Flintlock Burst (A)+"), which is what the generic fallback is for.
const SKILL_MARKER_VARIANT = {
  R: { label: "Retrofit", colorVar: "--accent" },
  Aug: { label: "Augment", colorVar: "--gold" },
  FS: { label: "Fate Simulation", colorVar: "--rarity-elite" }
};
function skillVariantInfo(marker) {
  return SKILL_MARKER_VARIANT[marker] || { label: "Enhanced", colorVar: "--text-muted" };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Also drops "(Replaces Old Skill Name)" bookkeeping text, since a replaced skill's
// own name can coincidentally contain a hull-type word and produce a false
// Interaction match.
function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, "").replace(/\(Replaces [^)]+\)/gi, "");
}

// Interaction is ALLY-team-composition only. Everything from here down to
// isGenuineAllyMatch exists to reject a specific false positive found by reading a
// reported counter-example; the ship named in each comment IS that regression case,
// so keep them when editing.
// Hunter-type bonuses read as fleet buffs unless caught: "damage dealt to CVs" is
// a bonus AGAINST enemy carriers (Centaur wrongly matched Izumo). Some skills skip
// the word "dealt" entirely ("this ship's DMG to CVs", I-26/U-73/Noshiro; "the DMG
// this ship deals to BBs", Murmansk), hence the bare "dmg to"/"deals to" branches.
// The 100-char lookback window matters: a long nation list ("DMG dealt to Iron
// Blood, Sardegna Empire, Sakura Empire, and META ships") pushes the nation past a
// shorter one.
const ENEMY_TARGET_CUE_RE = /\b(damage dealt to|dmg dealt to|damage dealt against|dmg dealt against|damage against|dmg against|deals?\s+to|deals?\b[^.]{0,25}\bdamage to|dmg to|damage to|against enemy|against enemies|dmg taken by enemy|damage taken by enemy|enemy(?:'s|s)?\s+(?:ships?|fleet|vanguard|main fleet))\b/i;
// ENEMY_TARGET_CUE_RE only knows "enemy" plus a few generic nouns, so it misses
// every hull/nation combination that can follow it - "enemy Royal Navy CL" (Z16),
// "enemy Submarines" (Roma, Mogador, Cooper, San Jacinto).
// "against" immediately before any match is always PvP phrasing in this dataset
// ("Hit Rate against DDs", Warspite), generalised rather than enumerating every
// stat name that can precede it.
const ENEMY_IMMEDIATELY_BEFORE_RE = /\b(an?\s+)?enem(?:y|ies)('s)?\s*$/i;
const AGAINST_CUE_RE = /\bagainst\s*$/i;

// "All Out Assault - Izumo Class" names the ship's OWN special attack after her own
// class, never a fleet buff - confirmed with the user that no All Out Assault
// buffs allies.
const ALL_OUT_ASSAULT_CUE_RE = /all out assault/i;

// Buffs that trigger on the ABSENCE of a type, or on a summoned unit's own type,
// are the opposite of an interaction:
//   "without other Battleships"          -> Tirpitz wrongly matched Izumo
//   "fires a barrage from battleship X"  -> Natori/Hiranuma wrongly matched Izumo
//   "if your Vanguard consists only of this ship" -> Bolzano META matched Brest
// SOLO_FLEET_BEFORE_RE is the reversed phrasing of the same idea ("is the only ship
// remaining in your Vanguard").
const NEGATIVE_CONDITION_CUE_RE = /\b(without|no)\s+(other\s+)?$/i;
const FROM_SOURCE_CUE_RE = /\bfrom\s+$/i;
const SOLO_FLEET_CUE_RE = /\b(consists|comprised)\b[^.]{0,15}\bonly\b/i;
const SOLO_FLEET_BEFORE_RE = /\bis\s+the\s+only\s+ship\s+remaining\s+in\s*(?:your\s+|the\s+)?$/i;
// "If this ship has Royal Navy gear equipped" is about the ship's own LOADOUT, not
// about allies. This single pattern accounted for roughly half the false positives
// left in the full-dataset audit.
// The scan runs to the next sentence boundary rather than the next word, because
// the equipment noun often sits past a branch or a comma list ("Eagle Union, Iris
// Libre, or Vichya Dominion aircraft equipped").
const EQUIPMENT_CUE_RE = /\b(gear|aircraft|weapons?|main guns?|equipment)\b/i;
function equipmentConditionFollows(text, matchIndex, matchLen) {
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 70);
  const boundary = after.search(/[.;]/);
  return EQUIPMENT_CUE_RE.test(boundary === -1 ? after : after.slice(0, boundary));
}
// "if this ship is in the frontmost position of the Vanguard" is a self-positional
// check, not a statement about who else is in the fleet (Deutschland, Hermione).
// Real text varies both the preposition and the determiner ("position of your
// Vanguard", Alfredo Oriani; "position in your Vanguard", Admiral Hipper mu).
// Deliberately narrow so it does NOT catch phrasing that genuinely targets another
// ship by position - "applied to the frontmost ship of the Vanguard" (Z14) and
// "this ship AND the frontmost Vanguard ship's..." (Howe) must stay matched.
const FRONTMOST_POSITION_CUE_RE = /\bin the frontmost position (?:of|in)\s*(?:the|your|this ship's)?\s*$/i;

// The word "Vanguard" appears constantly inside self-referential headcount and
// position conditions that say nothing about who the buff targets. "placed" is a
// third alternative because one phrasing elides the subject entirely - Carabiniere's
// "if placed in the backmost position of the Vanguard Fleet".
// BROADER_FLEET_TARGET_RE is the counter-test: if the effect clause names a
// fleet-wide target, the fleet word was not merely a gate.
const IF_CONDITION_PREFIX_RE = /\bif\s+(?:there\s+(?:is|are)|this ship (?:is|has)(?:\s+not)?|placed)\b/i;
const BROADER_FLEET_TARGET_RE = /\b(your vanguard|vanguard fleet|vanguard ships?|main fleet|your fleet|all your ships?|all ships|allied ships?|other ships?|each ship|every ship|frontmost vanguard ship|frontmost main fleet ship|frontmost ship)\b/i;

// Bounded to the CURRENT colon-separated clause so an earlier "if" that already
// resolved with its own colon cannot leak into a later unconditional clause -
// Baltimore mu's "...: increases this ship's EVA... and increases your Vanguard's
// AA" must keep the Vanguard-AA half matched.
function clauseBefore(text, index) {
  const before = text.slice(0, index);
  const boundary = Math.max(before.lastIndexOf(":"), before.lastIndexOf(". "), before.lastIndexOf("; "));
  return before.slice(boundary + 1);
}

// A match inside an "if there is/are..." condition, with a colon right after it and
// no fleet-wide target in the effect that follows, is a self-only buff that merely
// used the fleet word as a headcount gate (Brest: "if there are 3 ships in your
// Vanguard: increases this ship's EVA").
// Requiring the colon IMMEDIATELY after the match is what avoids misreading a
// genuine target reached through a comma instead - Ganj-i-Sawai's "...afloat in
// this fleet, this HP recovery effect will also apply to your Vanguard ship with
// the lowest current HP" has no colon there, so this guard correctly stays out.
function selfOnlyConditionedEffect(text, matchIndex, matchLen) {
  if (!IF_CONDITION_PREFIX_RE.test(clauseBefore(text, matchIndex))) return false;
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 15);
  const colonMatch = after.match(/^[^a-zA-Z]{0,10}:/);
  if (!colonMatch) return false;
  const afterColon = text.slice(matchIndex + matchLen + colonMatch[0].length);
  const end = afterColon.indexOf(". ");
  const effect = afterColon.slice(0, end === -1 ? Math.min(afterColon.length, 220) : end);
  return !BROADER_FLEET_TARGET_RE.test(effect);
}

// The comma-separated variant of the same pattern (Acasta's "Death Raid"). Her own
// clarifying aside repeats "Vanguard" a second time inside the parenthetical, past
// the point SOLO_FLEET_BEFORE_RE already excludes, so every occurrence is checked
// and an optional "(...)" aside is allowed before the comma.
const COMMA_SELF_ONLY_EFFECT_RE = /^\s*(?:\([^)]{0,80}\)|\))?\s*,\s*(?:and\s+)?(?:increases?|decreases?|restores?|grants?|gains?)\s+this ship/i;
function commaSelfOnlyEffectFollows(text, matchIndex, matchLen) {
  return COMMA_SELF_ONLY_EFFECT_RE.test(text.slice(matchIndex + matchLen, matchIndex + matchLen + 100));
}

// "Vanguard Fleet Leader (First Slot)" names a SLOT, not a ship category - the
// 22/33 pair's buff is scoped to each other by name, never general.
const FLEET_LEADER_SLOT_RE = /^\s*Fleet Leader\b/i;

// Sentence-scoped, unlike clauseBefore: this dataset chains several
// colon-separated effect clauses under one earlier "if", so a clause-scoped check
// would miss the gate governing a later clause.
function sentenceBefore(text, index) {
  const before = text.slice(0, index);
  const boundary = before.lastIndexOf(". ");
  return before.slice(boundary + 1);
}
// Interaction requires a buff to be guaranteed by the candidate ship's own nation,
// hull or role membership - a buff additionally gated on some OTHER ship being
// present, on a slot, or on a headcount does not count. This is a STRICTER standard
// than computeEffectiveStats uses; do not backport it there.
// "sortied with a ship that has X equipped" (Arizona META) is the same third-party
// dependency phrased as a partner requirement.
// Action triggers ("when this ship fires her Main Guns", "every 20s") are
// deliberately NOT gates - they fire regardless of team composition, so Centaur's
// Airspace Dominance and Andrea Doria META still match.
const SORTIED_WITH_GATE_RE = /\bsortied with\b/i;
function structurallyGatedMatch(text, matchIndex) {
  const sentence = sentenceBefore(text, matchIndex);
  return IF_CONDITION_PREFIX_RE.test(sentence) || SORTIED_WITH_GATE_RE.test(sentence);
}

// Ships literally named after reserved game terms or ordinary words. Matching
// their display name would catch the word's everyday use ("the Vanguard fleet",
// "tells a fortune", "the 2nd time") far more often than a real reference, so they
// are excluded from the name category entirely rather than disambiguated.
const NAME_MATCH_STOPLIST = new Set(["Vanguard", "Fortune", "The 2nd"]);

const ALL_NATION_TERMS = [...new Set(ships.map(s => nationDisplayName(s.nationality)).filter(Boolean))];
const ALL_HULL_TERMS = [...new Set(ships.map(s => HULL_TYPE_TEXT[s.hullType] || s.hullType).filter(Boolean))]
  .flatMap(text => HULL_TEXT_TO_ABBR[text] ? [text, HULL_TEXT_TO_ABBR[text]] : [text]);

// A compound qualifier restricts a buff to BOTH a nation AND a role/hull, so a
// candidate must satisfy the whole condition, not one half of it.
// Strict adjacency ("Dragon Empery Main Fleet ships") misses the far commoner form
// with connectors in between - Chang Chun's "Northern Parliament and Dragon Empery
// ships in the Vanguard Fleet" - which is what compoundNationListExcludes handles.
function otherNationImmediatelyBefore(text, matchIndex, ownNation) {
  const before = text.slice(Math.max(0, matchIndex - 30), matchIndex);
  if (ALL_NATION_TERMS.some(nation => nation !== ownNation && new RegExp(`\\b${escapeRegExp(nation)}\\s*$`, "i").test(before))) return true;
  return compoundNationListExcludes(text, matchIndex, ownNation);
}
// NATION_LIST_TRIGGER_PREFIX_RE is a guard on the guard: a nation named before
// "ship in your Vanguard" is not always who the buff is FOR. In Alfredo Oriani's
// "when this ship or a Sardegna Empire ship in your Vanguard falls below 30% max
// HP...", the nation names who can TRIGGER a smokescreen that then benefits all
// ships in it, unrestricted. Reached through when/if/once/whenever/or a/another/per
// it is a trigger condition, not a beneficiary list.
const NATION_LIST_CONNECTOR_RE = "(?:ships?|vessels?|forces|fleet members|CLs?|CVs?|CVLs?|CAs?|CBs?|BBs?|BCs?|BBVs?|DDs?|DDGs?|SSs?|SSVs?)";
const NATION_LIST_TRIGGER_PREFIX_RE = /\b(when|if|once|whenever|or\s+an?|another|per)\s*$/i;
function compoundNationListExcludes(text, matchIndex, ownNation) {
  const before = text.slice(Math.max(0, matchIndex - 90), matchIndex);
  const nationAlt = ALL_NATION_TERMS.map(escapeRegExp).join("|");
  const re = new RegExp(
    `(?:(?:${nationAlt})(?:,\\s*|\\s+and\\s+|\\s+or\\s+))*(?:${nationAlt})` +
    `(?:\\s+${NATION_LIST_CONNECTOR_RE})?\\s+(?:in|of)\\s+(?:the|your)\\s*$`,
    "i"
  );
  const m = re.exec(before);
  if (!m) return false;
  if (NATION_LIST_TRIGGER_PREFIX_RE.test(before.slice(0, m.index))) return false;
  const foundNations = ALL_NATION_TERMS.filter(n => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(m[0]));
  if (!foundNations.length) return false;
  return !foundNations.includes(ownNation);
}
function otherHullImmediatelyAfter(text, matchIndex, matchLen, ownHullText, ownHullAbbr) {
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 20);
  return ALL_HULL_TERMS.some(hull => hull !== ownHullText && hull !== ownHullAbbr && new RegExp(`^\\s*${escapeRegExp(hull)}s?\\b`, "i").test(after));
}

// A skill that echoes its own name inline is not referencing another ship, even
// when that name contains one - Wichita META's "Ashen Might - Wichita II only:"
// sits inside the skill titled "Ashen Might - Wichita".
// Computed as ranges to SKIP rather than by deleting the substring: an earlier
// version deleted it and also erased the literal "All Out Assault" text that its
// own guard depends on, sending class false positives from 33 to 224.
function selfNameRanges(text, skillName) {
  if (!skillName) return [];
  const ranges = [];
  let idx = text.indexOf(skillName);
  while (idx !== -1) {
    ranges.push([idx, idx + skillName.length]);
    idx = text.indexOf(skillName, idx + skillName.length);
  }
  return ranges;
}
function withinRanges(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function isGenuineAllyMatch(text, m, category, ship) {
  const matchIndex = m.index;
  const matchLen = m[0].length;

  if (text[matchIndex - 1] === "(") return false;

  if (ENEMY_TARGET_CUE_RE.test(text.slice(Math.max(0, matchIndex - 100), matchIndex + 15))) return false;
  if (ALL_OUT_ASSAULT_CUE_RE.test(text.slice(Math.max(0, matchIndex - 60), matchIndex))) return false;
  if (ENEMY_IMMEDIATELY_BEFORE_RE.test(text.slice(Math.max(0, matchIndex - 20), matchIndex))) return false;
  if (AGAINST_CUE_RE.test(text.slice(Math.max(0, matchIndex - 15), matchIndex))) return false;
  if (equipmentConditionFollows(text, matchIndex, matchLen)) return false;
  if (category === "name" && ALL_NATION_TERMS.some(nation => nation.length > matchLen && new RegExp(`^${escapeRegExp(nation)}\\b`, "i").test(text.slice(matchIndex, matchIndex + 30)))) return false;

  const tightBefore = text.slice(Math.max(0, matchIndex - 20), matchIndex);
  if (NEGATIVE_CONDITION_CUE_RE.test(tightBefore)) return false;
  if (category === "hull") {
    if (FROM_SOURCE_CUE_RE.test(tightBefore)) return false;
    if (/^\s*guns?\b/i.test(text.slice(matchIndex + matchLen, matchIndex + matchLen + 8))) return false;
  }
  if (category === "role") {
    if (FRONTMOST_POSITION_CUE_RE.test(text.slice(Math.max(0, matchIndex - 35), matchIndex))) return false;
    if (FLEET_LEADER_SLOT_RE.test(text.slice(matchIndex + matchLen, matchIndex + matchLen + 20))) return false;
  }

  if ((category === "hull" || category === "role") && otherNationImmediatelyBefore(text, matchIndex, nationDisplayName(ship.nationality))) return false;
  if (category === "nation") {
    const hullText = ship.hullType ? (HULL_TYPE_TEXT[ship.hullType] || ship.hullType) : null;
    const hullAbbr = hullText ? HULL_TEXT_TO_ABBR[hullText] : null;
    if (otherHullImmediatelyAfter(text, matchIndex, matchLen, hullText, hullAbbr)) return false;
  }
  if (category === "hull" || category === "role" || category === "nation") {
    if (SOLO_FLEET_CUE_RE.test(text.slice(matchIndex + matchLen, matchIndex + matchLen + 70))) return false;
    if (SOLO_FLEET_BEFORE_RE.test(text.slice(Math.max(0, matchIndex - 50), matchIndex))) return false;
    if (selfOnlyConditionedEffect(text, matchIndex, matchLen)) return false;
    if (commaSelfOnlyEffectFollows(text, matchIndex, matchLen)) return false;
    if (structurallyGatedMatch(text, matchIndex)) return false;
  }

  return true;
}

function baseTextMentionsCategory(skill, re) {
  const text = stripHtml(skill.description);
  if (!text) return false;
  re.lastIndex = 0;
  return re.test(text);
}
function hasGenuineMatch(skill, category, re, ship) {
  const text = stripHtml(skill.description);
  if (!text) return false;
  const ownNameRanges = selfNameRanges(text, skill.name);
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (withinRanges(ownNameRanges, m.index)) continue;
    if (isGenuineAllyMatch(text, m, category, ship)) return true;
  }
  return false;
}
// When a "+" skill matches alone, the entry is anchored on its base skill so the
// toggle can show both. But blindly anchoring re-introduces exactly what the
// structural gate excludes, one level removed: Ganj-i-Sawai's base skill mentions
// "Vanguard" only inside a gated clause.
// So a base skill is a safe anchor only if it either never mentions the category
// (Chapayev - makes no claim of its own) or mentions it AND independently passes
// isGenuineAllyMatch. Otherwise the entry falls back to the "+" skill alone.
function isSafeBaseAnchor(skill, category, re, ship) {
  if (!baseTextMentionsCategory(skill, re)) return true;
  return hasGenuineMatch(skill, category, re, ship);
}

function computeInteractions(ship) {
  const patterns = [];

  if (ship.nationality) {
    patterns.push({ category: "nation", label: ship.nationality, re: new RegExp(`\\b${escapeRegExp(nationDisplayName(ship.nationality))}\\b`, "gi") });
  }
  if (ship.hullType) {
    const text = HULL_TYPE_TEXT[ship.hullType] || ship.hullType;
    const abbr = HULL_TEXT_TO_ABBR[text];
    const avoidAviationPrefix = !text.startsWith("Aviation ") ? "(?<!Aviation )" : "";
    const alt = abbr ? `(?:${escapeRegExp(text)}|${escapeRegExp(abbr)})` : escapeRegExp(text);
    patterns.push({ category: "hull", label: ship.hullType, re: new RegExp(`${avoidAviationPrefix}\\b${alt}s?\\b`, "gi") });
  }
  if (ship.role === "Vanguard" || ship.role === "Main") {
    const text = ship.role === "Main" ? "Main Fleet" : "Vanguard";
    patterns.push({ category: "role", label: `${ship.role} Fleet`, re: new RegExp(`\\b${escapeRegExp(text)}\\b`, "gi") });
  }
  if (ship.class) {
    const stem = ship.class.replace(/\s*Class$/i, "");
    patterns.push({ category: "class", label: ship.class, re: new RegExp(`\\b${escapeRegExp(stem)}[- ]class`, "gi") });
  }
  if (ship.displayName && ship.displayName.length >= 3 && /[a-zA-Z]/.test(ship.displayName) && !NAME_MATCH_STOPLIST.has(ship.displayName)) {
    patterns.push({ category: "name", label: ship.displayName, re: new RegExp(`\\b${escapeRegExp(ship.displayName)}\\b`, "gi") });
  }

  const results = { nation: [], hull: [], role: [], class: [], name: [] };
  const totals = { nation: 0, hull: 0, role: 0, class: 0, name: 0 };
  if (!patterns.length) return { results, totals };

  for (const entry of getAllSkillsIndex()) {
    if (entry.ship === ship) continue;
    const text = stripHtml(entry.skill.description);
    if (!text) continue;
    const ownNameRanges = selfNameRanges(text, entry.skill.name);
    for (const p of patterns) {
      p.re.lastIndex = 0;
      let m, allyMatch = false;
      while ((m = p.re.exec(text))) {
        if (withinRanges(ownNameRanges, m.index)) continue;
        if (isGenuineAllyMatch(text, m, p.category, ship)) { allyMatch = true; break; }
      }
      if (!allyMatch) continue;

      const isPlusVariant = entry.skill.name.endsWith("+");
      const pairName = isPlusVariant ? entry.skill.name.slice(0, -1) : entry.skill.name + "+";
      const existing = results[p.category].find(r => r.ship === entry.ship && r.skill.name === pairName);
      if (existing) {
        if (isPlusVariant) {
          existing.enhancedSkill = entry.skill;
          existing.enhancedText = text;
        } else {
          existing.enhancedSkill = existing.skill;
          existing.enhancedText = existing.text;
          existing.skill = entry.skill;
          existing.text = text;
        }
        continue;
      }

      totals[p.category]++;
      {
        const baseSkillCandidate = isPlusVariant ? entry.ship.skills.find(sk => sk.name === pairName) : null;
        const baseSkill = baseSkillCandidate && isSafeBaseAnchor(baseSkillCandidate, p.category, p.re, ship) ? baseSkillCandidate : null;
        if (baseSkill) {
          results[p.category].push({
            ship: entry.ship,
            skill: baseSkill,
            text: stripHtml(baseSkill.description),
            enhancedSkill: entry.skill,
            enhancedText: text
          });
        } else {
          results[p.category].push({ ship: entry.ship, skill: entry.skill, text });
        }
      }
    }
  }
  return { results, totals };
}

// A common category can legitimately run to hundreds of entries (2B has 185 by
// fleet role), so only the current page is built into DOM nodes. Page state is a
// local variable per category, which is why it resets naturally on every modal
// open with no explicit reset code.
const INTERACTION_PAGE_SIZE = 20;

function buildInteractionItem({ ship: otherShip, skill, text, enhancedSkill, enhancedText }) {
  const item = document.createElement("div");
  item.className = "interaction-item";

  const icon = document.createElement("img");
  icon.className = "interaction-icon";
  icon.src = otherShip.thumbnail;
  icon.alt = "";
  icon.loading = "lazy";
  item.appendChild(icon);

  const body = document.createElement("div");
  body.className = "interaction-body";

  const head = document.createElement("div");
  head.className = "interaction-head";
  const name = document.createElement("span");
  name.className = "interaction-ship-name";
  name.textContent = otherShip.displayName;
  head.appendChild(name);
  const skillName = document.createElement("span");
  skillName.className = "interaction-skill-name";
  skillName.textContent = skill.name;
  head.appendChild(skillName);
  if (enhancedText) {
    const variant = skillVariantInfo(enhancedSkill.marker);
    const variantToggle = document.createElement("button");
    variantToggle.type = "button";
    variantToggle.className = "interaction-variant-toggle";
    variantToggle.style.setProperty("--tag-color", `var(${variant.colorVar})`);
    variantToggle.textContent = variant.label;
    variantToggle.title = `Show ${enhancedSkill.name}'s ${variant.label.toLowerCase()} effect`;
    head.appendChild(variantToggle);
  } else if (skill.name.endsWith("+")) {
    const variant = skillVariantInfo(skill.marker);
    const variantBadge = document.createElement("span");
    variantBadge.className = "interaction-variant-badge";
    variantBadge.style.setProperty("--tag-color", `var(${variant.colorVar})`);
    variantBadge.textContent = variant.label;
    variantBadge.title = `${skill.name} includes this ${variant.label.toLowerCase()}'s effect`;
    head.appendChild(variantBadge);
  }
  body.appendChild(head);

  const desc = document.createElement("div");
  desc.className = "interaction-desc";
  const baseAtBase = renderLevelValues(skill.description, false);
  const baseAtMax = renderLevelValues(skill.description, true);
  const paintBase = (atMax) => {
    appendSkillDescription(desc, atMax ? baseAtMax : baseAtBase);
    highlightKeywords(desc, namedMechanics(baseAtBase));
  };
  body.appendChild(desc);

  let enhancedDesc = null, paintEnhanced = null, enhAtBase = null, enhAtMax = null;
  if (enhancedText) {
    enhancedDesc = document.createElement("div");
    enhancedDesc.className = "interaction-desc interaction-desc-enhanced";
    enhancedDesc.hidden = true;
    enhAtBase = renderLevelValues(enhancedSkill.description, false);
    enhAtMax = renderLevelValues(enhancedSkill.description, true);
    paintEnhanced = (atMax) => {
      appendSkillDescription(enhancedDesc, atMax ? enhAtMax : enhAtBase);
      highlightKeywords(enhancedDesc, namedMechanics(enhAtBase));
    };
    body.appendChild(enhancedDesc);

    const variantToggle = head.querySelector(".interaction-variant-toggle");
    variantToggle.addEventListener("click", () => {
      const showingEnhanced = variantToggle.classList.toggle("active");
      desc.hidden = showingEnhanced;
      enhancedDesc.hidden = !showingEnhanced;
      skillName.textContent = showingEnhanced ? enhancedSkill.name : skill.name;
    });
  }

  if (baseAtBase !== baseAtMax || (enhAtBase !== null && enhAtBase !== enhAtMax)) {
    const maxToggle = createMaxLevelToggle();
    maxToggle.title = "Show this skill's values at max skill level (Lv.10)";
    const paintBoth = (atMax) => { paintBase(atMax); if (paintEnhanced) paintEnhanced(atMax); };
    interactionMaxLevelPaint.set(maxToggle, paintBoth);
    maxToggle.addEventListener("click", () => {
      const on = !isMaxLevelToggleOn(maxToggle);
      setMaxLevelToggle(maxToggle, on);
      paintBoth(on);
      syncInteractionMaxLevelToggle();
    });
    setMaxLevelToggle(maxToggle, interactionAtMaxLevel);
    head.appendChild(maxToggle);
  }

  paintBase(interactionAtMaxLevel);
  if (paintEnhanced) paintEnhanced(interactionAtMaxLevel);

  item.appendChild(body);
  return item;
}

function renderModalInteraction(ship) {
  const { results } = computeInteractions(ship);
  const categories = Object.keys(results).filter(cat => results[cat].length > 0);

  if (categories.length === 0) {
    modalInteractionSection.hidden = true;
    return;
  }
  modalInteractionSection.hidden = false;
  modalInteractionList.innerHTML = "";

  for (const cat of categories) {
    const entries = results[cat];
    const pageCount = Math.max(1, Math.ceil(entries.length / INTERACTION_PAGE_SIZE));
    let page = 0;

    const details = document.createElement("details");
    details.className = "interaction-group";

    const summary = document.createElement("summary");
    summary.textContent = `${INTERACTION_CATEGORY_LABELS[cat]} — ${entries.length}`;
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "interaction-list";
    details.appendChild(list);

    let pager = null;
    let pagerLabel = null;
    let prevBtn = null;
    let nextBtn = null;
    if (pageCount > 1) {
      pager = document.createElement("div");
      pager.className = "interaction-pager";
      prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "interaction-pager-btn";
      prevBtn.textContent = "‹ Prev";
      pagerLabel = document.createElement("span");
      pagerLabel.className = "interaction-pager-label";
      nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "interaction-pager-btn";
      nextBtn.textContent = "Next ›";
      pager.append(prevBtn, pagerLabel, nextBtn);
      details.appendChild(pager);
    }

    function renderPage() {
      list.innerHTML = "";
      const start = page * INTERACTION_PAGE_SIZE;
      for (const entry of entries.slice(start, start + INTERACTION_PAGE_SIZE)) {
        list.appendChild(buildInteractionItem(entry));
      }
      if (pager) {
        pagerLabel.textContent = `Page ${page + 1} / ${pageCount}`;
        prevBtn.disabled = page === 0;
        nextBtn.disabled = page === pageCount - 1;
      }
      syncInteractionMaxLevelToggle();
    }
    if (pager) {
      prevBtn.addEventListener("click", () => { page = Math.max(0, page - 1); renderPage(); });
      nextBtn.addEventListener("click", () => { page = Math.min(pageCount - 1, page + 1); renderPage(); });
    }
    renderPage();

    modalInteractionList.appendChild(details);
  }

  syncInteractionMaxLevelToggle();
}

function effectiveSkins(ship) {
  if (ship.skins && ship.skins.length) return ship.skins;
  return [{ name: "Default", type: "Default", painting: ship.painting || ship.thumbnail, icon: ship.thumbnail }];
}

function updateModalImage() {
  const ship = currentShip;
  if (!ship) return;
  const skins = effectiveSkins(ship);
  const skin = skins[currentSkinIndex] || skins[0];

  modalImage.src = skin.painting || skin.icon;
  modalImage.alt = `${ship.displayName} — ${skin.name}`;
  modalSkinNameEl.textContent = skin.name;

  modalSkinStrip.querySelectorAll(".skin-thumb").forEach((el, i) => {
    el.classList.toggle("active", i === currentSkinIndex);
  });
}

function currentRarity() {
  const ship = currentShip;
  return retrofitApplied && ship.retrofitRarity ? ship.retrofitRarity : ship.rarity;
}

function applyRetrofitState() {
  const ship = currentShip;
  if (!ship) return;
  const rarity = currentRarity();

  renderModalTags(ship, rarity);
  // Skills first: it resets each toggle-bearing skill's Max Level override to the
  // current skillsAtMaxLevel default, which computeEffectiveStats reads - rendering
  // Stats first would compute off whatever override a previous view of this ship's
  // modal left behind in skillLevelState.
  renderModalSkills(ship, retrofitApplied, augmentApplied, fateSimApplied);
  renderModalStatsTable(ship, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
  renderModalBarrages(ship, retrofitApplied, augmentApplied, fateSimApplied, currentLevel);
  modalEl.style.setProperty("--modal-rarity-color", `var(--${RARITY_CLASS[rarity] || "rarity-normal"})`);
}

function renderSkinStrip(ship) {
  const skins = effectiveSkins(ship);
  modalSkinStrip.innerHTML = "";
  modalSkinStrip.hidden = skins.length <= 1;

  skins.forEach((skin, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "skin-thumb" + (i === currentSkinIndex ? " active" : "");
    btn.title = skin.name;

    const img = document.createElement("img");
    img.src = skin.icon || skin.painting;
    img.alt = skin.name;
    img.loading = "lazy";
    btn.appendChild(img);

    btn.addEventListener("click", () => {
      currentSkinIndex = i;
      updateModalImage();
    });
    modalSkinStrip.appendChild(btn);
  });
}

function openModal(ship) {
  currentShip = ship;
  const skins = effectiveSkins(ship);
  currentSkinIndex = Math.max(skins.findIndex(s => s.type === "Default"), 0);
  currentLevel = 1;
  retrofitApplied = false;
  augmentApplied = false;
  fateSimApplied = false;
  updateLevelControlUI(1);
  modalRetrofitCheckbox.checked = false;
  modalRetrofitControl.hidden = !ship.hasRetrofit;
  modalAugmentCheckbox.checked = false;
  modalAugmentControl.hidden = !(ship.skills || []).some(s => s.marker === "Aug");
  modalFateSimCheckbox.checked = false;
  modalFateSimControl.hidden = !(ship.skills || []).some(s => s.marker === "FS");

  modalName.textContent = ship.displayName;
  const nationColor = NATION_COLORS[nationDisplayName(ship.nationality)];
  if (nationColor) {
    modalEl.style.setProperty("--modal-nation-color", nationColor);
  } else {
    modalEl.style.removeProperty("--modal-nation-color");
  }
  const logoCode = FACTION_LOGO_CODE[nationDisplayName(ship.nationality)];
  if (logoCode) {
    modalNationWatermark.src = `assets/faction-logos/${logoCode}.png`;
    modalNationWatermark.hidden = false;
  } else {
    modalNationWatermark.hidden = true;
  }
  if (ship.hullShort) {
    modalHullIcon.src = `assets/hull-icons/${ship.hullShort}.png`;
    modalHullIcon.alt = ship.hullType || "";
    modalHullIcon.title = ship.hullType || "";
    modalHullIcon.hidden = false;
  } else {
    modalHullIcon.hidden = true;
  }

  renderSkinStrip(ship);
  updateModalImage();
  applyRetrofitState();
  renderModalEquipment(ship);
  renderModalInteraction(ship);

  modalOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = "";
  currentShip = null;
  hideEquipInfoTooltip();
}

grid.addEventListener("click", event => {
  const card = event.target.closest(".card");
  if (!card) return;
  const ship = shipsById.get(card.dataset.id);
  if (ship) openModal(ship);
});

function updateLevelControlUI(level) {
  modalLevelInput.value = String(level);
  modalLevelNotches.querySelectorAll(".level-notch").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.level) === level);
  });
}

function setLevel(newLevel) {
  const clamped = Math.min(125, Math.max(1, Math.round(newLevel) || 1));
  currentLevel = clamped;
  updateLevelControlUI(clamped);
  if (!currentShip) return;
  renderModalStatsTable(currentShip, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
  // A limit break swaps which barrage rows fire, so the table has to follow the level.
  renderModalBarrages(currentShip, retrofitApplied, augmentApplied, fateSimApplied, currentLevel);
}

modalLevelNotches.addEventListener("click", event => {
  const btn = event.target.closest(".level-notch");
  if (!btn) return;
  setLevel(Number(btn.dataset.level));
});

// An empty field is ignored rather than snapped to 1: clearing the box before
// typing a replacement is the natural way to change "1" to "56", and forcing it
// back on every keystroke makes that impossible. The change handler restores the
// last valid level if the field is still empty on blur.
modalLevelInput.addEventListener("input", () => {
  if (modalLevelInput.value === "" || Number.isNaN(Number(modalLevelInput.value))) return;
  setLevel(Number(modalLevelInput.value));
});

modalLevelInput.addEventListener("change", () => {
  if (modalLevelInput.value === "") modalLevelInput.value = String(currentLevel);
});

modalLevelSpinUp.addEventListener("click", () => setLevel(currentLevel + 1));
modalLevelSpinDown.addEventListener("click", () => setLevel(currentLevel - 1));

modalRetrofitCheckbox.addEventListener("change", () => {
  retrofitApplied = modalRetrofitCheckbox.checked;

  if (currentShip) {
    const skins = effectiveSkins(currentShip);
    const current = skins[currentSkinIndex];
    if (current && (current.type === "Default" || current.type === "Retrofit")) {
      const wantedType = retrofitApplied ? "Retrofit" : "Default";
      const idx = skins.findIndex(s => s.type === wantedType);
      if (idx !== -1) currentSkinIndex = idx;
    }
    updateModalImage();
  }

  applyRetrofitState();
});

modalAugmentCheckbox.addEventListener("change", () => {
  augmentApplied = modalAugmentCheckbox.checked;
  applyRetrofitState();
});

modalFateSimCheckbox.addEventListener("change", () => {
  fateSimApplied = modalFateSimCheckbox.checked;
  applyRetrofitState();
});

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", event => {
  if (event.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modalOverlay.hidden) closeModal();
});

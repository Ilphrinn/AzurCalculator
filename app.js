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

// Hex values are user-supplied, except Vichya Dominion/Iron Blood/META, lightened in HSL
// space after measuring under 3:1 contrast on this dark surface — don't revert those three.
// 30 hues can't be pairwise CVD-safe; that trade was made deliberately for authenticity.
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

// Keyed by the wiki's own short code, not the nation name, so accented/starred names never
// become filenames. The 13 collabs mapped to "Um" genuinely share one wiki icon, not a
// placeholder for missing art.
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

// Hex values are user-supplied; each row also lists whichever spelling the corpus actually
// uses (only hyphenated "Anti-Air" occurs, for example). Oil Consumption never appears in
// skill prose — kept for completeness, it just never highlights anything.
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

// Picked by corpus frequency (Burn 98, Special Burn 41, Armor Break 40, Smokescreen 32,
// Flooding 20). Unlike the nation/stat tables these hues are guesses, not sourced from the
// wiki — replace them if real values ever turn up.
const MECHANIC_COLOR_GROUPS = [
  { color: "#F2603C", terms: ["Burn", "Burning"] },
  { color: "#CE72E8", terms: ["Special Burn"] },
  { color: "#3D7FE8", terms: ["Flooding"] },
  { color: "#E8C255", terms: ["Armor Break", "Armor-broken"] },
  { color: "#9FB0C4", terms: ["Smokescreen"] }
];
const MECHANIC_COLORS = Object.fromEntries(MECHANIC_COLOR_GROUPS.flatMap(g => g.terms.map(t => [t, g.color])));

// "AP" is written identically for ammo and Action Points; checked by hand against all 105
// occurrences, Action Points always sits after a number/"more" or before
// "cost"/"consumption".
function apIsAmmoType(text, index) {
  const before = text.slice(Math.max(0, index - 15), index);
  if (/\d\s*$/.test(before) || /\bmore\s*$/i.test(before)) return false;
  const after = text.slice(index + 2, index + 18);
  return !/^\s*(cost|consumption|-consuming)/i.test(after);
}
// caseSensitive exists because the shared regex is case-insensitive, under which "HE"
// matches "he" and "Normal" matches the ordinary adjective. "high-caliber" stays
// case-insensitive since every corpus occurrence is already lowercase and can't collide
// with prose.
const AMMO_CALIBER_TERMS = {
  "Normal": { color: "#D4A83A", caseSensitive: true },
  "HE": { color: "#E05252", caseSensitive: true },
  "AP": { color: "#5B7FE8", caseSensitive: true, contextGuard: apIsAmmoType },
  "SAP": { color: "#E8892E", caseSensitive: true },
  "high-caliber": { color: "#E05252" },
  "high caliber": { color: "#E05252" }
};

const NAMED_MECHANIC_COLOR = "var(--accent)";

// Four palettes share one sentence, so the treatment — bare, underlined, or a tinted chip —
// is what tells them apart, not the hue. Mechanics keep the wiki's own casing rather than
// normalizing it, since "smokescreen" is lowercase in most uses.
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

// Per-skill mechanic names must match ahead of the fixed vocabulary, or a name like
// "Standard Armor Break" loses its first word to the shorter global term. The no-names case
// is cached since Interaction rebuilds this once per rendered entry.
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
    } else if (field in METRIC_SORTS) {
      cmp = rankValue(a, field) - rankValue(b, field) || 0;
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

// Where each image's character is (scripts/focus-points.py): [x, y, face height], as fractions of
// the image. Only images the plain crop gets wrong have one: busy paintings and wide icons.
const IMAGE_FOCUS = typeof FOCUS_DATA === "undefined" ? {} : FOCUS_DATA;
// Zoom stops at 1.8: the card JPEGs are 320px wide, and 2.5 visibly blurred Chang Chun and Eldridge.
const CARD_FOCUS = { ratio: 3 / 4, tx: 0.5, ty: 0.3, minFace: 0.18, maxZoom: 1.8 };

// Places the image so the face sits at (tx, ty) of a frame with that width/height ratio, zoomed
// until the face fills minFace of the frame's height. Percentages, so a fixed-ratio card frame
// stays right at any size; the modal's frame changes shape, so it calls this again on resize.
function focusImage(img, path, { ratio, tx, ty, minFace = 0, maxZoom = 1 }) {
  const focus = IMAGE_FOCUS[path];
  const imageRatio = img.naturalWidth / img.naturalHeight;
  img.classList.toggle("is-focused", Boolean(focus && imageRatio && ratio));
  if (!img.classList.contains("is-focused")) {
    for (const key of ["left", "top", "width", "height"]) img.style.removeProperty(key);
    return;
  }
  const [fx, fy, faceHeight] = focus;
  const coverHeight = Math.max(1, ratio / imageRatio);
  const zoom = Math.min(maxZoom, Math.max(1, minFace / (faceHeight * coverHeight)));
  const height = coverHeight * zoom;
  const width = imageRatio * height;
  const left = Math.min(0, Math.max(ratio - width, tx * ratio - fx * width));
  const top = Math.min(0, Math.max(1 - height, ty - fy * height));
  img.style.width = `${width / ratio * 100}%`;
  img.style.height = `${height * 100}%`;
  img.style.left = `${left / ratio * 100}%`;
  img.style.top = `${top * 100}%`;
}

function whenLoaded(img, callback) {
  if (img.complete && img.naturalWidth) callback();
  img.addEventListener("load", callback);
}

function createCardThumbnail(path, className, alt) {
  const image = document.createElement("img");
  image.className = className;
  if (IMAGE_FOCUS[path]) whenLoaded(image, () => focusImage(image, path, CARD_FOCUS));
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
    strip.classList.add("rarity-shift");
    strip.style.setProperty("--strip-from", baseColor);
    strip.style.setProperty("--strip-to", retrofitColor);
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

  const figure = document.createElement("span");
  figure.className = "card-figure";
  figure.hidden = true;
  thumbWrap.appendChild(figure);

  const activateButton = document.createElement("button");
  activateButton.className = "card-activate";
  activateButton.type = "button";
  activateButton.setAttribute("aria-label", `View ${ship.displayName} details`);
  card.appendChild(activateButton);

  return card;
}

// Built once per ship, so a search keystroke only reorders existing cards instead of rebuilding 888.
const cardCache = new Map();

// Level 125 figures for the metric sorts, filled by refreshRankFigures (end of file); a ship with
// no figure (no equipment data) sorts last.
const METRIC_SORTS = { dps: "DPS", ehp: "eHP", dpsAA: "AA" };
const rankFigures = new Map();

function rankValue(ship, key) {
  const figures = rankFigures.get(ship);
  return figures ? figures[key] : -Infinity;
}

function metricSortKey() {
  const field = sortEl.value.split("-")[0];
  return field in METRIC_SORTS ? field : null;
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
  const metric = metricSortKey();
  for (const ship of list) {
    if (!cardCache.has(ship.id)) cardCache.set(ship.id, createCard(ship));
    const card = cardCache.get(ship.id);
    const badge = card.querySelector(".card-figure");
    const figures = metric && rankFigures.get(ship);
    badge.hidden = !figures;
    if (figures) badge.textContent = `${METRIC_SORTS[metric]} ${Math.round(figures[metric]).toLocaleString("en-US")}`;
    fragment.appendChild(card);
  }
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
sortEl.addEventListener("change", () => (metricSortKey() ? refreshRankFigures() : update()));

refreshBtn.addEventListener("click", () => {
  resetAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

buildFilterPanel();
update();
mainEl.removeAttribute("aria-busy");

// Reproduces the game's own compact 3-column panel; the two null slots are deliberately
// blank so the columns still line up. Ammunition, Oxygen and Oil Consumption are omitted —
// all three are 0/888 ships with any numeric value.
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

// The modal is reused for all 888 ships, so these images start with no src — building them
// in JS keeps an invalid empty-src <img> out of the served markup, the same way catalog
// thumbnails already work. The watermark is absolutely positioned and the hull icon
// relative, so insertion order controls which paints on top.
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
const modalEquipmentBoss = document.getElementById("modal-equipment-boss");
const modalEquipmentBossStats = document.getElementById("modal-equipment-boss-stats");
const modalCombatMetrics = document.getElementById("modal-combat-metrics");
const modalSkillsSection = document.getElementById("modal-skills-section");
const modalSkillsMaxToggle = document.getElementById("modal-skills-max-toggle");
const modalSkillsList = document.getElementById("modal-skills");
const modalBarragesSection = document.getElementById("modal-barrages-section");
const modalBarragesList = document.getElementById("modal-barrages");
const modalInteractionSection = document.getElementById("modal-interaction-section");
const modalInteractionList = document.getElementById("modal-interaction");
const modalInteractionMaxToggle = document.getElementById("modal-interaction-max-toggle");

const dataScriptLoads = new Map();
function setEquipmentControlsDisabled(disabled) {
  [modalEquipmentCap, modalEquipmentTarget, modalEquipmentBoss, modalEquipmentGearLab, modalEquipmentResearch, modalEquipmentOptimize, modalEquipmentClear]
    .forEach(control => { control.disabled = disabled; });
}

// A failed load is forgotten so the next attempt retries instead of reusing the rejection.
function loadDataScript(src) {
  if (!dataScriptLoads.has(src)) {
    dataScriptLoads.set(src, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Unable to load ${src}.`));
      document.head.appendChild(script);
    }).catch(error => {
      dataScriptLoads.delete(src);
      throw error;
    }));
  }
  return dataScriptLoads.get(src);
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

// Oil cost inputs, from the wiki's Oil Cost page — MaxCost is hull + rarity, a
// Decisive-and-Main-Fleet bonus, a META bonus, the limit-break bonus, and a small per-ship
// modifier. EXTRA_COST_MODIFIER_BY_NAME is keyed by display name, not ship.class, since
// Minato Aqua and Homura share no class at all.
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
// Read off the Oil Cost page's raw MathML — verified against its own worked example and a
// real screenshot (New Jersey at 125 shows 17). This app has no limit-break tracking, so
// every ship assumes the MAX bonus, same as the wiki mandates for PR/DR/UR/META.
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
  damageTaken: "DMG Taken",
  dodgeUptime: "Evade-all uptime"
};

// The one modifier that is a reduction rather than a gain: a "DMG Taken" bonus is
// captured as a positive magnitude ("decreases ... by 15%" -> amount 15), but showing
// it with the same leading "+" every other pill uses would read as MORE damage taken,
// the opposite of what the skill does.
const REDUCTION_MODIFIER_KEYS = new Set(["damageTaken"]);

const MODIFIER_TERM_RE = /\b(?:DMG dealt|damage dealt|DMG taken|damage taken|DMG|damage|crit(?:ical)?(?:\s+(?:rate|dmg|damage))?|evasion rate|hit rate|accuracy|efficiency)\b/gi;

// A qualifier's "source" half only counts if it names a weapon from this list, which is
// what rejects possessives ("Tirpitz's") and other stats riding the same sentence. Values
// also fix casing, since the wiki writes both "Main Gun efficiency" and "main gun
// efficiency" and the pills sit side by side.
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

// A pill is worthless without its restriction: Alvitr's "DMG Dealt +15%" only applies to
// Light Armor enemies, so bonuses are grouped per (stat, qualifier) rather than summed per
// stat. The qualifier is recovered from the bonus's own raw phrase — a target after the
// stat term, a source weapon before it.
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

function addModifier(modifiers, index, key, amount, skill, raw, qualifier = modifierQualifier(raw)) {
  const { source, target } = qualifier;
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

// statBonuses[].scope was auto-extracted and is wrong in both directions, so the bonus's
// own raw text decides instead — SELF_LANGUAGE_RE catches "fleet" entries that are really
// self (Brest), OTHER_SHIPS_TARGET_RE catches "self" entries that are really about others
// (Shinano). If another mislabelled case turns up, add a targeted pattern rather than
// trying to re-run the (no longer existing) extraction script.
const SELF_LANGUAGE_RE = /\b(this ship('s)?|her own|own)\b/i;
const OTHER_SHIPS_TARGET_RE = /\byour\s+(DDs?|CLs?|CAs?|CBs?|BBs?|BCs?|CVs?|CVLs?|SSs?|SSVs?|Vanguard|Main Fleet|fleet)\b/i;

// A few skills grant a DIFFERENT self bonus depending on which equip-condition branch
// applies (Hakuryuu's "The Great One's Shadow"), so summing every self bonus
// unconditionally would double-count both branches now that equipped gear is real data — 25
// skills carry this shape. A condition this can't confidently parse is left ungated rather
// than excluded, since this only adds precision, never removes a bonus the old "assumed
// met" behavior counted.
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

// The catalog's ammoType carries a variant suffix (AP+, APB, APC, APK, HE*, Normal^...)
// an "if equipped with an AP/HE main gun" condition doesn't distinguish — only the
// leading AP/HE/SAP/Normal family matters. Caught while verifying Ägir's own AP/HE-gated
// bonuses: her best gun's ammoType is "APB", which an exact-string "AP" match rejected.
function ammoTypeFamily(ammoType) {
  const m = /^(AP|HE|SAP|Normal)/i.exec(ammoType || "");
  return m ? m[1].toUpperCase() : "";
}

function resolveEquipNationTerm(text) {
  const t = text.trim();
  return ALL_NATION_TERMS.find(n => n.toLowerCase() === t.toLowerCase())
    || ALL_NATION_TERMS.find(n => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(t));
}

// A skill's own text is the only source for a catalog item name, and it doesn't always
// spell it the way the catalog does (the catalog keeps "Grumman"/"Consolidated" prefixes
// skill text drops) — so this checks both directions instead of assuming a literal
// substring.
function equipTargetNamesCatalogItem(strippedTarget) {
  if (strippedTarget.length < 5) return null;
  const needle = strippedTarget.toLowerCase();
  return EQUIPMENT_DATA.find(item => {
    const name = item.name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  }) || null;
}

function clauseBeforeRaw(plainText, raw) {
  if (!raw) return null;
  const lower = plainText.toLowerCase();
  const idx = lower.indexOf(raw.toLowerCase().trim());
  if (idx < 0) return null;
  // Mode tags often follow a period with no space ("(8%).[Operation Siren]Every time..."), so ".[" also starts a sentence.
  const sentStart = Math.max(plainText.lastIndexOf(". ", idx) + 2, plainText.lastIndexOf(".[", idx) + 1, 0);
  return plainText.slice(sentStart, idx);
}

function equipConditionClauseForRaw(plainText, raw) {
  const clause = clauseBeforeRaw(plainText, raw);
  return clause && /equipped|otherwise/i.test(clause) ? clause : null;
}

// META ships' "When fighting humanoid Siren fleets or Boss fleets" and anything tagged
// [Operation Siren] hold only in Operation Siren, whose bosses here are the Arbiters.
const OPSI_CLAUSE_RE = /operation siren|humanoid sirens?\b|boss fleets/i;
const OPSI_TARGET = "in Operation Siren";

function inOperationSiren() {
  return Boolean(targetBoss && targetBoss.group === "OpSi Arbiter");
}

// clause spans from the sentence start up to the bonus's own raw text, since "otherwise"
// only shows up there when negating an equip condition stated earlier in the SAME sentence
// (Gneisenau META) — its mere presence is enough to flip negate.
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
      return !!item && wanted.has(ammoTypeFamily(item.ammoType));
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

// Skill bonuses plus flat stat contributions from equipped gear; no Meowfficer or Fleet
// Tech data exists. Conditions are assumed met UNLESS specifically about equipped gear,
// which is the one category this app can actually check — Interaction, by contrast,
// excludes conditionally gated buffs entirely.
function computeEffectiveStats(ship, level, isRetrofit, isAugmented, isFateSim) {
  const base = computeStats(ship, level, isRetrofit);
  if (!base) return null;
  // The equipped Augment Module lives in the same equippedGear map as gear (slot key
  // "augment") since it is a FlatStatBuff in the wiki's formula too, the same category -
  // equippedGearFlatStats already sums every equipped item regardless of slot key.
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
      const opsiOnly = OPSI_CLAUSE_RE.test(clauseBeforeRaw(plainDesc, b.raw) || "");
      for (const key of (b.stats || [])) {
        if (key in COMBAT_MODIFIER_LABELS) {
          const qualifier = opsiOnly ? { source: modifierQualifier(b.raw).source, target: OPSI_TARGET } : undefined;
          addModifier(modifiers, modifierIndex, key, amount, skill, b.raw, qualifier);
        } else if (opsiOnly && !inOperationSiren()) {
          continue;
        } else if (NUMERIC_STAT_KEYS.includes(key)) {
          const bucket = b.isPercent ? percentSum : flatSum;
          bucket[key] = (bucket[key] || 0) + amount;
        }
      }
    }
  }

  // Auxiliary passives from the game's buff tables (scripts/import-aux-effects.js). The game does not
  // stack one buff or one no-stacking group, so a second copy adds nothing.
  const itemEffects = [];
  const seenBuffs = new Set();
  for (const item of Object.values(equippedGear[ship.id] || {})) {
    for (const effect of item.effects || []) {
      const stackKey = effect.group || effect.buff;
      if (seenBuffs.has(stackKey)) continue;
      seenBuffs.add(stackKey);
      itemEffects.push(effect);
      const source = { name: item.name, description: effect.text };
      const qualifier = { source: effect.source || "", target: effect.target ? `from ${effect.target}` : "" };
      addModifier(modifiers, modifierIndex, effect.key, effect.amount, source, effect.text, qualifier);
    }
  }

  // The wiki's CurrentScalingStat, from the Damage Calculations page:
  //   [ (ShipBaseStat x CatStatMultiplier) + sum(FlatStatBuffs) ] x (1 + sum(StatPercentBuffs)) + sum(SkillFlatBuffs)
  // Equipment is a FlatStatBuff, added before the percentage and itself amplified by skill
  // buffs, unlike the later SkillFlatBuffs term — swapping the two changes the result
  // whenever a ship has both. CatStatMultiplier stays 1 since no Meowfficer or Fleet Tech
  // data exists here.
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

  return { stats, modifiers, itemEffects };
}

// A boosted cell renders as "{base}+{delta} ({real})" rather than the final number alone,
// since with no Base column anywhere a lone "355" can't be told apart from an unboosted
// value. It can now come from two different sources applying at different points in the
// formula, so spelling both out is the only way to tell which is responsible.
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

// Slot type codes are bare numbers in the datamine, derived (not guessed) by
// cross-referencing 837 saved wiki ship pages naming what their slots 1-3 accept — the wiki
// never lists the auxiliary slots 4-5, which is where the leftovers live. Code 17 has no
// source (Koln, Koln META) and is left out entirely; code 21 never appears alone and
// dedupes into the same "Anti-Air Guns" label as 6.
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

// A slot's type code alone can't name it: a BB's slot 2 takes DD guns as her SECONDARY
// battery while a DD's slot 1 takes the same guns as her MAIN one, so the first gun-taking
// slot is always "Main Gun" and any later one "Secondary". Checked against all 156 distinct
// (hull, slot, types) combinations, including submarines (deck gun in slot 3 still reads
// "Main Gun").
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

// A slot's short name used to collapse to whatever its FIRST type code meant, hiding real
// dual-purpose slots (Rikka Takarada's "Main Gun" slot also takes an Auxiliary). Every
// distinct short name across all of a slot's codes is now listed, with gun codes collapsed
// to the one gunLabel the caller already worked out.
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

// Built by hand since the two vocabularies are worded differently on purpose ("DD Main
// Guns" vs the catalog's "DD Gun"). Codes 6 and 21 are NOT the same permission despite an
// identical wiki label — 21 (Time Fuze AA Guns) is BB/BC/BBV only — and code 20 (Missiles)
// maps to the Torpedo category, split from ordinary torpedoes by equipmentOptionsForSlot.
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

// The Torpedo catalog page also lists two SY-1 missiles, but a missile is not a torpedo as
// far as slots go — type code 20 appears alone on exactly 4 slots and code 5 on 446, never
// together, so equipmentOptionsForSlot splits them into disjoint offers. Before this split,
// every plain torpedo slot was also offered SY-1A, which outscores every real torpedo.
//
// Every gear slot has a built-in weapon it uses when empty (slot.default, resolved against
// data/default-equipment.js, extracted from the wiki's User:ArdWar/DefaultEquips page).
// Resolves 2579 of 2583 slots that declare one — the 4 that don't (id 158) are undocumented
// on that page and degrade to no default rather than a guessed one.
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

// An item's own wiki page carries a "Used By" table marking every hull that may mount it —
// a real restriction the slot's type code doesn't express (a Destroyer's aux slot accepts
// Auxiliaries, but not an Anti-Torpedo Bulge). Only 145 of 581 records have that table, so
// an item without usedBy stays unrestricted; a "maybe" hull counts as allowed since the
// slot's own type already narrows it to the wiki's own named exceptions.
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

// Every numeric figure worth showing for an item, not just the one equipmentPrimaryStat()
// picks for a picker cell. A built-in default weapon uses a different schema
// (dpsLight/dpsMedium/dpsHeavy as flat fields, no rarity, no statBonus), so its DPS is read
// from there instead of being left blank.
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

// A skill's "Main/Secondary Gun", "AA Gun" or "Torpedo efficiency" bonus is the same
// multiplier the slot's own gear efficiency already is, just skill-granted — matched by
// weapon role (firepower/antiair/torpedo) rather than a raw category string so it reads
// built-in weapons the same way. A compound source ("Main Gun and Torpedo") applies
// wherever either half matches; sources this dataset never produces (Aircraft, Cannon)
// are left unmatched rather than guessed at.
// Three bonuses read as "unmapped" at extraction time because their text doesn't fit the
// TERM-before/after-"efficiency" shape modifierQualifier expects at all - "fighter
// efficiency" names no recognized source word, "efficiency of this ship's aircraft slots"
// puts the category after "efficiency" instead of before, and Béarn's "ITS efficiency"
// refers back to whichever slot her own equip condition names (slot 3), not a category.
// Named directly rather than stretching modifierQualifier to cover three unrelated shapes
// and risking every other modifier type's pill label along with them.
const WEAPON_EFFICIENCY_OVERRIDE_BY_SKILL = {
  "Hellcat's Roar": (ship, slotKey, item, role) => item.category === "Fighter",
  "Iron Blood Hawk": (ship, slotKey, item, role) => role.stat === "aviation",
  "Iron Blood Hawk+": (ship, slotKey, item, role) => role.stat === "aviation",
  "Sacrament: Holy Bombardment": (ship, slotKey) => slotKey === "3",
};

// Shared by weaponEfficiencyBonus and weaponDamageMultiplier: does a modifier's own
// source phrase (e.g. "Main Gun and Torpedo") cover this slot's weapon role? A modifier
// with no source at all applies everywhere. "Burn"/"Barrage"-sourced bonuses match no slot:
// barrages read theirs through barrageDamageMultiplier, Burn is not modelled.
function weaponModifierApplies(source, role, ship, slotKey) {
  if (!source) return true;
  const mainGunKey = shipGunSlotKeys(ship)[0];
  const parts = source.toLowerCase().split(/,|\band\b/).map(p => p.trim()).filter(Boolean);
  return parts.some(part => {
    if (part === "main gun") return role.stat === "firepower" && slotKey === mainGunKey;
    if (part === "secondary gun") return role.stat === "firepower" && slotKey !== mainGunKey;
    if (part === "cannon") return role.stat === "firepower";
    if (part === "aa gun") return role.stat === "antiair";
    if (part === "torpedo") return role.stat === "torpedo";
    if (part === "aircraft" || part === "airstrike") return role.stat === "aviation";
    return false;
  });
}

function weaponEfficiencyBonus(effective, ship, slotKey, item) {
  const role = weaponRole(item);
  if (!role || !effective) return 0;
  let bonus = 0;
  for (const modifier of effective.modifiers) {
    if (modifier.key !== "weaponEfficiency") continue;
    if (modifier.target === OPSI_TARGET && !inOperationSiren()) continue;
    const override = modifier.sources.map(s => WEAPON_EFFICIENCY_OVERRIDE_BY_SKILL[s.skill.name]).find(Boolean);
    if (override) {
      if (override(ship, slotKey, item, role)) bonus += modifier.amount;
      continue;
    }
    if (weaponModifierApplies(modifier.source, role, ship, slotKey)) bonus += modifier.amount;
  }
  return bonus;
}

// CriticalRate/CriticalModifier and DMG Dealt, from the Damage Calculations page's Critical
// Hits and Final Damage Dealt sections — the one other modifier family (besides
// weaponEfficiency) that skill text grants but nothing here ever multiplied into a slot's
// damage. A target-qualified bonus is skipped, except one restricted to armour classes and
// nothing else (Alvitr's "DMG Dealt +15% to Light Armor enemies"), which applies against that
// armour: the DPS column being computed, else the boss picked in Target; or one restricted to
// hull types and nothing else ("to enemy DDs and CLs"), which applies when the picked boss is one.
//
// CriticalRate's own formula needs the TARGET's Evasion/Luck: the boss picked in Target, or
// else a fixed reference target, the same unknown-opponent gap eHP solves with
// EHP_REFERENCE_ACCURACY/LUCK just below (whose Luck it shares). Both are averaged from the same
// composite boss (see EHP_REFERENCE_ACCURACY's comment), so a ship's eHP and crit rate here
// both answer "against a typical current raid boss", not two unrelated guesses.
const CRIT_REFERENCE_EVASION = 26;

// Precision over recall: "those Light Armor enemies" (Z47) or "Heavy armor with this ship's
// equipped torpedoes" (Harbin) carry a further restriction, so they do not match.
const ARMOR_ONLY_TARGET_RE = /^(?:to|against)\s+(?:enemies with\s+)?(light|medium|heavy)(?:\s+and\s+(light|medium|heavy))?\s+armou?r(?:\s+enemies)?$/i;
function targetsArmor(target, armor) {
  const match = armor ? ARMOR_ONLY_TARGET_RE.exec(target) : null;
  return Boolean(match && [match[1], match[2]].some(name => name && name.toLowerCase() === armor));
}

// Plural and spelled-out forms as skill text writes them; "Carriers" is left out on purpose,
// since it is unclear whether it covers CVLs.
const HULL_TARGET_TERMS = {
  dd: ["DD"], dds: ["DD"], destroyer: ["DD"], destroyers: ["DD"],
  cl: ["CL"], cls: ["CL"], "light cruiser": ["CL"], "light cruisers": ["CL"],
  ca: ["CA"], cas: ["CA"], "heavy cruiser": ["CA"], "heavy cruisers": ["CA"],
  cb: ["CB"], cbs: ["CB"], "large cruiser": ["CB"], "large cruisers": ["CB"],
  bc: ["BC"], bcs: ["BC"], battlecruiser: ["BC"], battlecruisers: ["BC"],
  bb: ["BB"], bbs: ["BB"], battleship: ["BB"], battleships: ["BB"],
  bbv: ["BBV"], bbvs: ["BBV"],
  cv: ["CV"], cvs: ["CV"], cvl: ["CVL"], cvls: ["CVL"],
  submarine: ["SS", "SSV"], submarines: ["SS", "SSV"]
};
function targetsHull(target, hull) {
  const list = target.replace(/^(?:to|against)\s+(?:enemy\s+)?/i, "");
  if (!hull || list === target) return false;
  const hulls = list.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(term => HULL_TARGET_TERMS[term.toLowerCase()]);
  return hulls.every(Boolean) && hulls.some(terms => terms.includes(hull));
}

// "to Sirens", or a list of nations that includes Sirens (King George V): only the Siren part is
// checked, since bosses carry no other nationality here.
const SIREN_TERM_RE = /^sirens?(?: ships)?$/i;
const NATION_TERMS = new Set(Object.keys(NATION_COLORS).map(name => name.toLowerCase()));
function targetsSirens(target) {
  if (!targetBoss || !targetBoss.siren) return false;
  const list = target.replace(/^(?:to|against)\s+/i, "");
  if (list === target) return false;
  const terms = list.split(/\s*,\s*(?:and\s+)?|\s+and\s+/);
  return terms.some(term => SIREN_TERM_RE.test(term)) &&
    terms.every(term => SIREN_TERM_RE.test(term) || NATION_TERMS.has(term.toLowerCase()));
}

function modifierTargetApplies(target, armor) {
  if (!target) return true;
  if (target === OPSI_TARGET) return inOperationSiren();
  return targetsArmor(target, armor) || targetsHull(target, targetBoss && targetBoss.hull) || targetsSirens(target);
}

function weaponDamageMultiplier(effective, ship, slotKey, item, armor = targetStats().armor) {
  const role = weaponRole(item);
  if (!role || !effective) return 1;
  return damageMultiplier(effective, armor, source => weaponModifierApplies(source, role, ship, slotKey));
}

// The client's damage formula (battleformulas.lua, CreateContextCalculateDamage) rolls crit and
// applies DMG Dealt and enemy-tag bonuses on every bullet, special barrages included; only a bonus
// tied to one weapon ("Main Gun", Super Heavy Shell's index [1]) stays on that weapon.
function barrageDamageMultiplier(effective, armor) {
  if (!effective) return 1;
  return damageMultiplier(effective, armor, source => !source || source.toLowerCase().split(/,|\band\b/).some(part => part.trim() === "barrage"));
}

function damageMultiplier(effective, armor, sourceApplies) {
  let critRateBonus = 0;
  let critDamageBonus = 0;
  let damageDealtBonus = 0;
  for (const modifier of effective.modifiers) {
    if (!modifierTargetApplies(modifier.target, armor)) continue;
    if (!sourceApplies(modifier.source)) continue;
    if (modifier.key === "critRate") critRateBonus += modifier.amount;
    else if (modifier.key === "critDamage") critDamageBonus += modifier.amount;
    else if (modifier.key === "damageDealt") damageDealtBonus += modifier.amount;
  }
  const accuracy = effective.stats.accuracy ? effective.stats.accuracy.value : 0;
  const luck = effective.stats.luck ? effective.stats.luck.value : 0;
  const critRate = Math.min(1, Math.max(0,
    0.05 +
    accuracy / (accuracy + targetStats().eva + 2000) +
    (luck - targetStats().luck) / 5000 +
    critRateBonus / 100
  ));
  const criticalModifier = 1 + critRate * (0.5 + critDamageBonus / 100);
  const damageDealtModifier = 1 + damageDealtBonus / 100;
  return criticalModifier * damageDealtModifier;
}

// The item's damage per second before any ship stat is applied — a stat-0 baseline verified
// against the catalog (dps.raw is exactly dmg x coef x roundsPerSec, no stat term), so the
// stat multiplier below isn't double-counting.
//
// The light/medium/heavy figures are used instead of dps.raw, since raw assumes a 100%
// armour modifier almost no real ammunition has (HE is punished against heavy armour,
// torpedoes rewarded) — this matters most when weighing a gun against a barrage of a
// different ammo type. raw is only the fallback for an item with no per-armour breakdown.
// `dps` is read before aaDps: aircraft carry both, and their aaDps is their air-combat figure,
// not the bombs or torpedoes their surface role scales off (equipmentOptimizeScore agrees).
function equipmentBaseDps(item, armor) {
  if (typeof item.dps === "number") return item.dps;
  const dps = item.dps;
  if (dps && typeof dps === "object") {
    const value = armorDamage([dps.light, dps.medium, dps.heavy], armor);
    if (value !== null) return value;
    if (typeof dps.raw === "number") return dps.raw;
  }
  if (typeof item.aaDps === "number") return item.aaDps;
  if (typeof item.aswDps === "number") return item.aswDps;
  return armorDamage([item.dpsLight, item.dpsMedium, item.dpsHeavy], armor);
}

// [light, medium, heavy] damage: the targeted armour's figure, or with no armour targeted the
// mean of the figures present, the armour-neutral default every DPS here is built on.
const ARMOR_COLUMN = { light: 0, medium: 1, heavy: 2 };
function armorDamage(columns, armor) {
  const values = columns.map(Number);
  if (armor && Number.isFinite(values[ARMOR_COLUMN[armor]])) return values[ARMOR_COLUMN[armor]];
  const present = values.filter(Number.isFinite);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

// The reference attacker eHP is measured against — the wiki's HitRate formula needs the
// SHOOTER's Accuracy and Luck, which this app has no source for. Averaged from 4 real
// level-125 raid bosses on mrlar.dev's own boss database (/db/static/json/maps.json), one
// per main hull type that has a clean (non-scripted) recent solo raid boss in that level
// range: Akagi META (CV, Hit 120/Eva 25/Luck 66), Lion (BB, 80/20/25), Pamiat' Merkuria META
// (CL, 120/60/40), Moskva (CA, 120/0/25) — DD has no comparable solo raid boss in this
// dataset, so it's left out rather than filled with an unrepresentative Extreme Challenge or
// templated event mini-boss. Moskva's Evasion 0 might itself be a scripted "cannot evade"
// mechanic rather than a true combat stat; kept in the average anyway since her Hit is
// otherwise a normal, non-scripted value. Average: Hit 110, Evasion 26.25, Luck 39.
const EHP_REFERENCE_ACCURACY = 110;
const EHP_REFERENCE_LUCK = 39;

// The boss picked in the Target menu (one BOSSES_DATA row, from mrlar.dev's maps.json), or null
// for the averaged reference boss above. Armour only applies once a real boss is picked.
let targetBoss = null;
const REFERENCE_TARGET = { hit: EHP_REFERENCE_ACCURACY, eva: CRIT_REFERENCE_EVASION, luck: EHP_REFERENCE_LUCK, armor: null };
function targetStats() {
  return targetBoss || REFERENCE_TARGET;
}

// HitRate = 0.1 + Hit/(Hit + Eva + 2) + (AttackerLuck - TargetLuck + LevelDiff)/1000,
// clamped to [0.1, 1]. Level difference is 0: the attacker is assumed to be the same level
// as the ship being looked at, even for a picked boss (a few levels move this by under 1%).
function referenceHitRate(evasion, luck) {
  const { hit, luck: attackerLuck } = targetStats();
  const raw =
    0.1 +
    hit / (hit + evasion + 2) +
    (attackerLuck - luck) / 1000;
  return Math.min(1, Math.max(0.1, raw));
}

// The wiki's eHP: HP / HitRate / prod(1 + resistance). Only imported auxiliary effects enter it:
// skill Evasion Rate and DMG Taken buffs mostly last seconds, and their uptime is not modelled yet.
function effectiveHp(effective) {
  const hp = effective.stats.health ? effective.stats.health.value : 0;
  const evasion = effective.stats.evasion ? effective.stats.evasion.value : 0;
  const luck = effective.stats.luck ? effective.stats.luck.value : 0;
  const hitRate = referenceHitRate(evasion, luck);
  let ehp = hp / hitRate;
  for (const effect of effective.itemEffects || []) {
    if (effect.key === "dodgeUptime") ehp /= 1 - effect.amount / 100;
    // Torpedo-only reductions stay out: nothing says what share of a boss's damage is torpedoes.
    else if (effect.key === "damageTaken" && !effect.source && reductionApplies(effect.target)) ehp /= 1 - effect.amount / 100;
  }
  return { ehp, hitRate };
}

function reductionApplies(target) {
  if (!target) return true;
  return target === "Sirens" && Boolean(targetBoss && targetBoss.siren);
}

// Damage a slot contributes per second: the item's own figure, times mounts, times
// efficiency, times the wiki's WeaponStatMultiplier (1 + ScalingStat/100), times the average
// Critical/DMG Dealt multiplier (weaponDamageMultiplier). WeaponScalingCoefficient stays at
// 1, so aircraft numbers run slightly optimistic since the Damage Calculations page gives
// 0.8 for some bombs/rockets the catalog doesn't distinguish.
function slotDamage(slot, item, effective, ship, slotKey, armor) {
  const role = weaponRole(item);
  if (!role) return null;
  const base = equipmentBaseDps(item, armor);
  if (base === null) return { metric: role.metric, value: 0, unknown: true };
  const statEntry = effective.stats[role.stat];
  const stat = statEntry ? statEntry.value : 0;
  const mounts = slot.mount || 1;
  const baseEfficiency = typeof slot.efficiency === "number" ? slot.efficiency : 1;
  const efficiency = baseEfficiency * (1 + weaponEfficiencyBonus(effective, ship, slotKey, item) / 100);
  const damageMultiplier = weaponDamageMultiplier(effective, ship, slotKey, item, armor);
  const reloadFactor = reloadDpsFactor(item, effectiveReload(effective));
  return { metric: role.metric, value: base * mounts * efficiency * (1 + stat / 100) * damageMultiplier * reloadFactor, unknown: false };
}

// Catalog DPS assumes Reload 100; the game scales only the reload part of a cycle by
// sqrt(200 / (RLD + 100)), not the volley time or the gun tables' absolute cooldown (none on
// built-in guns or torpedoes, whose figures were computed without one).
const GUN_ABSOLUTE_COOLDOWN = { "DD Gun": 0.3, "CL Gun": 0.3, "CA Gun": 0.3, "CB Gun": 0.3, "BB Gun": 0.2 };

function weaponCycle(item, reloadStat) {
  if (typeof item.reload !== "number" || item.reload <= 0) return null;
  const scale = Math.sqrt(200 / (Math.max(reloadStat, 0) + 100));
  return item.reload * scale + (item.volleyTime || 0) + (GUN_ABSOLUTE_COOLDOWN[item.category] || 0);
}

// Aircraft, AA and ASW reload by other formulas (Damage Calculations page), not modelled yet.
function reloadDpsFactor(item, reloadStat) {
  const role = weaponRole(item);
  if (!role || role.metric !== "dps" || role.stat === "aviation") return 1;
  const base = weaponCycle(item, 100);
  const live = weaponCycle(item, reloadStat);
  return base && live ? base / live : 1;
}

function effectiveReload(effective) {
  const entry = effective && effective.stats.reload;
  return entry ? entry.value : 100;
}

// DDs and CLs carry a default depth charge launcher intrinsic to the hull, not a slot
// (Anti-Submarine Warfare page: 60x2 damage, 6.32s/6.99s cooldown) — keyed by hullShort
// rather than read off ship.equipment. The two ids are the built-in table's own DC rows,
// matched by those exact figures; equipped depth charges add to this launcher rather than
// replacing it.
const INNATE_DEPTH_CHARGE_BY_HULL = { DD: 141, CL: 147 };

function innateDepthCharge(ship) {
  const id = INNATE_DEPTH_CHARGE_BY_HULL[ship.hullShort];
  return id ? DEFAULT_EQUIPMENT_BY_ID.get(id) || null : null;
}

// A barrage that fires every N main gun volleys is damage these figures used to ignore, and
// ignoring it made a ship handed a faster gun show a LOWER DPS despite firing it more often
// — it isn't a slot, so it's added here like the innate depth charge launcher above. The gun's
// cycle at live Reload is shared with weaponScoreForShip so Optimize scores what this displays.
function volleyBarrageDps(ship, effective, level, armor) {
  const barrage = volleyBarrage(ship, level, armor);
  if (!barrage) return 0;
  const key = shipGunSlotKeys(ship)[0];
  if (key == null) return 0;
  const gun = activeEquipmentForSlot(ship, key, ship.equipment[key]);
  if (!gun) return 0;
  const cycle = weaponCycle(gun, effectiveReload(effective));
  if (!cycle) return 0;
  return (volleyBarrageDamage(barrage, effective, null, armor) / barrage.n) / cycle;
}

// The four headline figures. Every slot contributes through whatever it actually fights
// with - the equipped item if there is one, otherwise the ship's built-in weapon - so a
// ship with an empty loadout still reports the damage she really does. Surface DPS is against
// one armour class when `armor` names it, the mean of the three otherwise.
function computeCombatMetrics(ship, level, effective, armor) {
  const totals = { dps: 0, dpsAA: 0, dpsASW: 0 };
  let unknownSlots = 0;
  for (const [slotKey, slot] of Object.entries(ship.equipment || {})) {
    const item = activeEquipmentForSlot(ship, slotKey, slot);
    if (!item) continue;
    const contribution = slotDamage(slot, item, effective, ship, slotKey, armor);
    if (!contribution) continue;
    if (contribution.unknown) { unknownSlots++; continue; }
    totals[contribution.metric] += contribution.value;
  }

  const launcher = innateDepthCharge(ship);
  if (launcher) {
    const contribution = slotDamage({ mount: 1, efficiency: 1 }, launcher, effective, ship, null, armor);
    if (contribution && !contribution.unknown) totals[contribution.metric] += contribution.value;
  }

  const barrageDps = volleyBarrageDps(ship, effective, level, armor);
  totals.dps += barrageDps;

  const { ehp, hitRate } = effectiveHp(effective);

  return {
    dps: totals.dps,
    dpsAA: totals.dpsAA,
    dpsASW: totals.dpsASW,
    ehp,
    hitRate,
    unknownSlots,
    volleyBarrageDps: barrageDps,
    innateDepthCharge: Boolean(launcher),
  };
}

// Hull role drives which weight profile and slot-specific logic (CV aircraft orientation,
// the AA gun's fast/slow pick, BB skipping survivability) Optimize applies below, read off
// hullShort per the user's own breakdown of how each role gears up.
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

// AA guns split into two playstyles: a few fast, low-damage guns that always have a target,
// and most which hit harder but reload slower. "Fast" is simply below the AA Gun category's
// own median reload (0.32s-1.97s, median 0.9s) — measured from the catalog, not guessed.
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

// An equip-gated bonus only moves a pick if it reaches weaponScoreForShip's math at all —
// a NUMERIC_STAT_KEYS entry, weaponEfficiency, and now critRate/critDamage/damageDealt all
// do (weaponDamageMultiplier), which is exactly the shape of Ägir/Jean Bart/Murmansk/
// Pensacola/Richelieu/Tallinn/Zara's own "if equipped with a HE/AP main gun" bonuses.
function shipHasSeekableEquipGate(ship) {
  for (const skill of ship.skills || []) {
    const plainDesc = skill.description ? stripHtml(skill.description) : "";
    for (const b of skill.statBonuses || []) {
      const isSelf = b.scope === "self" || (b.raw && SELF_LANGUAGE_RE.test(b.raw));
      const isSeekable = (b.stats || []).some(k =>
        NUMERIC_STAT_KEYS.includes(k) || k === "weaponEfficiency" || k === "critRate" || k === "critDamage" || k === "damageDealt");
      if (!isSelf || !isSeekable) continue;
      const clause = equipConditionClauseForRaw(plainDesc, b.raw);
      if (clause && parseEquipCondition(clause)) return true;
    }
  }
  return false;
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

// "Low AA" is read off the whole roster rather than an arbitrary flat number: base AA at
// level 125, ranked against every other ship, cached once since it's the same lookup for
// all. A ship below the median with no AA-boosting skill wants a fast gun that always has
// something to shoot, rather than a hard-hitting one she's slow to use.
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

// A BB/BC/BM/BBV's special barrage is either a per-shot roll ("chance to fire a barrage")
// or a fixed timer ("every 15s: fires"), and which one she has decides whether her guns/aux
// chase firing frequency or raw per-shot power. "Proc" is checked before "timer" since a
// gated timer reads as a proc first — verified against all 149 BB-family ships (77 proc, 15
// timer, 57 neither).
const BARRAGE_PROC_RE = /\d+%\s*\(\d+%\)\s*chance\s+to\s+(?:launch|fire|trigger)\b.{0,60}?\bbarrage/i;
const BARRAGE_TIMER_RE = /\bevery\s+\d+(?:\.\d+)?s\b.{0,80}?\b(?:fires?|launches?)\b.{0,40}?\bbarrage/i;
function shipBarrageTriggerType(ship) {
  const texts = (ship.skills || []).map(sk => stripHtml(sk.description || ""));
  if (texts.some(t => BARRAGE_PROC_RE.test(t))) return "proc";
  if (texts.some(t => BARRAGE_TIMER_RE.test(t))) return "timer";
  return null;
}

// How a skill switches on decides what its ship should carry, so the optimiser reads the
// activation clause rather than the effect (full vocabulary in CLAUDE.md) — a barrage
// costing "every N times the main gun is fired" is paid for in VOLLEYS, so it's worth a
// fixed share of every volley, letting a fast gun beat a harder-hitting one on arithmetic
// rather than a rule. The pair in "Every 15 (10) times" takes the max-level figure, the
// same as renderLevelValues() does.
const MAIN_GUN_VOLLEY_RE = /\bevery\s+(\d+)\s*(?:\((\d+)\))?\s*(?:nd|rd|th|st)?\s*times?\b[^.]{0,45}?\bmain\s+gun/i;

// Limit break ranks unlock at these levels. They are three of the level control's own
// notches, which is what makes the control read as a progression rather than a scale.
const LIMIT_BREAK_LEVEL = { first: 30, second: 70, third: 100 };

// A barrage row tagged "enhanced" is the post-limit-break version of its skill's barrage,
// replacing its untagged rows rather than adding to them (Kumano: 15x30 before her third
// limit break, 15x35 plus a piercing volley after, never both). Which rank grants the
// upgrade is read off each ship's own wiki page — the Third for 22 of 23 ships whose table
// names one outright (Kronshtadt's own FIRST rank does instead), and the Third by default
// for the rest, who reach it through a mount/aircraft count their table already puts there.
const BARRAGE_ENHANCED_AT_LEVEL = { "Kronshtadt": LIMIT_BREAK_LEVEL.first };

function barrageEnhancedLevel(ship) {
  return BARRAGE_ENHANCED_AT_LEVEL[ship.displayName] || LIMIT_BREAK_LEVEL.third;
}

// What a row's trigger says beyond plain enhanced/unenhanced: rows sharing a qualifier are
// components of one pattern, rows with different qualifiers are alternatives the ship
// picks between (Azuma fires her Close OR Far pattern, never both — summing them doubled
// her barrage). The wiki sometimes writes the attack's own name into the trigger too ("All
// Out Assault enhanced"), which isn't a condition and is stripped first.
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

// The rows that actually fire at this level — within one skill, enhanced rows REPLACE the
// plain ones from the upgrade level onward, since counting both added a barrage to its own
// replacement. A skill whose rows are ALL enhanced has no recorded "before" (3 of 56 such
// groups), so its rows always show rather than vanishing.
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
// row's own DMG columns carry — Algérie META's enhanced barrage reads SMALLER than the one
// it replaces (8x25 vs 12x40) only because the columns miss the burn it sets (186 DMG every
// 1.5s for 8s, ~1000 damage). Two shapes occur, a scaling one and a flat one, each written
// as a per-tick figure behind a chance prefix; only Burn and Flood are read, since
// everything else an effect can say is a debuff on a target this app never models.
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
// matcher backwards — where a ship has more than one such barrage, the one worth most PER
// VOLLEY wins (a small barrage every 2 volleys can beat a large one every 10). Cached per
// level-bracket rather than per level, since a limit break is the only thing that can
// change which rows fire.
function volleyBarrage(ship, level, armor) {
  const upgraded = (level || 0) >= barrageEnhancedLevel(ship);
  const cacheKey = ship.id + (upgraded ? "@lb" : "") + (armor ? "@" + armor : "");
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
      // A row is only counted when it plainly belongs to this trigger — one whose name
      // carries a qualifier past the skill name is either an alternative (Asuka fires ONE
      // of "New Link Chance! (Variant 1..5)", not all five) or a second trigger the same
      // skill also has ("Happy D (every 5s)" alongside her every-2-volleys attack), so
      // summing it would hand the ship a gun she doesn't want — unless the row's own
      // trigger names the main gun outright. Costs 8% of the counted damage roster-wide,
      // leaving 502 of 507 ships with a figure.
      const suffix = b.skillName.toLowerCase().startsWith(skill.name.toLowerCase())
        ? b.skillName.slice(skill.name.length)
        : b.skillName;
      if (/\([^)]+\)/.test(suffix) && !/main gun/i.test(b.trigger || "")) continue;
      // The Light/Medium/Heavy columns of the Barrages table, read through armorDamage() like
      // equipmentBaseDps() reads gear (averaged unless an armour is targeted), each including the
      // row's own Count. The alternative, Count x Base DMG, is the pre-armour figure
      // instead, and the gap isn't constant (0.567x for an armour-punished barrage like
      // Jintsuu's to 1.200x for a rewarded one like Prinz Eugen mu's torpedoes) — it
      // decides which ships deserve a faster gun, not merely how big the term is.
      const armourDamage = armorDamage([b.lightDmg, b.mediumDmg, b.heavyDmg], armor);
      const rowDamage = (armourDamage ?? (Number(b.count) || 0) * (Number(b.baseDmg) || 0)) * share;
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

// Most volley barrages scale off Firepower exactly as the gun does, but 83 rows across 64
// ships scale off Torpedo instead (a destroyer whose All Out Assault launches torpedoes),
// so each term keeps its own stat and the wiki's own coefficient rather than assuming
// Firepower for all. A row whose stat isn't tracked here contributes its flat damage only,
// and `item` is the gun under consideration — its own stat bonus lifts the barrage too.
function volleyBarrageDamage(barrage, effective, item, armor = targetStats().armor) {
  let total = 0;
  for (const term of barrage.terms) {
    const entry = term.stat ? effective.stats[term.stat] : null;
    const stat = (entry ? entry.value : 0) + (item ? itemStatBonus(item, term.stat) : 0);
    total += term.damage * (1 + term.multiplier * stat / 100);
  }
  return total * barrageDamageMultiplier(effective, armor);
}

function findEquipmentByName(name) {
  return EQUIPMENT_DATA.find(i => i.name === name) || null;
}

// Repair Toolkit's own passive HP regen is real value the single-hit eHP formula can't
// represent, so a candidate whose notes promise it gets a deliberate score bump on top of
// its eHP. Matched on the notes' own wording rather than hardcoded to one item's id —
// checked dataset-wide, only Repair Toolkit and the unrelated Elixir mention HP recovery at
// all, and Elixir's phrasing doesn't match.
const HP_REGEN_NOTES_RE = /recovers?\s+\d+(?:\.\d+)?%\s+of\s+(?:this ship'?s\s+)?max\s*HP\s+every\s+\d+(?:\.\d+)?s/i;
function itemGrantsHpRegen(item) {
  return !!(item && item.notes && HP_REGEN_NOTES_RE.test(item.notes));
}
const HP_REGEN_SCORE_BONUS = 1.15;

// Simulates equipping one candidate and reads back the REAL resulting eHP, rather than
// approximating from the item's own flat numbers, since a flat bonus is amplified by the
// ship's own skill percentages before it becomes real eHP. Cheap enough to call per
// candidate since this only runs from an explicit Optimize click, never on render.
function candidateEhp(ship, slotKey, item) {
  const original = getEquippedGear(ship, slotKey);
  setEquippedGear(ship, slotKey, item);
  const eff = computeEffectiveStats(ship, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
  let { ehp } = effectiveHp(eff);
  if (itemGrantsHpRegen(item)) ehp *= HP_REGEN_SCORE_BONUS;
  if (original) setEquippedGear(ship, slotKey, original);
  else setEquippedGear(ship, slotKey, null);
  return ehp;
}

const DPS_STAT_KEYS = new Set(["firepower", "torpedo", "reload"]);

// Only weighted stats are simulated, or Type 93's +118 Torpedo would ride in on its +13 Reload
// for a CA that ignores Torpedo. The scale (the catalog's top bonus to the main stat) keeps a
// Firepower auxiliary at its old stat-share score.
function dpsStatWeight(key, weights) {
  return key === "reload" ? Math.max(weights.firepower || 0, weights.torpedo || 0) : weights[key] || 0;
}

// Imported auxiliary effects all act on the Main Gun so far, which Firepower's weight stands for.
function dpsEffectWeight(effect, weights) {
  return effect.source === "Main Gun" ? dpsStatWeight("firepower", weights) : 0;
}

function slotDpsGains(ship, slotKey, candidates, level, weights) {
  const dpsWith = item => {
    const original = getEquippedGear(ship, slotKey);
    setEquippedGear(ship, slotKey, item);
    const eff = computeEffectiveStats(ship, level, retrofitApplied, augmentApplied, fateSimApplied);
    const dps = computeCombatMetrics(ship, level, eff, targetStats().armor).dps;
    setEquippedGear(ship, slotKey, original || null);
    return dps;
  };
  const byItem = new Map();
  const base = dpsWith(null);
  const refKey = (weights.torpedo || 0) > (weights.firepower || 0) ? "torpedo" : "firepower";
  if (base <= 0 || !dpsStatWeight(refKey, weights)) return { byItem, scale: 0 };
  const reference = { id: "reference", name: "", category: "Auxiliary", statBonus: { [refKey]: auxiliaryStatMaxima()[refKey] } };
  let scale = dpsWith(reference) / base - 1;
  for (const item of candidates) {
    const weighted = Object.entries(item.statBonus || {}).filter(([rawKey]) => {
      const key = EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey;
      return DPS_STAT_KEYS.has(key) && dpsStatWeight(key, weights) > 0;
    });
    const effects = (item.effects || []).filter(effect => dpsEffectWeight(effect, weights) > 0);
    if (!weighted.length && !effects.length) continue;
    const gain = dpsWith({ ...item, statBonus: Object.fromEntries(weighted), effects }) / base - 1;
    byItem.set(item, gain);
    if (scale <= 0 && gain > 0) scale = gain;
  }
  return { byItem, scale };
}

// A self bonus gated on "if equipped with X" only unlocks once X is actually equipped, so
// scoring every candidate against one effective snapshot (frozen at whatever happened to
// already be in the slot) can never let a candidate's own bonus win or lose it. Simulated
// per candidate exactly like candidateEhp above, and only called for ships that carry this
// shape at all (shipHasSeekableEquipGate) — every other ship keeps the cheap, shared effective.
function weaponCandidateEffective(ship, slotKey, item, level) {
  const original = getEquippedGear(ship, slotKey);
  setEquippedGear(ship, slotKey, item);
  const eff = computeEffectiveStats(ship, level, retrofitApplied, augmentApplied, fateSimApplied);
  if (original) setEquippedGear(ship, slotKey, original);
  else setEquippedGear(ship, slotKey, null);
  return eff;
}

const SURVIVAL_STAT_KEYS = new Set(["health", "evasion", "luck"]);
const SURVIVAL_EFFECT_KEYS = new Set(["dodgeUptime", "damageTaken"]);
// CA is the one role given an explicit override: almost only HP-boosting auxiliaries, not
// the general eHP simulation every other role gets (which already favors HP over Evasion
// for most hulls on its own). A CA's candidate pool is narrowed to items granting HP at
// all, rather than opened to pure-Evasion options the simulation might otherwise prefer.
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

// Two rules drive every weight below: survivability comes first, then AA (a real weight on
// health/evasion everywhere, even offense-only builds — BB is the deliberate exception),
// and optimizing means amplifying what a ship already does well, not patching a weakness
// (except survivability, which everyone wants) — which is why "recommended"'s offensive
// weight comes from the ship's own strongest scaling stat.
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
// hardcoded hull list, so an unusual loadout isn't forced into the wrong orientation.
// Carriers get three dedicated aircraft orientations instead of one generic "Aviation",
// since Fighter/Dive Bomber/Torpedo Bomber all scale off the same stat and a single weight
// can't tell them apart.
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

// "Recommended" weighs survivability and AA as a floor plus whichever scaling stat the ship
// is already best at, as a share of her own total — except CL (leans on Anti-Air, her usual
// fleet role), CA (leans on Firepower and HP over Evasion, a tank amplifies damage not
// dodge), and BB (drops survivability to near zero), per the user's own per-role breakdown.
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

// Auxiliary bonuses sit on wildly different scales (a few hundred HP vs. a dozen Evasion),
// so each is expressed as a share of the largest bonus available for that stat — otherwise
// a weight of 1 on Evasion could never outrank 0.1 on Health. Computed lazily rather than
// at load, since EQUIPMENT_STAT_KEY_ALIASES is declared later in the file and reading it
// from a top-level IIFE here throws on the temporal dead zone.
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

// HP/Evasion/Luck can't be ranked by raw magnitude the way Firepower can, since Evasion has
// diminishing returns baked into the HitRate formula — that comparison is exactly what put
// a flat 640 HP item ahead of a smaller HP+Evasion item on Roon, when a real simulation
// shows the latter is ahead by ~1400 eHP. So every aux slot compares survival-stat
// candidates by simulated eHP instead of the proportional-to-maximum heuristic the other
// stats still use.
// Firepower/Torpedo/Reload go through simulated DPS too (slotDpsGains): Reload's worth depends on
// the weapons carried, so it has no fixed exchange rate with Firepower.
function statPreferenceScore(item, weights, ship, slotKey, baseEhp, dpsGains) {
  const maxima = auxiliaryStatMaxima();
  const bonus = item.statBonus || {};
  let score = 0;
  let hasSurvivalStat = false;
  let dpsWeight = 0;
  if ((item.effects || []).some(effect => SURVIVAL_EFFECT_KEYS.has(effect.key))) hasSurvivalStat = true;
  for (const [rawKey, amount] of Object.entries(bonus)) {
    const key = EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey;
    if (SURVIVAL_STAT_KEYS.has(key)) { hasSurvivalStat = true; continue; }
    const weight = DPS_STAT_KEYS.has(key) ? dpsStatWeight(key, weights) : weights[key];
    if (!weight || typeof amount !== "number") continue;
    if (dpsGains && DPS_STAT_KEYS.has(key)) { dpsWeight = Math.max(dpsWeight, weight); continue; }
    score += weight * (amount / (maxima[key] || amount));
  }
  if (dpsGains) {
    for (const effect of item.effects || []) dpsWeight = Math.max(dpsWeight, dpsEffectWeight(effect, weights));
  }
  if (dpsWeight && dpsGains.scale > 0) {
    const gain = dpsGains.byItem.get(item) || 0;
    if (gain > 0) score += dpsWeight * (gain / dpsGains.scale);
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

// What Optimize maximizes: the slot's own damage figure, ignoring rarity — in 4 of 14
// categories the highest-rarity item isn't the strongest, so taking the top of
// sortEquipmentOptions would pick wrong. Guns carry dps.raw (pre-armor); torpedoes/aircraft
// have neither raw nor armorMod so the light/medium/heavy mean stands in, and Auxiliaries
// score null since there's no way to rank HP against Evasion without knowing player intent.
function equipmentOptimizeScore(item) {
  if (item.dps) {
    // Against a picked boss its own armour column decides, not the pre-armour raw figure.
    if (targetBoss) {
      const value = armorDamage([item.dps.light, item.dps.medium, item.dps.heavy], targetBoss.armor);
      if (value !== null) return value;
    }
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
// ship had no Firepower — a weapon is scored instead the way computeCombatMetrics renders
// it, WeaponStatMultiplier with the item's own stat bonus added in, since mounts/efficiency
// are equal for every candidate in a slot and don't affect the order. Two second-order
// effects are knowingly ignored: a gun's Firepower bonus also lifts the ship's other slots,
// and picks are made slot by slot rather than jointly.
//
// barragePerVolley is what this ship's volley-triggered barrage adds to each main gun
// volley (0 for every other slot/ship) — divided by the candidate's own cycle time and
// added before the stat multiplier, since these barrages scale off Firepower exactly as
// the gun does.
//
// slotFactor (mounts x efficiency) used to be left out since it multiplies every candidate
// in a slot equally — true until the barrage term arrived: a gun fires from every mount
// while the barrage is one fixed pattern neither touches, and omitting it handed 137 ships
// a weaker gun. It also keeps this identical to slotDamage(), which is what makes the
// optimiser and displayed DPS agree.
//
// ship/slotKey are only needed for weaponDamageMultiplier's crit/DMG Dealt lookup; a caller
// with no ship in scope (there is none today) can omit them and score without that factor.
function weaponScoreForShip(item, damage, effective, barragePerVolley, slotFactor, ship, slotKey) {
  const role = weaponRole(item);
  if (!role || !effective) return damage;
  const entry = effective.stats[role.stat];
  const stat = (entry ? entry.value : 0) + itemStatBonus(item, role.stat);
  const damageMultiplier = ship ? weaponDamageMultiplier(effective, ship, slotKey, item) : 1;
  const reload = effectiveReload(effective) + itemStatBonus(item, "reload");
  let dps = damage * (slotFactor || 1) * (1 + stat / 100) * damageMultiplier * reloadDpsFactor(item, reload);
  if (barragePerVolley) {
    const cycle = weaponCycle(item, reload);
    if (cycle) dps += barragePerVolley / cycle;
  }
  return dps;
}

// Global, like the Skills tab's Max Level state: it survives switching ships, because a
// player comparing two ships means the same cap on both.
let equipmentRarityCap = "Ultra Rare";
let equipmentTarget = "auto";
// Gear Lab and Research flags both mean "obtainable ONLY that way" — gear also buyable or
// farmable is unaffected by turning a source off, since a player who hasn't unlocked either
// just wants it out of the optimizer's reach. They still show in the picker, since this is
// about what the player has, not what the ship may mount.
let includeGearLab = true;
let includeResearch = true;

function equipmentWithinCap(item) {
  return EQUIPMENT_RARITY_ORDER.indexOf(item.rarity) <= EQUIPMENT_RARITY_ORDER.indexOf(equipmentRarityCap);
}

// Per slot, the highest-scoring option at or below the cap; a slot with no scored options
// (Auxiliary) or nothing under the cap is left untouched rather than clearing a pick the
// user made by hand. A handful of skills name a specific item (Jean Bart's Quadruple 380mm,
// Helena's SG Radar) — Optimize prefers a named item over an unnamed one ahead of any
// score, and a `unique` item is off the table entirely unless named by THIS ship's own
// skill.
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
// A weapon slot has one sensible answer — the biggest damage figure — so the goal only
// decides the auxiliary slots (which have no damage figure) and whether ASW is on the table
// at all. Candidates rank on three keys in order, since later ones are only comparable
// within the earlier: weapon-slot damage first, then a skill-named item over an unnamed
// one, then score.
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

function bestAircraftForSlot(ship, slotKey, slot, categories, effective, filterItem, named, level, seekEquipGate) {
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
    const itemEffective = seekEquipGate ? weaponCandidateEffective(ship, slotKey, item, level) : effective;
    const baseEfficiency = typeof slot.efficiency === "number" ? slot.efficiency : 1;
    const efficiency = baseEfficiency * (1 + weaponEfficiencyBonus(itemEffective, ship, slotKey, item) / 100);
    const slotFactor = (slot.mount || 1) * efficiency;
    let score = weaponScoreForShip(item, damage, itemEffective, 0, slotFactor, ship, slotKey);
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

// Fighter/Dive Bomber/Torpedo Bomber all scale off the same Aviation stat, so a slot's own
// accepted categories — not a stat weight — decide what differs between them; a picked
// orientation tries every eligible slot for that family first, falling back to whatever the
// slot accepts. "Recommended" instead spreads the three families across her slots,
// best-efficiency slot first, and only offers Torpedo Bomber where nothing else fits unless
// the ship can actually slow an enemy.
function pickCarrierAircraft(ship, effective, orientation, filterItem, named, level, seekEquipGate) {
  const slots = Object.entries(ship.equipment || {})
    .map(([key, slot]) => ({ key, slot, categories: slotAircraftCategories(slot, ship) }))
    .filter(s => s.categories.length > 0);
  const picks = {};
  if (!slots.length) return picks;

  if (orientation === "fighter" || orientation === "bomber" || orientation === "torpedo") {
    const preferred = CV_ORIENTATION_CATEGORIES[orientation];
    for (const s of slots) {
      const wantCats = s.categories.filter(c => preferred.includes(c));
      picks[s.key] = bestAircraftForSlot(ship, s.key, s.slot, wantCats.length ? wantCats : s.categories, effective, filterItem, named, level, seekEquipGate);
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
    picks[s.key] = bestAircraftForSlot(ship, s.key, s.slot, chosen, effective, filterItem, named, level, seekEquipGate);
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
  const seekEquipGate = shipHasSeekableEquipGate(ship);
  const barrageTrigger = role === "bb" ? shipBarrageTriggerType(ship) : null;
  // Only the FIRST gun slot fires the barrage: the trigger counts main gun volleys,
  // and a later gun slot is a secondary battery (see EQUIPMENT_SHORT_NAMES).
  const volley = volleyBarrage(ship, level, targetStats().armor);
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
    ? pickCarrierAircraft(ship, effective, targetDef.carrierOrientation || "auto", filterItem, named, level, seekEquipGate)
    : {};

  const usedAuxNames = new Set();
  const weaponShortlists = new Map();
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

  // Exactly one aux slot is reserved for a guaranteed survivability pick — skipped for BB
  // (near-zero survivability weight already covers it), carriers (no survivability tool in
  // Recommended, see the Steam Catapult preference below), and submarines (Oxygen-driven,
  // handled by subPicks). Real eHP is simulated per candidate rather than approximated,
  // since a flat bonus is amplified by the ship's own skill percentages before it becomes
  // real eHP.
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
    const dpsGains = isAuxSlot
      ? slotDpsGains(ship, slotKey, equipmentOptionsForSlot(slot, ship).filter(filterItem), level, weights)
      : null;

    let best = null;
    const weaponCandidates = [];
    for (const item of equipmentOptionsForSlot(slot, ship)) {
      if (!filterItem(item)) continue;
      // Auxiliaries stacking the same passive on one ship is a bug, not a feature — most
      // say "Effect does not stack" and rarely benefit from two copies. A carrier's two aux
      // slots are the deliberate exception: Steam Catapult, the strongest non-unique
      // Aviation auxiliary, is meant to fill both.
      const isCarrierCatapult = role === "carrier" && item.name === "Steam Catapult";
      if (isAuxSlot && item.category === "Auxiliary" && usedAuxNames.has(item.name) && !isCarrierCatapult) continue;

      const damage = isBbAntiAir ? null : equipmentOptimizeScore(item);
      const isWeapon = damage !== null;
      let score;
      if (isBbAntiAir) score = bbAntiAirScore(item);
      else if (isWeapon) {
        const itemEffective = seekEquipGate ? weaponCandidateEffective(ship, slotKey, item, level) : effective;
        const barragePerVolley = slotKey === mainGunSlotKey
          ? volleyBarrageDamage(volley, itemEffective, item) / volley.n
          : 0;
        const baseEfficiency = typeof slot.efficiency === "number" ? slot.efficiency : 1;
        const efficiency = baseEfficiency * (1 + weaponEfficiencyBonus(itemEffective, ship, slotKey, item) / 100);
        const slotFactor = (slot.mount || 1) * efficiency;
        score = weaponScoreForShip(item, damage, itemEffective, barragePerVolley, slotFactor, ship, slotKey);
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
        score = statPreferenceScore(item, weights, ship, slotKey, baseEhp, dpsGains);
        if (isCarrierCatapult) score += 1;
      }
      if (!isWeapon && !isBbAntiAir && score <= 0) continue;
      const candidate = { item, isWeapon: isWeapon || isBbAntiAir, isNamed: named.has(item.name), score };
      if (isWeapon && !isBbAntiAir) weaponCandidates.push(candidate);
      if (betterCandidate(candidate, best)) best = candidate;
    }
    if (!best) continue;
    setEquippedGear(ship, slotKey, best.item);
    if (isAuxSlot && best.item.category === "Auxiliary") usedAuxNames.add(best.item.name);
    changed++;
    // The role rules above (CB caliber, fast AA) cut a wrong-class candidate's score far below the
    // pick, so the score floor keeps them out; a proc-barrage BB gun is ranked on reload, which no
    // simulated figure measures, and a skill-named pick is absolute.
    const procGun = barrageTrigger === "proc" && GUN_TYPE_CODES.has((slot.type || [])[0]);
    if (best.isWeapon && !isBbAntiAir && !best.isNamed && !procGun && best.score > 0) {
      const shortlist = weaponCandidates
        .filter(c => c.item !== best.item && c.score >= best.score * WEAPON_SHORTLIST_FLOOR)
        .sort((a, b) => b.score - a.score)
        .slice(0, WEAPON_SHORTLIST_SIZE)
        .map(c => c.item);
      if (shortlist.length) weaponShortlists.set(slotKey, shortlist);
    }
  }

  // The Augment Module slot scores exactly like an auxiliary — same weights, same
  // proportional-to-maximum/real-eHP split via statPreferenceScore — reusing "augment" as
  // the slot key in the same equippedGear map every other gearCtx already uses.
  const augmentOptions = augmentOptionsForShip(ship).filter(filterItem);
  if (augmentOptions.length) {
    const baseAugEhp = candidateEhp(ship, "augment", null);
    const augDpsGains = slotDpsGains(ship, "augment", augmentOptions, level, weights);
    let bestAug = null, bestAugScore = -Infinity;
    for (const item of augmentOptions) {
      const score = statPreferenceScore(item, weights, ship, "augment", baseAugEhp, augDpsGains);
      if (score > bestAugScore) { bestAugScore = score; bestAug = item; }
    }
    if (bestAug) {
      setEquippedGear(ship, "augment", bestAug);
      changed++;
    }
  }

  refineWeaponPicks(ship, level, weaponShortlists);

  // Some aux slots also carry a built-in gun (Royal James's slot 3), so an auxiliary there costs
  // that gun. Slot scores cannot weigh one against the other, so compare the real loadouts instead:
  // each figure's relative change, weighted the way this target weighs the stat behind it.
  // Submarines are left out: their auxiliaries follow the Oxygen rule above, which no figure here measures.
  const outcomeWeights = [
    ["dps", Math.max(weights.firepower || 0, weights.torpedo || 0, weights.aviation || 0)],
    ["ehp", Math.max(weights.health || 0, weights.evasion || 0)],
    ["dpsAA", weights.antiair || 0],
    ["dpsASW", weights.asw || 0]
  ];
  const loadoutMetrics = () => computeCombatMetrics(ship, level,
    computeEffectiveStats(ship, level, retrofitApplied, augmentApplied, fateSimApplied), targetStats().armor);
  for (const slotKey of auxSlotKeys) {
    const item = getEquippedGear(ship, slotKey);
    const builtIn = defaultEquipmentForSlot(ship.equipment[slotKey]);
    if (role === "sub" || !item || weaponRole(item) || !builtIn || !weaponRole(builtIn)) continue;
    const withAuxiliary = loadoutMetrics();
    setEquippedGear(ship, slotKey, null);
    const withGun = loadoutMetrics();
    const gain = outcomeWeights.reduce((sum, [key, weight]) =>
      weight && withGun[key] ? sum + weight * (withAuxiliary[key] / withGun[key] - 1) : sum, 0);
    if (gain > 0) setEquippedGear(ship, slotKey, item);
    else changed--;
  }
  return changed;
}

// Slot-by-slot picks cannot see that one weapon's stat bonus also feeds the other weapons and the
// barrage (Chen Hai lost a fifth of her DPS to that). Each weapon slot is re-picked from its
// shortlist on the whole ship's figure for that weapon's metric, the others held, until stable.
const WEAPON_SHORTLIST_SIZE = 6;
const WEAPON_SHORTLIST_FLOOR = 0.6;

function refineWeaponPicks(ship, level, shortlists) {
  const metricValue = metric => computeCombatMetrics(ship, level,
    computeEffectiveStats(ship, level, retrofitApplied, augmentApplied, fateSimApplied), targetStats().armor)[metric];
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const [slotKey, shortlist] of shortlists) {
      const current = getEquippedGear(ship, slotKey);
      if (!current) continue;
      const metric = weaponRole(current).metric;
      let best = current;
      let bestValue = metricValue(metric);
      for (const item of shortlist) {
        if (item === current || weaponRole(item).metric !== metric) continue;
        setEquippedGear(ship, slotKey, item);
        const value = metricValue(metric);
        if (value > bestValue * (1 + 1e-9)) { best = item; bestValue = value; }
      }
      setEquippedGear(ship, slotKey, best);
      if (best !== current) moved = true;
    }
    if (!moved) break;
  }
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

// AUGMENTS_DATA's own statBonus keys are already canonical (built that way from mrlar.dev's
// raw hp/fp/trp/aa/avi/rld/hit/eva/luck/asw at data-build time), so no alias map is needed
// the way equipment's EQUIPMENT_STAT_KEY_ALIASES is. Named by the ship's own augmentModules
// string, which is always the wiki's own spelling and matches every catalog entry exactly.
// An augment shares equipmentPrimaryStat/equipmentStatRows/equipmentIconImg's existing
// {id, name, rarity, statBonus} shape (the same one an Auxiliary item with no dps already
// has), so it is stored under slotKey "augment" in the SAME equippedGear map as real gear
// rather than a parallel one - the generic tile/picker/tooltip code and Clear button all
// already work on any slot key without changes.
let augmentByNameCache = null;
function augmentByName(name) {
  if (!augmentByNameCache) augmentByNameCache = new Map(AUGMENTS_DATA.map(a => [a.name, a]));
  return augmentByNameCache.get(name) || null;
}

function augmentOptionsForShip(ship) {
  if (typeof AUGMENTS_DATA === "undefined") return [];
  return (ship.augmentModules || []).map(augmentByName).filter(Boolean);
}

// data/equipment.js spells Anti-Air "antiAir"; STAT_GRID spells it "antiair" — without
// this alias the 106 catalog entries carrying an AA bonus would silently contribute
// nothing. "oxygen" has no alias on purpose, since the stat grid doesn't track Oxygen at
// all.
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

// The panel is centred on its own 7rem card but is far wider, so opened from an edge slot
// it hangs outside the Equipment row and gets clipped — a margin shift keeps the CSS
// centring as the default and corrects only the edge cases. The first measurement lands a
// few px short since the panel's own scrollbar hasn't settled, so one correction pass on
// the next frame accumulates onto the current margin rather than recomputing from zero.
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

// Grouped by content (campaign, META, Arbiter, events), the order data/bosses.js already has.
function syncBossOptions() {
  if (modalEquipmentBoss.options.length) return;
  modalEquipmentBoss.appendChild(new Option("Average raid boss", ""));
  const groups = new Map();
  BOSSES_DATA.forEach((boss, index) => {
    if (!groups.has(boss.group)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = boss.group;
      groups.set(boss.group, optgroup);
      modalEquipmentBoss.appendChild(optgroup);
    }
    groups.get(boss.group).appendChild(new Option(`${boss.name} \u2014 ${boss.map}`, String(index)));
  });
  syncBossSelect();
}

function bossSummary(boss) {
  return `${boss.hull ? boss.hull + " \u00b7 " : ""}${boss.armor[0].toUpperCase()}${boss.armor.slice(1)} armour \u00b7 Lv.${boss.level} \u00b7 ACC ${boss.hit} \u00b7 EVA ${boss.eva} \u00b7 LCK ${boss.luck} \u00b7 ${boss.timeLimit}s`;
}

// The Targets tab and the modal's menu set the same boss, so each must show the other's pick.
function syncBossSelect() {
  if (modalEquipmentBoss.options.length) {
    modalEquipmentBoss.value = targetBoss ? String(BOSSES_DATA.indexOf(targetBoss)) : "";
  }
  modalEquipmentBossStats.textContent = targetBoss ? bossSummary(targetBoss) : "";
}

function setTargetBoss(boss) {
  targetBoss = boss;
  rankFigures.clear();
  if (metricSortKey()) refreshRankFigures();
  syncBossSelect();
  refreshStatsAfterGearChange();
  // The fight length behind each skill's uptime line is the boss's time limit.
  if (currentShip) renderModalSkills(currentShip, retrofitApplied, augmentApplied, fateSimApplied);
}

modalEquipmentBoss.addEventListener("change", () => {
  setTargetBoss(modalEquipmentBoss.value === "" ? null : BOSSES_DATA[Number(modalEquipmentBoss.value)]);
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
  if (typeof EQUIPMENT_DATA === "undefined" || typeof BOSSES_DATA === "undefined" || (modules.length && typeof AUGMENTS_DATA === "undefined")) {
    setEquipmentControlsDisabled(true);
    modalEquipment.textContent = "Loading equipment...";
    Promise.all([
      typeof EQUIPMENT_DATA === "undefined" && loadDataScript("data/equipment.js"),
      typeof BOSSES_DATA === "undefined" && loadDataScript("data/bosses.js"),
      modules.length && typeof AUGMENTS_DATA === "undefined" && loadDataScript("data/augments.js")
    ]).then(() => {
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
  syncBossOptions();
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
    const options = augmentOptionsForShip(ship);
    const augCtx = options.length ? { ship, slotKey: "augment", slot: {}, options } : null;
    const augment = buildEquipmentSlot("Augment", "Fits: " + fits + " \u2014 requires max Limit Break", [], augCtx);
    augment.classList.add("equip-augment");
    modalEquipment.appendChild(augment);
  }
}

// Surface DPS is shown per armour class rather than as one average: ammunition and torpedoes
// gain or lose a lot against each, which is what decides a ship's matchup against a boss.
const COMBAT_METRIC_FIELDS = [
  { key: "dpsLight", armor: "light", label: "DPS Light", hint: "Surface damage per second against a Light-armour target, from guns, torpedoes, aircraft and barrages." },
  { key: "dpsMedium", armor: "medium", label: "DPS Medium", hint: "Surface damage per second against a Medium-armour target, from guns, torpedoes, aircraft and barrages." },
  { key: "dpsHeavy", armor: "heavy", label: "DPS Heavy", hint: "Surface damage per second against a Heavy-armour target, from guns, torpedoes, aircraft and barrages." },
  { key: "ehp", label: "eHP", hint: "Effective HP: how much damage she absorbs once evasion is accounted for." },
  { key: "dpsAA", label: "DPS AA", hint: "Anti-air damage per second." },
  { key: "dpsASW", label: "DPS ASW", hint: "Anti-submarine damage per second." },
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

const COMBAT_METRIC_ROWS = 3;

// Two figures per row, each name in a column of its own with its value in the next one.
// The pairs are laid out column-first - DPS above eHP, DPS ASW above DPS AA - so the two
// surface figures share a column and the two specialised ones share the next, rather than
// the reading order splitting them across rows.
function renderCombatMetrics(ship, effective) {
  modalCombatMetrics.innerHTML = "";
  if (!ship.equipment || !effective) return;
  const metrics = computeCombatMetrics(ship, currentLevel, effective);
  const byArmor = {};
  for (const field of COMBAT_METRIC_FIELDS) {
    if (field.armor) byArmor[field.key] = computeCombatMetrics(ship, currentLevel, effective, field.armor);
  }
  const columns = Math.ceil(COMBAT_METRIC_FIELDS.length / COMBAT_METRIC_ROWS);
  for (let row = 0; row < COMBAT_METRIC_ROWS; row++) {
    for (let column = 0; column < columns; column++) {
      const field = COMBAT_METRIC_FIELDS[column * COMBAT_METRIC_ROWS + row];
      if (!field) continue;
      const fieldMetrics = byArmor[field.key] || metrics;
      const value = field.armor ? fieldMetrics.dps : metrics[field.key];

      const label = document.createElement("div");
      label.className = "combat-metric-label";
      label.textContent = field.label;

      // A figure a ship simply does not have is left blank rather than dashed. The cell
      // keeps its width, so the columns still line up, and its tooltip still explains why.
      const number = document.createElement("div");
      number.className = "combat-metric-value";
      number.textContent = value ? Math.round(value).toLocaleString("en-US") : "";

      const notes = [field.hint];
      const target = targetStats();
      const targetName = targetBoss
        ? `${targetBoss.name} (${targetBoss.map})`
        : "a Lv.125 raid boss (avg. of Akagi META/Lion/Pamiat' Merkuria META/Moskva)";
      if (field.key === "ehp") {
        notes.push(
          `Against ${targetName}: Accuracy ${target.hit}, Luck ${target.luck}, same level.`,
          `Hit rate ${(metrics.hitRate * 100).toFixed(1)}% -> ${Math.round(metrics.ehp).toLocaleString("en-US")} eHP from ${effective.stats.health.value} HP.`,
          "Counts auxiliary evade procs and damage reductions; skill buffs are left out until their uptime is modelled."
        );
        if (!targetBoss) notes.push("Pick a boss in Target to see this against a specific fight.");
      } else {
        notes.push(hasBuiltInWeapons(ship)
          ? "Empty slots count as the ship's built-in weapon."
          : "Her built-in weapons are not documented, so an empty weapon slot counts as nothing: equip something, or optimise.");
        notes.push(`Includes the average Critical Hit / DMG Dealt multiplier from the base 5% crit rate / 50% crit DMG plus any skill bonus; crit rate assumes ${targetName}: ${target.eva} Evasion, ${target.luck} Luck.`);
        if (field.armor && targetBoss && field.armor === targetBoss.armor) notes.push(`${targetBoss.name} wears ${field.armor} armour: this is the figure for that fight.`);
        if (metrics.unknownSlots) {
          notes.push(`${metrics.unknownSlots} slot(s) not counted: their built-in aircraft have no published damage.`);
        }
        if (field.armor && fieldMetrics.volleyBarrageDps) {
          notes.push(`Includes ${Math.round(fieldMetrics.volleyBarrageDps).toLocaleString("en-US")} DPS from her volley-triggered barrage, which fires off the main gun: a faster gun fires it more often.`);
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
      const isTargetArmor = Boolean(field.armor && targetBoss && field.armor === targetBoss.armor);
      label.classList.toggle("is-target", isTargetArmor);
      number.classList.toggle("is-target", isTargetArmor);
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

// Skill text writes scaled values as "5% (15%)" — level 1 then max level — and the gap
// pattern allows <b> tags between the two since the wiki's markup often opens/closes bold
// mid-pair. keepTags re-emits whatever tags sat in the discarded half, so dropping it can
// never leave the surrounding bold unbalanced.
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

// The lookbehind keeps "Lv.1", "No.3" and single-initial abbreviations from being read as
// sentence ends. ENUMERATION_SEPARATOR (for "1) ... 2) ..." lists) tolerates <b> tags
// around the digit, since the wiki bolds those markers inconsistently (Juneau's "Martyr+"
// is the messiest case).
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

// One skill (Ulrich von Hutten's "Revolutionary's Prosaic") writes a colon-introduced
// effect list as separate sentences instead of semicolon-separated clauses, so its second
// item loses its bullet — a general "subjectless sentence continues the list" rule was
// tried and REJECTED (it wrongly merged Vanguard's "Scatter, Minions of Darkness!"). Keyed
// on the exact header string since no other skill can carry it verbatim; verify any new
// case the same way rather than generalizing this.
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

// The only two things the mechanic-name cues pick up that aren't real names: "Lv" (Alsace's
// "inflicts Lv.1 Holy Judgment") and "DMG" (Little Prinz Eugen's "inflicts DMG up to 6
// times") — named outright rather than filtered by length, which would be arbitrary. The
// >=2 use test is the "qui reviennent" rule: a name must actually recur to be worth
// coloring.
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

// Some source descriptions bold every word individually ("<b>Increases</b> <b>this</b>
// <b>ship's</b>"), almost certainly the wiki's auto-linker surviving a tag strip — 21
// skills carry such a run, every sampled case is noise rather than emphasis. Requiring 2+
// CONSECUTIVE single-token tags is what makes this safe: a real phrase wrapped in one <b>
// contains a space and can never match, so no per-skill denylist is needed.
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
// Per-skill override so toggling one skill's Max Level button also moves that skill's own
// contribution to the stats grid and combat-modifier pills — computeEffectiveStats reads
// this, not just the header's skillsAtMaxLevel. Keyed by the skill object itself, stable
// across a modal's re-renders, so nothing needs clearing on ship switch.
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
// Interaction paginates, so at most one page of toggles is ever in the DOM and a persistent
// array (like the Skills tab's) would go stale on every page flip. Instead nothing is kept:
// the sync queries the live DOM each time, and each toggle's paint function hangs off a
// WeakMap keyed on the toggle element, pruned by GC when its page is replaced.
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

// When a skill's effect is active, from the game's buff tables (scripts/import-skill-timing.js),
// measured over the picked boss's time limit or a 60s fight.
const DEFAULT_FIGHT_SECONDS = 60;
const EVENT_LABELS = {
  check: "a battle event", onHPRatioUpdate: "an HP threshold", onFire: "firing", onChargeWeaponFire: "a main gun salvo",
  onTorpedoWeaponFire: "a torpedo launch", onAllInStrike: "an airstrike", onAllInStrikeSteady: "an airstrike",
  onSubmarineRaid: "a submarine strike", onBeHit: "being hit", onBulletHit: "a hit", onBulletHitBefore: "a hit", count: "a counter"
};

function fightSeconds() {
  return targetBoss && targetBoss.timeLimit ? targetBoss.timeLimit : DEFAULT_FIGHT_SECONDS;
}

// Expected share of the fight the effect is on; periodic effects first fire one period in, as the
// client's timers do.
function uptimeShare(window, fight) {
  if (window.kind === "permanent") return 1;
  if (window.kind === "start") return Math.min(window.duration, fight) / fight;
  if (window.kind === "periodic") {
    let active = 0;
    for (let t = window.period; t < fight; t += window.period) active += Math.min(window.duration, window.period, fight - t);
    return window.chance * active / fight;
  }
  return null;
}

function skillTiming(ship, skill, atMaxLevel) {
  if (typeof SKILL_TIMING_DATA === "undefined") return null;
  const entry = (SKILL_TIMING_DATA[ship.id] || {})[skill.name];
  return entry ? entry[atMaxLevel ? entry.max : 1] : null;
}

function skillUptimeText(window) {
  const fight = fightSeconds();
  const share = uptimeShare(window, fight);
  const of = `of a ${fight}s fight${targetBoss ? ` (${targetBoss.name})` : ""}`;
  const percent = share === null ? "" : `${Math.round(share * 100)}% ${of}`;
  switch (window.kind) {
    case "permanent": return "Active the whole fight";
    case "start": return `Active for the first ${window.duration}s: ${percent}`;
    case "periodic": {
      const chance = window.chance < 1 ? `, ${Math.round(window.chance * 100)}% chance` : "";
      return window.duration > 0
        ? `Every ${window.period}s${chance}, for ${window.duration}s: active ${percent}`
        : `Every ${window.period}s${chance}`;
    }
    case "volleys": return `Fires every ${window.volleys} main gun volleys`;
    case "barrage": return "Fires a special attack";
    case "conditional": return `Triggered by ${EVENT_LABELS[window.trigger] || "a battle event"}: not timed`;
    case "mixed": return "Several effects with different timings: not timed as a whole";
    default: return null;
  }
}

function createSkillUptimeLine(ship, skill) {
  if (typeof SKILL_TIMING_DATA === "undefined") {
    loadDataScript("data/skill-timing.js").then(() => {
      if (currentShip === ship && !modalOverlay.hidden) applyRetrofitState();
    }, () => {});
    return null;
  }
  if (!(SKILL_TIMING_DATA[ship.id] || {})[skill.name]) return null;
  const line = document.createElement("div");
  line.className = "skill-uptime";
  return {
    el: line,
    paint(atMaxLevel) {
      const text = skillUptimeText(skillTiming(ship, skill, atMaxLevel));
      line.hidden = !text;
      line.textContent = text || "";
    }
  };
}

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
    const uptimeLine = createSkillUptimeLine(ship, skill);

    if (skill.description) {
      const desc = document.createElement("div");
      desc.className = "skill-desc";
      const atBase = renderLevelValues(skill.description, false);
      const atMax = renderLevelValues(skill.description, true);
      const mechanics = namedMechanics(atBase);

      const paintDescription = (atMaxLevel) => {
        if (uptimeLine) uptimeLine.paint(atMaxLevel);
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
    if (uptimeLine) {
      if (!skill.description) uptimeLine.paint(skillsAtMaxLevel);
      body.appendChild(uptimeLine.el);
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

// Icon, name, rarity and every numeric figure the item carries, plus its Notes, run through
// the same rendering pipeline as skill text (bullets, condition/action grouping, keyword
// colors) rather than a plain title attribute, which can't carry any of that. The border is
// tinted to the item's own rarity color, the same --equip-tile-color convention the tile
// and picker cell already use.
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

// A marked skill always sits IMMEDIATELY AFTER the base skill it replaces, since
// replacement names follow no consistent convention — that adjacency, not name matching, is
// how the two are paired. A few "+" skills carry no marker at all (Drake's "Flintlock Burst
// (A)+"), which is what the generic fallback is for.
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

// Interaction is ALLY-team-composition only; every guard from here to isGenuineAllyMatch
// rejects a specific false positive found from a reported counter-example, and the ship
// named in each one IS that regression case.
//
// Hunter-type bonuses read as fleet buffs unless caught — "damage dealt to CVs" targets
// enemy carriers, not allies (Centaur wrongly matched Izumo) — and the 100-char lookback
// exists because a long nation list can push the real target past a shorter window.
const ENEMY_TARGET_CUE_RE = /\b(damage dealt to|dmg dealt to|damage dealt against|dmg dealt against|damage against|dmg against|deals?\s+to|deals?\b[^.]{0,25}\bdamage to|dmg to|damage to|against enemy|against enemies|dmg taken by enemy|damage taken by enemy|enemy(?:'s|s)?\s+(?:ships?|fleet|vanguard|main fleet))\b/i;
// ENEMY_TARGET_CUE_RE only knows "enemy" plus a few generic nouns, so it misses hull/nation
// combinations that can follow it ("enemy Royal Navy CL", Z16). "against" immediately
// before any match is always PvP phrasing in this dataset ("Hit Rate against DDs",
// Warspite), generalized rather than enumerating every stat name that can precede it.
const ENEMY_IMMEDIATELY_BEFORE_RE = /\b(an?\s+)?enem(?:y|ies)('s)?\s*$/i;
const AGAINST_CUE_RE = /\bagainst\s*$/i;

// "All Out Assault - Izumo Class" names the ship's OWN special attack after her own
// class, never a fleet buff - confirmed with the user that no All Out Assault
// buffs allies.
const ALL_OUT_ASSAULT_CUE_RE = /all out assault/i;

// Buffs that trigger on the ABSENCE of a type, or on a summoned unit's own type, are the
// opposite of an interaction — "without other Battleships" (Tirpitz wrongly matched Izumo)
// and "fires a barrage from battleship X" (Natori/Hiranuma wrongly matched Izumo).
// SOLO_FLEET_BEFORE_RE is the reversed phrasing of the same solo-fleet idea ("is the only
// ship remaining in your Vanguard").
const NEGATIVE_CONDITION_CUE_RE = /\b(without|no)\s+(other\s+)?$/i;
const FROM_SOURCE_CUE_RE = /\bfrom\s+$/i;
const SOLO_FLEET_CUE_RE = /\b(consists|comprised)\b[^.]{0,15}\bonly\b/i;
const SOLO_FLEET_BEFORE_RE = /\bis\s+the\s+only\s+ship\s+remaining\s+in\s*(?:your\s+|the\s+)?$/i;
// "If this ship has Royal Navy gear equipped" is about the ship's own LOADOUT, not about
// allies — this single pattern accounted for roughly half the false positives left in the
// full-dataset audit. The scan runs to the next sentence boundary rather than the next
// word, since the equipment noun often sits past a branch or a comma list.
const EQUIPMENT_CUE_RE = /\b(gear|aircraft|weapons?|main guns?|equipment)\b/i;
function equipmentConditionFollows(text, matchIndex, matchLen) {
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 70);
  const boundary = after.search(/[.;]/);
  return EQUIPMENT_CUE_RE.test(boundary === -1 ? after : after.slice(0, boundary));
}
// "if this ship is in the frontmost position of the Vanguard" is a self-positional check,
// not a statement about who else is in the fleet (Deutschland, Hermione) — real text varies
// both the preposition and the determiner. Deliberately narrow so it does NOT catch
// phrasing that genuinely targets another ship by position ("applied to the frontmost ship
// of the Vanguard", Z14; Howe), which must stay matched.
const FRONTMOST_POSITION_CUE_RE = /\bin the frontmost position (?:of|in)\s*(?:the|your|this ship's)?\s*$/i;

// "Vanguard" appears constantly inside self-referential headcount/position conditions that
// say nothing about who the buff targets; "placed" is a third alternative since one
// phrasing elides the subject entirely (Carabiniere's "if placed in the backmost
// position"). BROADER_FLEET_TARGET_RE is the counter-test — if the effect clause names a
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

// A match inside an "if there is/are..." condition, with a colon right after it and no
// fleet-wide target in the effect that follows, is a self-only buff using the fleet word as
// a headcount gate (Brest: "if there are 3 ships in your Vanguard: increases this ship's
// EVA"). Requiring the colon IMMEDIATELY after the match avoids misreading a genuine target
// reached through a comma instead (Ganj-i-Sawai, which correctly stays out).
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
// Interaction requires a buff to be guaranteed by the candidate ship's own nation/hull/role
// membership — one additionally gated on another ship's presence, a slot, or a headcount
// doesn't count. This is STRICTER than computeEffectiveStats (don't backport it there);
// action triggers like "every 20s" are NOT gates, since they fire regardless of team
// composition (Centaur's Airspace Dominance still matches).
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

// A compound qualifier restricts a buff to BOTH a nation AND a role/hull, so a candidate
// must satisfy the whole condition, not one half. Strict adjacency ("Dragon Empery Main
// Fleet ships") misses the commoner form with connectors in between (Chang Chun's "Northern
// Parliament and Dragon Empery ships in the Vanguard Fleet"), which
// compoundNationListExcludes handles.
function otherNationImmediatelyBefore(text, matchIndex, ownNation) {
  const before = text.slice(Math.max(0, matchIndex - 30), matchIndex);
  if (ALL_NATION_TERMS.some(nation => nation !== ownNation && new RegExp(`\\b${escapeRegExp(nation)}\\s*$`, "i").test(before))) return true;
  return compoundNationListExcludes(text, matchIndex, ownNation);
}
// NATION_LIST_TRIGGER_PREFIX_RE guards the guard above: a nation named before "ship in your
// Vanguard" isn't always who the buff is FOR — Alfredo Oriani's "this ship or a Sardegna
// Empire ship...falls below 30% HP" names who can TRIGGER an unrestricted smokescreen, not
// a beneficiary list. Reached through when/if/once/or a/another/per, it's a trigger
// condition, not a target restriction.
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
// "Carriers" alone covers CV and CVL without saying which, so it only rules out other hulls.
const GENERIC_HULL_TERMS = { Carrier: ["CV", "CVL"] };

function otherHullImmediatelyAfter(text, matchIndex, matchLen, ownHullText, ownHullAbbr, ownHullShort) {
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 20);
  const genericExcludes = Object.entries(GENERIC_HULL_TERMS)
    .some(([term, hulls]) => !hulls.includes(ownHullShort) && new RegExp(`^\\s*${term}s?\\b`, "i").test(after));
  return genericExcludes || ALL_HULL_TERMS.some(hull => hull !== ownHullText && hull !== ownHullAbbr && new RegExp(`^\\s*${escapeRegExp(hull)}s?\\b`, "i").test(after));
}

// A skill that echoes its own name inline is not referencing another ship, even when that
// name contains one (Wichita META's "Ashen Might - Wichita II only:" sits inside the skill
// titled "Ashen Might - Wichita"). Computed as ranges to SKIP rather than deleting the
// substring — an earlier version deleted it and also erased the "All Out Assault" text its
// own guard depends on, sending false positives from 33 to 224.
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
    if (otherHullImmediatelyAfter(text, matchIndex, matchLen, hullText, hullAbbr, ship.hullShort)) return false;
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
// When a "+" skill matches alone, the entry anchors on its base skill so the toggle can
// show both — but blindly anchoring re-introduces exactly what the structural gate
// excludes, one level removed (Ganj-i-Sawai's base mentions "Vanguard" only inside a gated
// clause). A base is a safe anchor only if it never mentions the category (Chapayev) or
// mentions it AND independently passes isGenuineAllyMatch; otherwise the entry falls back
// to the "+" skill alone.
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

// The painting's frame is the column's box, whose shape follows the window.
function focusModalImage() {
  const ship = currentShip;
  if (!ship || !modalImage.naturalWidth) return;
  const skins = effectiveSkins(ship);
  const skin = skins[currentSkinIndex] || skins[0];
  const frame = modalImage.parentElement.getBoundingClientRect();
  focusImage(modalImage, skin.painting || skin.icon, { ratio: frame.width / frame.height, tx: 0.5, ty: 0.25 });
}

modalImage.addEventListener("load", focusModalImage);
window.addEventListener("resize", () => {
  if (!modalOverlay.hidden) focusModalImage();
});

function updateModalImage() {
  const ship = currentShip;
  if (!ship) return;
  const skins = effectiveSkins(ship);
  const skin = skins[currentSkinIndex] || skins[0];

  modalImage.src = skin.painting || skin.icon;
  focusModalImage();
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

const pageBehindModal = [document.querySelector(".topbar"), document.querySelector("main")];
let modalOpener = null;

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

  if (modalOverlay.hidden) modalOpener = document.activeElement;
  modalOverlay.hidden = false;
  focusModalImage();
  document.body.style.overflow = "hidden";
  // Keyboard and screen reader focus must not wander into the page behind the dialog.
  pageBehindModal.forEach(el => { el.inert = true; });
  modalClose.focus();
}

function closeModal() {
  if (currentView === "fleet") queueMicrotask(renderFleet);
  // Her gear may have changed in the panel.
  if (currentShip) rankFigures.delete(currentShip);
  if (metricSortKey()) queueMicrotask(refreshRankFigures);
  modalOverlay.hidden = true;
  document.body.style.overflow = "";
  pageBehindModal.forEach(el => { el.inert = false; });
  currentShip = null;
  hideEquipInfoTooltip();
  if (modalOpener) modalOpener.focus();
  modalOpener = null;
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

// ---------------------------------------------------------------------------
// Views: Port (ships), Depot (equipment), Augments, Targets (bosses)
// ---------------------------------------------------------------------------

const VIEW_IDS = ["port", "depot", "augments", "targets", "fleet"];
const viewTabs = [...document.querySelectorAll(".view-tab")];
let currentView = null;

function viewFromHash() {
  const view = location.hash.slice(1);
  return VIEW_IDS.includes(view) ? view : "port";
}

function showView(view) {
  if (view === currentView) return;
  currentView = view;
  for (const tab of viewTabs) {
    const on = tab.dataset.view === view;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  document.querySelectorAll(".view-controls, .view").forEach(el => { el.hidden = el.dataset.view !== view; });
  if (view === "depot") showDepot();
  else if (view === "augments") showAugments();
  else if (view === "targets") showTargets();
  else if (view === "fleet") showFleet();
}

// The hash rather than history.pushState: pushState throws on file://, which the source must support.
for (const tab of viewTabs) {
  tab.addEventListener("click", () => { location.hash = tab.dataset.view; });
  tab.addEventListener("keydown", event => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = viewTabs[(viewTabs.indexOf(tab) + step + viewTabs.length) % viewTabs.length];
    next.focus();
    location.hash = next.dataset.view;
  });
}
window.addEventListener("hashchange", () => showView(viewFromHash()));

refreshBtn.addEventListener("click", () => {
  if (currentView !== "port") location.hash = "port";
});

// Renders once its lazy data script is in; a failed load leaves a message and retries next visit.
function withViewData(isLoaded, load, statusEl, render) {
  if (isLoaded()) return render();
  statusEl.textContent = "Loading...";
  load().then(render, () => { statusEl.textContent = "Data could not be loaded."; });
}

function makeToggleChip(label, set, value, onChange, title) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = label;
  if (title) chip.title = title;
  chip.addEventListener("click", () => {
    if (set.has(value)) set.delete(value);
    else set.add(value);
    chip.classList.toggle("active", set.has(value));
    onChange();
  });
  return chip;
}

function makeFilterRow(container, title, entries, set, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "filter-group";
  const label = document.createElement("span");
  label.className = "filter-group-label";
  label.textContent = title;
  wrap.appendChild(label);
  for (const entry of entries) {
    if (entry === "|") {
      const sep = document.createElement("span");
      sep.className = "category-sep";
      sep.textContent = "|";
      wrap.appendChild(sep);
    } else {
      wrap.appendChild(makeToggleChip(entry.label, set, entry.value, onChange, entry.title));
    }
  }
  container.appendChild(wrap);
}

function matchesSets(sets) {
  return sets.every(([set, value]) => set.size === 0 || set.has(value));
}

function renderCardGrid(gridEl, countEl, list, noun, cache, create) {
  countEl.textContent = `${list.length} ${noun}${list.length === 1 ? "" : "s"}`;
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = `No ${noun} matches these filters.`;
    gridEl.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of list) {
    if (!cache.has(entry)) cache.set(entry, create(entry));
    fragment.appendChild(cache.get(entry));
  }
  gridEl.replaceChildren(fragment);
}

function createRarityStrip(rarity) {
  const strip = document.createElement("div");
  strip.className = "rarity-strip";
  strip.style.background = equipmentRarityColor(rarity);
  return strip;
}

function createCardButton(label) {
  const button = document.createElement("button");
  button.className = "card-activate";
  button.type = "button";
  button.setAttribute("aria-label", label);
  return button;
}

function statBonusText(item) {
  return Object.entries(item.statBonus || {})
    .filter(([, amount]) => typeof amount === "number")
    .map(([rawKey, amount]) => `${STAT_ABBR[EQUIPMENT_STAT_KEY_ALIASES[rawKey] || rawKey] || rawKey} +${amount}`)
    .join(" · ");
}

// --- Depot ---

const DEPOT_TYPE_GROUPS = [
  ["DD Gun", "CL Gun", "CA Gun", "CB Gun", "BB Gun"],
  ["Torpedo", "Submarine Torpedo"],
  ["Fighter", "Dive Bomber", "Torpedo Bomber", "Seaplane"],
  ["AA Gun", "AA Time Fuze Gun", "ASW", "Auxiliary"]
];
const DEPOT_TYPE_ORDER = DEPOT_TYPE_GROUPS.flat();
const depotSearchEl = document.getElementById("depot-search");
const depotSortEl = document.getElementById("depot-sort");
const depotFiltersEl = document.getElementById("depot-filters");
const depotGridEl = document.getElementById("depot-grid");
const depotCountEl = document.getElementById("depot-count");
const depotFilter = { category: new Set(), rarity: new Set(), nation: new Set() };
const depotCardCache = new Map();

function showDepot() {
  withViewData(() => typeof EQUIPMENT_DATA !== "undefined", () => loadDataScript("data/equipment.js"), depotCountEl, () => {
    if (!depotFiltersEl.childElementCount) buildDepotFilters();
    updateDepot();
  });
}

function itemNation(item) {
  return item.nation || "Universal";
}

function buildDepotFilters() {
  const typeEntries = [];
  DEPOT_TYPE_GROUPS.forEach((group, i) => {
    if (i) typeEntries.push("|");
    for (const category of group) typeEntries.push({ label: category, value: category });
  });
  makeFilterRow(depotFiltersEl, "Type", typeEntries, depotFilter.category, updateDepot);
  const rarities = EQUIPMENT_RARITY_ORDER.filter(r => EQUIPMENT_DATA.some(i => i.rarity === r));
  makeFilterRow(depotFiltersEl, "Rarity", rarities.map(r => ({ label: r, value: r })), depotFilter.rarity, updateDepot);
  const nations = [...new Set(EQUIPMENT_DATA.map(itemNation))].sort((a, b) => a.localeCompare(b, "en"));
  makeFilterRow(depotFiltersEl, "Nation", nations.map(n => ({ label: n, value: n })), depotFilter.nation, updateDepot);
}

function headlineValue(item) {
  const stat = equipmentPrimaryStat(item);
  return stat && typeof stat.value === "number" ? stat.value : -Infinity;
}

function compareItems(a, b, sort) {
  const rarity = EQUIPMENT_RARITY_ORDER.indexOf(b.rarity) - EQUIPMENT_RARITY_ORDER.indexOf(a.rarity);
  const type = DEPOT_TYPE_ORDER.indexOf(a.category) - DEPOT_TYPE_ORDER.indexOf(b.category);
  const name = a.name.localeCompare(b.name, "en", { numeric: true }) || String(a.tier).localeCompare(String(b.tier));
  if (sort === "rarity") return rarity || type || name;
  if (sort === "name") return name;
  if (sort === "stat") return headlineValue(b) - headlineValue(a) || name;
  return type || rarity || name;
}

function updateDepot() {
  const q = foldAccents(depotSearchEl.value.trim().toLowerCase());
  const sort = depotSortEl.value;
  const list = EQUIPMENT_DATA
    .filter(item => (!q || foldAccents(item.name.toLowerCase()).includes(q)) &&
      matchesSets([[depotFilter.category, item.category], [depotFilter.rarity, item.rarity], [depotFilter.nation, itemNation(item)]]))
    .sort((a, b) => compareItems(a, b, sort));
  renderCardGrid(depotGridEl, depotCountEl, list, "item", depotCardCache, createItemCard);
}

function createItemCard(item) {
  const card = document.createElement("article");
  card.className = "card item-card";
  card.dataset.id = item.id;
  card.appendChild(createRarityStrip(item.rarity));
  const art = document.createElement("div");
  art.className = "item-art";
  art.style.setProperty("--item-rarity", equipmentRarityColor(item.rarity));
  art.appendChild(equipmentIconImg(item, "item-art-icon"));
  card.appendChild(art);
  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name item-name";
  name.textContent = item.name;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [item.category, item.tier].filter(Boolean).join(" · ");
  const stat = document.createElement("div");
  stat.className = "item-stat";
  stat.textContent = equipmentSummaryText(item);
  info.append(name, meta, stat);
  card.appendChild(info);
  card.appendChild(createCardButton(`View ${item.name} details`));
  return card;
}

depotSearchEl.addEventListener("input", () => typeof EQUIPMENT_DATA !== "undefined" && updateDepot());
depotSortEl.addEventListener("change", () => typeof EQUIPMENT_DATA !== "undefined" && updateDepot());
depotGridEl.addEventListener("click", event => {
  const card = event.target.closest(".card");
  const item = card && EQUIPMENT_DATA.find(i => i.id === card.dataset.id);
  if (item) openItemModal(item, "equipment");
});

// Reverse of skillNamedEquipment, built on the first item opened.
let shipsByNamedItem = null;
function shipsNamingItem(item) {
  if (!shipsByNamedItem) {
    shipsByNamedItem = new Map();
    for (const ship of ships) {
      for (const name of skillNamedEquipment(ship)) {
        if (!shipsByNamedItem.has(name)) shipsByNamedItem.set(name, []);
        shipsByNamedItem.get(name).push(ship);
      }
    }
  }
  return shipsByNamedItem.get(item.name) || [];
}

// --- Augments ---

const augmentSearchEl = document.getElementById("augment-search");
const augmentSortEl = document.getElementById("augment-sort");
const augmentFiltersEl = document.getElementById("augment-filters");
const augmentGridEl = document.getElementById("augment-grid");
const augmentCountEl = document.getElementById("augment-count");
const augmentFilter = { kind: new Set(), rarity: new Set(), stat: new Set() };
const augmentCardCache = new Map();
let shipsByAugment = null;

function augmentShips(augment) {
  if (!shipsByAugment) {
    shipsByAugment = new Map();
    for (const ship of ships) {
      for (const name of ship.augmentModules || []) {
        if (!shipsByAugment.has(name)) shipsByAugment.set(name, []);
        shipsByAugment.get(name).push(ship);
      }
    }
  }
  return shipsByAugment.get(augment.name) || [];
}

// A module only one ship can take is her unique augment; the rest are the shared weapon kinds.
function augmentKind(augment) {
  return augmentShips(augment).length === 1 ? "Unique" : "General";
}

function showAugments() {
  withViewData(() => typeof AUGMENTS_DATA !== "undefined", () => loadDataScript("data/augments.js"), augmentCountEl, () => {
    if (!augmentFiltersEl.childElementCount) buildAugmentFilters();
    updateAugments();
  });
}

function buildAugmentFilters() {
  makeFilterRow(augmentFiltersEl, "Kind", ["General", "Unique"].map(k => ({ label: k, value: k })), augmentFilter.kind, updateAugments);
  const rarities = EQUIPMENT_RARITY_ORDER.filter(r => AUGMENTS_DATA.some(a => a.rarity === r));
  makeFilterRow(augmentFiltersEl, "Rarity", rarities.map(r => ({ label: r, value: r })), augmentFilter.rarity, updateAugments);
  const stats = STAT_GRID.filter(d => d && AUGMENTS_DATA.some(a => typeof (a.statBonus || {})[d.key] === "number"));
  makeFilterRow(augmentFiltersEl, "Stat", stats.map(d => ({ label: d.label, value: d.key })), augmentFilter.stat, updateAugments);
}

function updateAugments() {
  const q = foldAccents(augmentSearchEl.value.trim().toLowerCase());
  const sort = augmentSortEl.value;
  const matchesQuery = augment => !q || foldAccents(augment.name.toLowerCase()).includes(q) ||
    augmentShips(augment).some(ship => foldAccents(ship.displayName.toLowerCase()).includes(q));
  const hasStats = augment => [...augmentFilter.stat].every(key => typeof (augment.statBonus || {})[key] === "number");
  const list = AUGMENTS_DATA
    .filter(a => matchesQuery(a) && hasStats(a) && matchesSets([[augmentFilter.kind, augmentKind(a)], [augmentFilter.rarity, a.rarity]]))
    .sort((a, b) => {
      const name = a.name.localeCompare(b.name, "en", { numeric: true });
      if (sort === "name") return name;
      if (sort === "ships") return augmentShips(b).length - augmentShips(a).length || name;
      const kind = augmentKind(a).localeCompare(augmentKind(b));
      return kind || EQUIPMENT_RARITY_ORDER.indexOf(b.rarity) - EQUIPMENT_RARITY_ORDER.indexOf(a.rarity) || name;
    });
  renderCardGrid(augmentGridEl, augmentCountEl, list, "augment", augmentCardCache, createAugmentCard);
}

function createAugmentCard(augment) {
  const card = document.createElement("article");
  card.className = "card augment-card";
  card.dataset.id = String(augment.id);
  card.appendChild(createRarityStrip(augment.rarity));
  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name item-name";
  name.textContent = augment.name;
  const shipsFor = augmentShips(augment);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = augmentKind(augment) === "Unique"
    ? `Unique · ${shipsFor[0].displayName}`
    : `General · ${shipsFor.length} ships`;
  const stat = document.createElement("div");
  stat.className = "item-stat";
  stat.textContent = statBonusText(augment);
  info.append(name, meta, stat);
  card.appendChild(info);
  card.appendChild(createCardButton(`View ${augment.name} details`));
  return card;
}

augmentSearchEl.addEventListener("input", () => typeof AUGMENTS_DATA !== "undefined" && updateAugments());
augmentSortEl.addEventListener("change", () => typeof AUGMENTS_DATA !== "undefined" && updateAugments());
augmentGridEl.addEventListener("click", event => {
  const card = event.target.closest(".card");
  const augment = card && AUGMENTS_DATA.find(a => String(a.id) === card.dataset.id);
  if (augment) openItemModal(augment, "augment");
});

// --- Item detail (equipment and augments) ---

const itemOverlay = document.getElementById("item-overlay");
const itemModalBody = document.getElementById("item-modal-body");
const itemModalClose = document.getElementById("item-modal-close");
let itemModalOpener = null;

function itemSection(title, content) {
  const section = document.createElement("section");
  section.className = "item-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading, content);
  return section;
}

function shipChipList(list) {
  const wrap = document.createElement("div");
  wrap.className = "ship-chip-list";
  for (const ship of [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, "en"))) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip ship-chip";
    if (ship.hullShort) {
      const icon = document.createElement("img");
      icon.className = "hull-chip-icon";
      icon.src = HULL_ICON_DIR + ship.hullShort + ".png";
      icon.alt = "";
      chip.appendChild(icon);
    }
    chip.appendChild(document.createTextNode(ship.displayName));
    chip.addEventListener("click", () => {
      closeItemModal();
      openModal(ship);
    });
    wrap.appendChild(chip);
  }
  return wrap;
}

const ITEM_DETAIL_FIELDS = [
  ["rnd", "Rounds"], ["coef", "Coef.", "%"], ["volleyTime", "Volley", "s"], ["rangeMax", "Range"],
  ["spread", "Spread"], ["angle", "Angle"], ["attr", "Attribute"]
];

function itemStatTable(item) {
  const table = document.createElement("dl");
  table.className = "item-stat-table";
  const rows = equipmentStatRows(item).map(row => [row.label, row.value, row.icon]);
  for (const [key, label, unit] of ITEM_DETAIL_FIELDS) {
    if (item[key] != null && item[key] !== "") rows.push([label, `${item[key]}${unit || ""}`]);
  }
  for (const [label, value, iconSrc] of rows) {
    const dt = document.createElement("dt");
    if (iconSrc) {
      const icon = document.createElement("img");
      icon.className = "stat-icon";
      icon.src = iconSrc;
      icon.alt = "";
      dt.appendChild(icon);
    }
    dt.appendChild(document.createTextNode(label));
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    const cell = document.createElement("div");
    cell.append(dt, dd);
    table.appendChild(cell);
  }
  return table;
}

function openItemModal(item, kind) {
  const body = document.createDocumentFragment();
  const head = document.createElement("div");
  head.className = "item-modal-head";
  if (kind === "equipment") {
    const art = document.createElement("div");
    art.className = "item-art item-modal-art";
    art.style.setProperty("--item-rarity", equipmentRarityColor(item.rarity));
    art.appendChild(equipmentIconImg(item, "item-art-icon"));
    head.appendChild(art);
  }
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "item-modal-name";
  title.textContent = item.name;
  title.style.setProperty("--item-rarity", equipmentRarityColor(item.rarity));
  const sub = document.createElement("p");
  sub.className = "item-modal-sub";
  sub.textContent = kind === "equipment"
    ? [item.tier, item.rarity, item.category, itemNation(item)].filter(Boolean).join(" · ")
    : [item.rarity, `${augmentKind(item)} augment`].join(" · ");
  titleWrap.append(title, sub);
  const badges = document.createElement("div");
  badges.className = "item-badges";
  const badgeTexts = kind === "equipment"
    ? [item.gearLab && "Gear Lab only", item.research && "Research only", item.unique && "Unique (one per fleet)"]
    : [];
  for (const text of badgeTexts.filter(Boolean)) {
    const badge = document.createElement("span");
    badge.className = "item-badge";
    badge.textContent = text;
    badges.appendChild(badge);
  }
  if (badges.childElementCount) titleWrap.appendChild(badges);
  head.appendChild(titleWrap);
  body.appendChild(head);

  const stats = itemStatTable(item);
  if (kind === "equipment" && weaponRole(item)) {
    const note = document.createElement("p");
    note.className = "item-note";
    note.textContent = "Catalog figures: Reload 100, no ship stats. A ship's Equipment panel applies her own.";
    body.appendChild(itemSection("Stats", stats)).appendChild(note);
  } else {
    body.appendChild(itemSection("Stats", stats));
  }
  if (kind === "equipment") {
    if ((item.usedBy || []).length) {
      const hulls = document.createElement("div");
      hulls.className = "ship-chip-list";
      for (const short of item.usedBy) {
        const chip = document.createElement("span");
        chip.className = "chip hull-tag";
        const icon = document.createElement("img");
        icon.className = "hull-chip-icon";
        icon.src = HULL_ICON_DIR + short + ".png";
        icon.alt = "";
        chip.append(icon, document.createTextNode(short));
        hulls.appendChild(chip);
      }
      body.appendChild(itemSection("Usable by", hulls));
    }
    const named = shipsNamingItem(item);
    if (named.length) body.appendChild(itemSection("Named in the skills of", shipChipList(named)));
  } else {
    body.appendChild(itemSection(`Ships (${augmentShips(item).length})`, shipChipList(augmentShips(item))));
  }

  itemModalBody.replaceChildren(body);
  itemModalBody.scrollTop = 0;
  if (itemOverlay.hidden) itemModalOpener = document.activeElement;
  itemOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  pageBehindModal.forEach(el => { el.inert = true; });
  itemModalClose.focus();
}

function closeItemModal() {
  itemOverlay.hidden = true;
  document.body.style.overflow = "";
  pageBehindModal.forEach(el => { el.inert = false; });
  if (itemModalOpener) itemModalOpener.focus();
  itemModalOpener = null;
}

itemModalClose.addEventListener("click", closeItemModal);
itemOverlay.addEventListener("click", event => {
  if (event.target === itemOverlay) closeItemModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !itemOverlay.hidden) closeItemModal();
});

// --- Targets ---

const targetSearchEl = document.getElementById("target-search");
const targetFiltersEl = document.getElementById("target-filters");
const targetRowsEl = document.getElementById("target-rows");
const targetCountEl = document.getElementById("target-count");
const targetCurrentEl = document.getElementById("target-current");
const targetFilter = { group: new Set(), armor: new Set(), hull: new Set() };

function showTargets() {
  withViewData(() => typeof BOSSES_DATA !== "undefined", () => loadDataScript("data/bosses.js"), targetCountEl, () => {
    if (!targetFiltersEl.childElementCount) buildTargetFilters();
    updateTargets();
  });
}

function buildTargetFilters() {
  const groups = [...new Set(BOSSES_DATA.map(b => b.group))];
  makeFilterRow(targetFiltersEl, "Content", groups.map(g => ({ label: g, value: g })), targetFilter.group, updateTargets);
  makeFilterRow(targetFiltersEl, "Armour", ["light", "medium", "heavy"].map(a => ({ label: a[0].toUpperCase() + a.slice(1), value: a })), targetFilter.armor, updateTargets);
  const hulls = [...new Set(BOSSES_DATA.map(b => b.hull).filter(Boolean))].sort();
  makeFilterRow(targetFiltersEl, "Hull", hulls.map(h => ({ label: h, value: h })), targetFilter.hull, updateTargets);
}

function renderTargetCurrent() {
  targetCurrentEl.replaceChildren();
  if (!targetBoss) {
    targetCurrentEl.textContent = "No target: DPS averages the three armours and eHP uses an averaged raid boss. Pick one below; it carries over to every ship's Equipment panel.";
    return;
  }
  const name = document.createElement("strong");
  name.textContent = `${targetBoss.name} (${targetBoss.map})`;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "chip";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    setTargetBoss(null);
    updateTargets();
  });
  targetCurrentEl.append("Target: ", name, ` — ${bossSummary(targetBoss)} `, clear);
}

function updateTargets() {
  renderTargetCurrent();
  const q = foldAccents(targetSearchEl.value.trim().toLowerCase());
  const list = BOSSES_DATA.filter(b =>
    (!q || foldAccents(`${b.name} ${b.map}`.toLowerCase()).includes(q)) &&
    matchesSets([[targetFilter.group, b.group], [targetFilter.armor, b.armor], [targetFilter.hull, b.hull]]));
  targetCountEl.textContent = `${list.length} target${list.length === 1 ? "" : "s"}`;
  const fragment = document.createDocumentFragment();
  for (const boss of list) {
    const row = document.createElement("tr");
    const isTarget = boss === targetBoss;
    if (isTarget) row.className = "is-target";
    const armour = boss.armor[0].toUpperCase() + boss.armor.slice(1);
    for (const value of [boss.name, boss.map, boss.group, boss.hull || "—", armour, boss.level, boss.hit, boss.eva, boss.luck, `${boss.timeLimit}s`]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = isTarget ? "chip active" : "chip";
    button.textContent = isTarget ? "Targeted" : "Target";
    button.setAttribute("aria-pressed", String(isTarget));
    button.addEventListener("click", () => {
      setTargetBoss(isTarget ? null : boss);
      updateTargets();
    });
    actionCell.appendChild(button);
    row.appendChild(actionCell);
    fragment.appendChild(row);
  }
  targetRowsEl.replaceChildren(fragment);
}

targetSearchEl.addEventListener("input", () => typeof BOSSES_DATA !== "undefined" && updateTargets());

// --- Fleet ---

const FLEET_LEVEL = 125;
const FLEET_SIZE = 3;
const FLEET_STORAGE_KEY = "azurcalc.fleet";
const fleetRowEls = { Vanguard: document.getElementById("fleet-vanguard"), Main: document.getElementById("fleet-main") };
const fleetPickerEl = document.getElementById("fleet-picker");
const fleetSearchEl = document.getElementById("fleet-search");
const fleetResultsEl = document.getElementById("fleet-results");
const fleetTotalsEl = document.getElementById("fleet-totals");
const fleetSynergiesEl = document.getElementById("fleet-synergies");
const fleetTargetEl = document.getElementById("fleet-target");
const fleet = loadFleet();
let fleetPickerSlot = null;

// A per-viewer convenience, so a blocked or empty storage just starts an empty fleet.
function loadFleet() {
  const empty = { Vanguard: [null, null, null], Main: [null, null, null] };
  try {
    const saved = JSON.parse(localStorage.getItem(FLEET_STORAGE_KEY) || "null");
    for (const row of Object.keys(empty)) {
      (saved && saved[row] || []).slice(0, FLEET_SIZE).forEach((id, i) => {
        const ship = shipsById.get(String(id));
        empty[row][i] = ship && ship.role === row ? ship : null;
      });
    }
  } catch {}
  return empty;
}

function saveFleet() {
  try {
    localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify({
      Vanguard: fleet.Vanguard.map(s => s && s.id),
      Main: fleet.Main.map(s => s && s.id)
    }));
  } catch {}
}

function fleetMembers() {
  return [...fleet.Vanguard, ...fleet.Main].filter(Boolean);
}

// Optimize needs the gear catalog and reads the boss list; augments only matter to ships with modules.
function showFleet() {
  withViewData(
    () => typeof EQUIPMENT_DATA !== "undefined" && typeof BOSSES_DATA !== "undefined" && typeof AUGMENTS_DATA !== "undefined",
    () => Promise.all([loadDataScript("data/equipment.js"), loadDataScript("data/bosses.js"), loadDataScript("data/augments.js")]),
    fleetTotalsEl,
    renderFleet
  );
}

// The figures read the modal's level/retrofit globals (Optimize's eHP simulation does), so they
// are set for the fleet and put back. A ship with no gear set gets Optimize's pick, which is
// then hers in the Equipment panel too, unless keepPicks is false (the Port sorts rank all 888
// ships and must not equip them behind the user's back).
function fleetShipFigures(ship, keepPicks = true) {
  const saved = [currentLevel, retrofitApplied, augmentApplied, fateSimApplied, equipmentTarget];
  const hadGear = Object.keys(equippedGear[ship.id] || {}).length > 0;
  currentLevel = FLEET_LEVEL;
  retrofitApplied = Boolean(ship.hasRetrofit);
  augmentApplied = false;
  fateSimApplied = false;
  try {
    if (ship.equipment && !Object.keys(equippedGear[ship.id] || {}).length) {
      equipmentTarget = "auto";
      const bare = computeEffectiveStats(ship, FLEET_LEVEL, retrofitApplied, false, false);
      if (bare) optimizeEquipment(ship, bare, FLEET_LEVEL);
    }
    const effective = computeEffectiveStats(ship, FLEET_LEVEL, retrofitApplied, false, false);
    return effective ? computeCombatMetrics(ship, FLEET_LEVEL, effective, targetStats().armor) : null;
  } finally {
    [currentLevel, retrofitApplied, augmentApplied, fateSimApplied, equipmentTarget] = saved;
    if (!keepPicks && !hadGear) clearEquippedGear(ship);
  }
}

function formatFigure(value) {
  return Math.round(value).toLocaleString("en-US");
}

function renderFleet() {
  if (typeof EQUIPMENT_DATA === "undefined") return;
  fleetTargetEl.replaceChildren(targetBoss
    ? `Against ${targetBoss.name} (${targetBoss.map}): ${bossSummary(targetBoss)}. `
    : "No target picked: DPS averages the three armours. ");
  const change = document.createElement("button");
  change.type = "button";
  change.className = "chip";
  change.textContent = targetBoss ? "Change target" : "Pick a target";
  change.addEventListener("click", () => { location.hash = "targets"; });
  fleetTargetEl.appendChild(change);

  const figures = new Map();
  for (const ship of fleetMembers()) figures.set(ship, fleetShipFigures(ship));
  for (const row of Object.keys(fleetRowEls)) {
    fleetRowEls[row].replaceChildren(...fleet[row].map((ship, index) => createFleetSlot(row, index, ship, ship && figures.get(ship))));
  }
  renderFleetTotals(figures);
  renderFleetSynergies();
}

function createFleetSlot(row, index, ship, metrics) {
  const slot = document.createElement("div");
  slot.className = "fleet-slot";
  if (!ship) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "fleet-add";
    add.textContent = `+ ${row}`;
    add.setAttribute("aria-label", `Add a ${row} ship to slot ${index + 1}`);
    add.addEventListener("click", () => openFleetPicker(row, index));
    slot.appendChild(add);
    return slot;
  }
  const card = createCard(ship);
  card.querySelector(".card-activate").addEventListener("click", () => openModal(ship));
  slot.appendChild(card);
  const stats = document.createElement("dl");
  stats.className = "fleet-slot-stats";
  const rows = metrics
    ? [["DPS", metrics.dps], ["eHP", metrics.ehp], ["AA", metrics.dpsAA]]
    : [];
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = formatFigure(value);
    stats.append(dt, dd);
  }
  slot.appendChild(stats);
  const actions = document.createElement("div");
  actions.className = "fleet-slot-actions";
  const swap = document.createElement("button");
  swap.type = "button";
  swap.className = "chip";
  swap.textContent = "Change";
  swap.addEventListener("click", () => openFleetPicker(row, index));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chip";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    fleet[row][index] = null;
    saveFleet();
    renderFleet();
  });
  actions.append(swap, remove);
  slot.appendChild(actions);
  return slot;
}

function openFleetPicker(row, index) {
  fleetPickerSlot = { row, index };
  fleetPickerEl.hidden = false;
  fleetSearchEl.placeholder = `Search a ${row} ship...`;
  fleetSearchEl.value = "";
  updateFleetPicker();
  fleetRowEls[row].after(fleetPickerEl);
  fleetSearchEl.focus();
}

// One ship per fleet, as in the game; the list is capped since a 3-letter query is the usual use.
function updateFleetPicker() {
  if (!fleetPickerSlot) return;
  const q = foldAccents(fleetSearchEl.value.trim().toLowerCase());
  const taken = new Set(fleetMembers());
  const list = ships
    .filter(s => s.role === fleetPickerSlot.row && !taken.has(s) && (!q || foldAccents(s.displayName.toLowerCase()).includes(q)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base", numeric: true }))
    .slice(0, 60);
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = `No other ${fleetPickerSlot.row} ship matches.`;
    fleetResultsEl.replaceChildren(empty);
    return;
  }
  fleetResultsEl.replaceChildren(...list.map(ship => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip ship-chip";
    const icon = document.createElement("img");
    icon.className = "hull-chip-icon";
    icon.src = HULL_ICON_DIR + ship.hullShort + ".png";
    icon.alt = "";
    button.append(icon, ship.displayName);
    button.addEventListener("click", () => {
      fleet[fleetPickerSlot.row][fleetPickerSlot.index] = ship;
      fleetPickerSlot = null;
      fleetPickerEl.hidden = true;
      saveFleet();
      renderFleet();
    });
    return button;
  }));
}

function renderFleetTotals(figures) {
  const sum = (row, key) => fleet[row].reduce((total, ship) => total + (ship && figures.get(ship) ? figures.get(ship)[key] : 0), 0);
  const members = fleetMembers().filter(ship => figures.get(ship));
  const weakest = members.reduce((low, ship) => !low || figures.get(ship).ehp < figures.get(low).ehp ? ship : low, null);
  const cells = [
    ["Vanguard DPS", formatFigure(sum("Vanguard", "dps"))],
    ["Main fleet DPS", formatFigure(sum("Main", "dps"))],
    ["Fleet DPS", formatFigure(sum("Vanguard", "dps") + sum("Main", "dps"))],
    ["Fleet AA DPS", formatFigure(sum("Vanguard", "dpsAA") + sum("Main", "dpsAA"))],
    ["Lowest eHP", weakest ? `${formatFigure(figures.get(weakest).ehp)} (${weakest.displayName})` : "\u2014"]
  ];
  const table = document.createElement("dl");
  table.className = "item-stat-table";
  for (const [label, value] of cells) {
    const cell = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    cell.append(dt, dd);
    table.appendChild(cell);
  }
  fleetTotalsEl.replaceChildren(table);
}

// Skills of one member that name another (her nation, hull, fleet role, class or name), from the
// same ally matching as the modal's Interaction section. Shown, not yet applied to the figures:
// most are timed buffs whose uptime is not modelled.
function renderFleetSynergies() {
  const members = fleetMembers();
  const bySkill = new Map();
  for (const target of members) {
    const { results } = computeInteractions(target);
    for (const [category, entries] of Object.entries(results)) {
      for (const entry of entries) {
        if (!members.includes(entry.ship)) continue;
        const key = `${entry.ship.id}|${entry.skill.name}`;
        if (!bySkill.has(key)) bySkill.set(key, { from: entry.ship, skill: entry.skill, text: entry.text, targets: new Map() });
        const targets = bySkill.get(key).targets;
        if (!targets.has(target)) targets.set(target, INTERACTION_CATEGORY_LABELS[category].replace(/^By /, "").toLowerCase());
      }
    }
  }
  if (!bySkill.size) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = members.length > 1 ? "No skill of one member names another." : "Add ships to see which skills reach each other.";
    fleetSynergiesEl.replaceChildren(empty);
    return;
  }
  fleetSynergiesEl.replaceChildren(...[...bySkill.values()].map(({ from, skill, text, targets }) => {
    const details = document.createElement("details");
    details.className = "fleet-synergy";
    const summary = document.createElement("summary");
    const source = document.createElement("strong");
    source.textContent = `${from.displayName} \u2014 ${skill.name}`;
    const reach = [...targets].map(([ship, how]) => `${ship.displayName} (${how})`).join(", ");
    summary.append(source, ` \u2192 ${reach}`);
    const body = document.createElement("p");
    body.textContent = text;
    details.append(summary, body);
    return details;
  }));
}

// --- Port metric sorts ---

const RANK_BATCH = 40;
let rankRun = null;

// Missing figures are computed in batches so the page stays responsive (about a second for all
// 888); a run already under way is reused.
function refreshRankFigures() {
  if (rankRun) return rankRun;
  rankRun = Promise.all([loadDataScript("data/equipment.js"), loadDataScript("data/bosses.js"), loadDataScript("data/augments.js")])
    .then(() => new Promise(resolve => {
      const todo = ships.filter(ship => !rankFigures.has(ship));
      let index = 0;
      const step = () => {
        for (const end = Math.min(todo.length, index + RANK_BATCH); index < end; index++) {
          const ship = todo[index];
          rankFigures.set(ship, ship.equipment ? fleetShipFigures(ship, false) : null);
        }
        if (index < todo.length) {
          countEl.textContent = `Computing level 125 figures... ${index}/${todo.length}`;
          setTimeout(step, 0);
        } else {
          resolve();
        }
      };
      step();
    }))
    .catch(() => { countEl.textContent = "Equipment data could not be loaded."; })
    .finally(() => {
      rankRun = null;
      update();
    });
  return rankRun;
}

fleetSearchEl.addEventListener("input", updateFleetPicker);
document.getElementById("fleet-clear").addEventListener("click", () => {
  for (const row of Object.keys(fleetRowEls)) fleet[row].fill(null);
  fleetPickerEl.hidden = true;
  saveFleet();
  renderFleet();
});

showView(viewFromHash());
// Browsers restore a select's value on reload, so a metric sort can be active from the start.
if (metricSortKey()) refreshRankFigures();

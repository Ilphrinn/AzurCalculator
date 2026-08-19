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

// Filter chips pair up adjacent progression tiers (SR sits right below Priority, UR
// right below Decisive) into one clickable option instead of four separate chips —
// requested to declutter the Rarity row, since the split rarely matters when filtering.
const RARITY_FILTER_GROUPS = [
  { label: "Normal", values: ["Normal"] },
  { label: "Rare", values: ["Rare"] },
  { label: "Elite", values: ["Elite"] },
  { label: "SR/Priority", values: ["Super Rare", "Priority"] },
  { label: "UR/Decisive", values: ["Ultra Rare", "Decisive"] }
];

const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");
const searchClassEl = document.getElementById("search-class");
const sortEl = document.getElementById("sort-select");
const filtersEl = document.getElementById("filters");
const refreshBtn = document.getElementById("refresh-btn");

const ships = SHIPS_DATA;
const shipsById = new Map(ships.map(s => [String(s.id), s]));

// Flattened once so the Interaction tab can scan every skill in the game without
// rebuilding this list on every modal open — every skill (base AND "+" enhanced
// versions) is included; computeInteractions merges a matched base/"+" pair into one
// entry with a toggle rather than filtering one out up front, since which of the two
// actually matches a given category can differ (e.g. a "+" skill's added clause can
// mention a fleet role the base text never does at all).
const ALL_SKILLS_INDEX = ships.flatMap(s => (s.skills || []).map(skill => ({ ship: s, skill })));

// hullType is stored as a single word for two categories, but skill text always spells
// out the full "Ship" suffix in prose ("Repair Ship", "Munition Ship").
const HULL_TYPE_TEXT = {
  Munition: "Munition Ship",
  Repair: "Repair Ship"
};

// The wiki-standard hull-type abbreviations actually used in skill prose (confirmed
// against the Damage Calculations page: "BB/BC/BBV only", "your SSs and SSVs", etc.).
// Shared between the keyword highlighter (colors them like their full name) and the
// Interaction compound-qualifier check ("Sakura Empire CVs" only applies to CVs).
const HULL_ABBREVIATIONS = {
  DD: "Destroyer", CL: "Light Cruiser", CA: "Heavy Cruiser", CB: "Large Cruiser",
  BB: "Battleship", BC: "Battlecruiser", BBV: "Aviation Battleship",
  CV: "Aircraft Carrier", CVL: "Light Carrier", SS: "Submarine", SSV: "Aviation Submarine"
};
const HULL_TEXT_TO_ABBR = Object.fromEntries(Object.entries(HULL_ABBREVIATIONS).map(([a, t]) => [t, a]));

// One color per nation, grounded in each nation's actual Azur Lane / source-franchise
// branding (majors: national flag/military colors; collabs: the source franchise's own
// brand color) rather than a generic palette-slot pick. All 30 values individually
// checked for >=3:1 contrast against this app's dark surface (#0b1120); this can't also
// be CVD-safe pairwise at N=30 (color theory caps reliable categorical distinction at
// ~8 hues — see the `dataviz` skill), deliberately overridden in favor of authenticity.
//
// The 13 major/pirate nations use the user-supplied hex values verbatim EXCEPT Vichya
// Dominion, Iron Blood, and META, whose given hexes measured under 3:1 contrast on this
// dark surface (2.16/2.47/2.68) and were lightened in HSL space (same hue/saturation,
// +L only) until they cleared ~4:1 — don't "fix" these back to the literal supplied hex.
const NATION_COLORS = {
  // Major WW2 nations — user-supplied hex table (2026-08-17)
  "Eagle Union": "#2878B5",
  "Royal Navy": "#D8AE52",
  "Sakura Empire": "#C94C68",
  "Iron Blood": "#d04451", // lightened from #9C2732 (2.47:1 -> 4.15:1), same hue/sat
  "Dragon Empery": "#3A8A69",
  "Sardegna Empire": "#368063",
  "Northern Parliament": "#7296B5",
  "Iris Libre": "#4A8FC4",
  "Vichya Dominion": "#bf566e", // lightened from #7F3042 (2.16:1 -> 4.28:1), same hue/sat
  "Kingdom of Tulipa": "#D77A32",
  "Liga de Pedrería": "#35A6A1",
  "Universal": "#9aa0ab",
  // Siren / pirate
  "META": "#8568aa", // lightened from #674D88 (2.68:1 -> 4.09:1), same hue/sat
  "Tempesta": "#267C76",
  // Collab nations, colored after their source franchise's own branding
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

// Faction logo watermark shown behind the ship name in the modal header. Nations with a
// genuinely distinct icon on the wiki's own Nations page get their own logo; every
// collab nation that doesn't have one there shares "Um" — the wiki's own generic
// collab/Universal-style icon — instead of getting no watermark, since a shared
// watermark beats none for those.
// Source files: the wiki's own per-file "File:{code} 1.png" pages (full original
// resolution, 356-656px depending on nation), copied to `assets/faction-logos/{code}.png`
// — code mapping read off the Nations page's own table (each icon's wrapping
// <a title="..."> names its real nation); Universal ("Cm") has no row on that page at
// all (it's only mentioned in prose above the table) but its own dedicated file page
// confirms "Cm" is linked from the Universal article.
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

// ship.nationality stores "BLACK★ROCK SHOOTER (Nation)" — the "(Nation)" qualifier
// disambiguates the nation from other same-named entities in the source data, but never
// appears in actual skill prose and isn't meant to be shown to the user either (it was
// leaking into the filter panel and modal tags verbatim before this).
function nationDisplayName(nationality) {
  return nationality ? nationality.replace(/\s*\([^)]*\)$/, "") : nationality;
}

// Three things get color-coded: nations, stats, and named mechanics. Hull types, weapon
// terms, DMG/Damage, healing terms, fleet role (Vanguard/Main Fleet), and Siren are
// deliberately NOT part of this system — don't re-add one of these without an explicit
// ask, since it was a deliberate reduction, not an oversight.
//
// One color per stat, user-supplied hex table — verbatim, all 15 already cleared >=3:1
// contrast on this app's dark surface (#0b1120) with no lightening needed (unlike 3 of
// the nation colors). Abbreviation and spelled-out form share a color (FP/Firepower
// alike); each row also picked up whichever OTHER real-text variant the corpus actually
// uses (Ammo for Ammunition, Max HP for Health, etc — checked by occurrence count, not
// guessed). "Anti-Air" (hyphenated) is the form matched here, not "Anti Air" — only the
// hyphenated spelling actually occurs in skill text.
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

// A few status effects are shared game-wide vocabulary rather than one ship's own
// invention, and recur often enough to be worth learning by color: Burn (98 descriptions),
// Special Burn (41), Armor Break (40), Smokescreen (32), Flooding (20) — counted over the
// corpus, not assumed. Hues are mnemonic (fire, water, cracked armor, smoke) but are picks:
// unlike the nation and stat tables these were not supplied, and no saved wiki page
// documents what colors the game itself gives these effects, so swap any of them freely.
// Each row also lists whichever other spelling the corpus actually writes ("Burning",
// "Armor-broken"); a trailing "s" is already handled by the shared matcher.
const MECHANIC_COLOR_GROUPS = [
  { color: "#F2603C", terms: ["Burn", "Burning"] },
  { color: "#CE72E8", terms: ["Special Burn"] },
  { color: "#3D7FE8", terms: ["Flooding"] },
  { color: "#E8C255", terms: ["Armor Break", "Armor-broken"] },
  { color: "#9FB0C4", terms: ["Smokescreen"] }
];
const MECHANIC_COLORS = Object.fromEntries(MECHANIC_COLOR_GROUPS.flatMap(g => g.terms.map(t => [t, g.color])));

// A mechanic a single skill coins for itself — "Berserk Mode", "Frostshred", "Pearl Moon" —
// gets no palette entry of its own: it appears in one skill, so a color to memorize would
// mean nothing. They all share --accent, the color the mechanic's own section label already
// uses, which is what ties the name in the sentence to the block it heads.
const NAMED_MECHANIC_COLOR = "var(--accent)";

const KEYWORD_GROUPS = [
  // Nations are underlined (see highlightKeywords) as well as colored, since both
  // nations and stats carry many individual hues — the underline is what tells them
  // apart at a glance rather than relying on memorizing 45 colors. Mechanics get a third
  // treatment, a tinted chip, for the same reason: with three palettes sharing one
  // sentence, hue alone can no longer say which system a colored word belongs to.
  //
  // Mechanics keep the casing the wiki wrote rather than being normalized to the canonical
  // form the other two use — "smokescreen" is lowercase in 72 of its 87 occurrences, and
  // capitalizing them all would be the formatting visibly rewriting the text.
  { className: "kw-nation", perTermColor: t => NATION_COLORS[t], underline: true, terms: [...new Set(ships.map(s => nationDisplayName(s.nationality)).filter(Boolean))] },
  { className: "kw-stat", perTermColor: t => STAT_COLORS[t], terms: Object.keys(STAT_COLORS) },
  { className: "kw-mech", perTermColor: t => MECHANIC_COLORS[t], keepCase: true, terms: Object.keys(MECHANIC_COLORS) }
];

// Maps lowercase term -> { color, canonical, underline }. "canonical" is the properly-
// capitalized form (Destroyer, Light Cruiser, Sakura Empire...) used for display
// regardless of how the source skill text happened to capitalize it mid-sentence.
// Abbreviations (DD, FP...) keep their own all-caps canonical form instead of being
// Title-Cased.
const KEYWORD_INFO = new Map();
for (const g of KEYWORD_GROUPS) {
  for (const t of g.terms) {
    if (KEYWORD_INFO.has(t.toLowerCase())) continue;
    const color = g.perTermColor ? g.perTermColor(t) : g.color;
    KEYWORD_INFO.set(t.toLowerCase(), { color, canonical: t, className: g.className, underline: !!g.underline, keepCase: !!g.keepCase });
  }
}
// Longest term first so e.g. "Max HP" is matched whole rather than leaving a stray "HP".
// Each term also accepts an optional trailing "s" (Destroyer/Destroyers, etc.). The
// alternative after it (group 3) matches bare numbers/percentages ("15%",
// "3213") so skill values stand out from the surrounding prose — matched in the same
// pass as the keyword terms so numbers inside an already-colored span (e.g. inside "HP")
// can't be double-wrapped. The last alternative (group 4) matches the literal
// "[Operation Siren]" mode tag some skills use to mark roguelike-only behavior —
// bolded and colored on its own, distinct from the other palettes.
const OPERATION_SIREN_TAG_COLOR = "#E8A33D";
const KEYWORD_ALTERNATIVES =
  "\\b(" + [...KEYWORD_INFO.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|") + ")s?\\b" +
  "|(\\d+(?:\\.\\d+)?%?)" +
  "|(\\[Operation Siren\\])";

// Named mechanics are per-skill, so they can't live in the fixed vocabulary above — they
// come in as an argument and take group 1, ahead of everything else, so that a name
// starting with a term of its own ("Standard Armor Break") is matched whole rather than
// losing its first word to the shorter global match. With no names to add, group 1 becomes
// a pattern that can never match, which keeps every other group's number stable.
let cachedKeywordRe = null;
function keywordRegExp(names) {
  if (!names || !names.length) return cachedKeywordRe || (cachedKeywordRe = new RegExp("((?!))|" + KEYWORD_ALTERNATIVES, "gi"));
  const alternatives = names.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  return new RegExp("\\b(" + alternatives + ")\\b|" + KEYWORD_ALTERNATIVES, "gi");
}

function keywordInfoFor(matchText) {
  const lower = matchText.toLowerCase();
  if (KEYWORD_INFO.has(lower)) return { ...KEYWORD_INFO.get(lower), plural: false };
  if (lower.endsWith("s") && KEYWORD_INFO.has(lower.slice(0, -1))) return { ...KEYWORD_INFO.get(lower.slice(0, -1)), plural: true };
  return null;
}

// Walks every text node already inside `container` (so it works whether the content was
// set via textContent or as sanitized wiki HTML with existing <b> tags) and wraps each
// recurring keyword in a colored span, without disturbing surrounding markup.
// `mechanics` are the names this particular skill coins for itself (see namedMechanics).
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
        const info = keywordInfoFor(m[0]);
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

// The very first animated gif decoded on the page seems to pay a one-time browser
// setup cost (regardless of which file it is), so warm that up immediately on load —
// long before the user opens any ship and hovers a barrage icon — rather than waiting
// for a modal to open.
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

// active[group] is a Set of selected values; empty Set means "no filter" for that group
const active = {
  rarity: new Set(),
  hullShort: new Set(),
  role: new Set(),
  nationality: new Set()
};

const HULL_ICON_DIR = "assets/hull-icons/";

const FILTER_GROUPS = [
  { key: "rarity", label: "Rarity", options: RARITY_FILTER_GROUPS.filter(g => g.values.some(v => uniqueValues("rarity").includes(v))) }
];

// Front-to-back fleet order. Hull types are grouped under their fleet position so the
// position itself doesn't need its own separate filter row.
const ROLE_ORDER = ["Vanguard", "Main", "Submarine"];

// Nations with few ships (mostly one-off collab factions) are tucked into a
// "Subfactions" dropdown instead of getting their own chip, to keep the header compact.
const MAJOR_NATION_MIN_SHIPS = 20;

// These nations stay below the ship-count threshold but are still core factions,
// not one-off collabs, so they always get their own chip.
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
  // Filter state stays keyed on the raw nationality value ("...(Nation)" qualifier and
  // all) — only the label shown to the user is cleaned up.
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

// Same click-to-toggle chip as makeChip, but the chip represents SEVERAL underlying
// values at once (e.g. "SR/Priority" toggling both "Super Rare" and "Priority" in the
// active Set together) — used for the Rarity row's paired-tier chips.
function makeMultiChip(group, values, label) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = label;
  if (values.some(v => active[group].has(v))) chip.classList.add("active");
  chip.addEventListener("click", () => {
    if (values.some(v => active[group].has(v))) {
      values.forEach(v => active[group].delete(v));
      chip.classList.remove("active");
    } else {
      values.forEach(v => active[group].add(v));
      chip.classList.add("active");
    }
    update();
  });
  return chip;
}

// Groups distinct hull-type abbreviations (short codes like "DD", "CVL") under
// their fleet position, keeping each short code's full name for the tooltip.
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

  for (const group of FILTER_GROUPS) {
    const wrap = document.createElement("div");
    wrap.className = "filter-group";

    const title = document.createElement("span");
    title.className = "filter-group-label";
    title.textContent = group.label;
    wrap.appendChild(title);

    for (const option of group.options) {
      wrap.appendChild(makeMultiChip(group.key, option.values, option.label));
    }
    filtersEl.appendChild(wrap);
  }

  // Nation row: major nations get a direct chip, everything else lives behind a dropdown
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

function applySearch(list) {
  const q = searchEl.value.trim().toLowerCase();
  const qClass = searchClassEl.value.trim().toLowerCase();
  let result = list;
  if (q) result = result.filter(s => s.displayName.toLowerCase().includes(q));
  if (qClass) result = result.filter(s => (s.class || "").toLowerCase().includes(qClass));
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

function render(list) {
  grid.innerHTML = "";
  countEl.textContent = `${list.length} character${list.length > 1 ? "s" : ""}`;

  if (list.length === 0) {
    grid.innerHTML = `<p class="empty">No character matches these filters.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const ship of list) {
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

    const baseImg = document.createElement("img");
    baseImg.className = "thumb-base";
    baseImg.src = ship.thumbnail;
    baseImg.alt = ship.displayName;
    baseImg.loading = "lazy";
    thumbWrap.appendChild(baseImg);

    if (ship.hasRetrofit && ship.retrofitIcon) {
      const retrofitImg = document.createElement("img");
      retrofitImg.className = "thumb-retrofit";
      retrofitImg.src = ship.retrofitIcon;
      retrofitImg.alt = `${ship.displayName} (retrofit)`;
      retrofitImg.loading = "lazy";
      thumbWrap.appendChild(retrofitImg);

      const badge = document.createElement("span");
      badge.className = "retrofit-badge";
      badge.title = "Retrofit available — hover to preview";
      badge.textContent = "⟲";
      thumbWrap.appendChild(badge);
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
sortEl.addEventListener("change", update);

refreshBtn.addEventListener("click", () => {
  resetAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

buildFilterPanel();
update();

// ---- Detail modal ----

// One single compact grid matching the game's own compact stat panel exactly — a
// 3-column layout (HP/Armor/RLD, FP/TRP/EVA, AA/AVI/Cost, ASW/·/·, reading order
// top-left to bottom-right), one value per stat with any skill delta shown inline
// ("478 +178" in one cell) rather than a separate Base/Real pair, since the in-game
// panel never shows a base stat on its own. The trailing row (Speed, Accuracy, Luck)
// isn't part of that in-game grid but renders through the same cell style for visual
// consistency. Ammunition, Oxygen, and Oil Consumption are omitted entirely — 0/888
// ships carry any numeric value for them, so every row would've shown "—" forever.
// `key: "cost"` is a marker only — Cost isn't part of the normal per-level stat
// pipeline (see computeOilCost), so buildStatsGrid special-cases it. The two `null`
// entries are blank cells (the game's panel leaves Cost's neighbor and the
// submarine-only Oxygen slot empty too). Abbreviated labels match the game's own
// compact wording; the full name is available via the `title` tooltip.
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

const NUMERIC_STAT_KEYS = STAT_GRID.filter(d => d && !d.text && !d.custom).map(d => d.key);

const SKILL_TYPE_LABELS = { offense: "Offense", support: "Support", defense: "Defense" };

const modalEl = document.querySelector(".modal");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const modalImageCol = document.querySelector(".modal-image-col");
const modalImage = document.getElementById("modal-image");
const modalSkinNameEl = document.getElementById("modal-skin-name");
const modalSkinStrip = document.getElementById("modal-skin-strip");
const modalName = document.getElementById("modal-name");
const modalHullIcon = document.getElementById("modal-hull-icon");
const modalNationWatermark = document.getElementById("modal-nation-watermark");
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
const modalSkillsSection = document.getElementById("modal-skills-section");
const modalSkillsMaxToggle = document.getElementById("modal-skills-max-toggle");
const modalSkillsList = document.getElementById("modal-skills");
const modalBarragesSection = document.getElementById("modal-barrages-section");
const modalBarragesList = document.getElementById("modal-barrages");
const modalInteractionSection = document.getElementById("modal-interaction-section");
const modalInteractionList = document.getElementById("modal-interaction");
const gifPreview = document.getElementById("gif-preview");

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

// Ships imported by hand from individual wiki pages (no base/growth/enhance data
// available) instead carry a handful of known reference points — Base, Lv.100,
// Lv.120, Lv.125 — read straight off their wiki stat table. We linearly interpolate
// between whichever two points bracket the requested level.
// Curve points come straight from a parsed wiki table and carry extra fields
// (level, ...) beyond the stats we display — always rebuild a clean object
// restricted to the numeric stats so those don't leak into the UI. Only keys
// actually present on the point are copied, so e.g. a ship with no oxygen data
// still has no oxygen data afterwards (renders as "—", not a fake 0).
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

// STATS = enhance + base + growth * max(level-1, 1) / 1000, plus the retrofit's own
// stat bonus when a Retrofit skin is selected. Speed and Luck have growth = 0 in the
// source data, so they naturally stay constant across levels. Keys with no source data
// (oil consumption, oxygen, ammunition — not tracked for the non-custom-imported ships)
// are left unset rather than defaulted to 0.
// Sortie oil "Cost" — reintroduced from Site web/Oil Cost - Azur Lane Wiki.htm after
// having been dropped earlier as untracked data. Unlike every other stat here, Cost
// isn't level-scaled from a base/growth curve — it's computed from the wiki's own
// formula: MaxCost (hull type + rarity + a META bonus + the limit-break bonus + a small
// per-class modifier) combined with the current level. Verified against the wiki's own
// worked example ("At Limit Break level caps" table, MaxCost=7 row) before trusting it —
// the naive reading of the MathML ("MaxCost·100 + min(Level,99), all over 200") didn't
// reproduce that table's numbers; the correct grouping is
// MaxCost·(100+min(Level,99))/200, confirmed against all 5 columns of that row.
//
// This app has no limit-break tracking at all (no UI concept of duplicate-based star
// investment — the level control doesn't imply one either, since a ship can be leveled
// anywhere below its cap independent of how many stars it has). Rather than guess a
// mid-progression state, the limit-break bonus is always the MAX one (+6 surface / +3
// submarine) — the same fixed assumption the wiki itself already mandates for PR/DR/UR/
// META ships regardless of investment, extended here to every ship for one consistent,
// comparable number. Same "fully invested" spirit as Effective Stats already assuming
// max skill level — not a guess, just the only stable value with no per-player state.
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
// "A few ships also have an extra Oil Cost modifier" (per-class, keyed here by every
// member ship's own display name from the wiki's "Ships from class" column, rather than
// by ship.class text, since a couple of these — Minato Aqua, Homura — have no shared
// class at all).
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
  evasionRate: "Evasion Rate"
};

// A combat modifier is usually restricted to a specific target or weapon: Alvitr's
// "DMG Dealt +15%" only applies to Light Armor enemies. One summed number per stat hid
// that restriction, and worse, added together bonuses that never apply to the same shot
// (an unconditional +10% and a "+15% vs Light Armor" are not a +25%), so bonuses are
// grouped per (stat, qualifier) and each pill carries its own source sentence.
//
// The qualifier is whatever surrounds the stat term inside the bonus's own captured
// phrase, once the verb, the possessive and the trailing "by X% (Y%)" are cut away:
// "Increases this ship's DMG dealt to Light Armor enemies by 5% (15%)" -> target
// "to Light Armor enemies"; "Increases this ship's Main Gun efficiency by 1% (10%)"
// -> source "Main Gun".
const MODIFIER_TERM_RE = /\b(?:DMG dealt|damage dealt|DMG|damage|crit(?:ical)?(?:\s+(?:rate|dmg|damage))?|evasion rate|hit rate|accuracy|efficiency)\b/gi;

// Only a weapon/source name in front of the stat term is a real qualifier — anything
// else sitting there is a possessive ("this boat's", "Tirpitz's") or another stat riding
// the same sentence ("FP and Crit Rate"). Cased canonically, since the wiki writes these
// both ways ("Main Gun efficiency" / "main gun efficiency") and pills sit side by side.
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

// A trailing qualifier only counts when it reads as a restriction ("to Sirens",
// "against Light Armor enemies", "with AP"). "dealt" — left over from "Crit DMG dealt" —
// and "by self" are just phrasing, not a condition.
const MODIFIER_TARGET_RE = /^(?:to|against|with|from|for|while|during|when|vs\.?)\s/i;

function modifierQualifier(raw) {
  const phrase = (raw || "")
    .replace(/\s*\bby\s+[-+\d.]+\s*%?[\s\S]*$/i, "")
    .replace(/^\s*(?:increase[sd]?|raise[sd]?|boost(?:s|ed)?)\s+/i, "")
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

// "Main Gun" + weaponEfficiency reads as "Main Gun Efficiency", not "Main Gun Weapon
// Efficiency" — the generic label only stands in when no weapon is named.
function modifierLabel(modifier) {
  const label = COMBAT_MODIFIER_LABELS[modifier.key] || modifier.key;
  if (!modifier.source) return label;
  return modifier.key === "weaponEfficiency"
    ? `${modifier.source} Efficiency`
    : `${modifier.source} ${label}`;
}

// The captured phrase drops whatever gated it ("Once per battle, when this barrage
// scores a total of 3 hits: ..."), which is exactly the context a pill needs to be
// trustworthy — so the tooltip quotes the whole sentence the bonus was extracted from,
// at max skill level to match the number the pill shows.
function modifierSourceText(entry) {
  const text = stripHtml(entry.skill.description || "").replace(/\s+/g, " ").trim();
  const needle = (entry.raw || "").replace(/\s+/g, " ").trim();
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return `${entry.skill.name} — ${renderLevelValues(needle, true)}`;
  const start = text.lastIndexOf(". ", at);
  let end = text.indexOf(". ", at + needle.length);
  end = end < 0 ? text.length : end + 1;
  const sentence = text.slice(start < 0 ? 0 : start + 2, end).trim();
  return `${entry.skill.name} — ${renderLevelValues(sentence, true)}`;
}

// Implements the wiki's own "CurrentScalingStat" formula (Damage Calculations page):
// (ShipBaseStat + sum of flat buffs) * (1 + sum of percent buffs) + sum of skill flat buffs.
// We have no equipment/Meowfficer/Fleet Tech data, so ShipBaseStat is just the already-leveled
// stat from computeStats/interpolateStatsCurve, and every bonus we fold in comes from the
// ship's own currently-active self-scope skill bonuses. Two-stage skill values ("10% (30%)")
// use the max (fully-leveled skill) figure, since this is meant to show best-case potential.
// Bonuses that require a fleet-composition condition (e.g. "if 3+ Sakura Empire ships")
// can't be verified without a team context, so they're counted as if met — this is a
// "full potential" estimate, not a guarantee, and the UI says so.
//
// The build-time skill-text extraction that produced statBonuses isn't perfect: it
// occasionally (a) captures the same bonus phrase twice off one skill description, (b)
// tags a bonus "self" even when its own matched text plainly targets other ships ("...of
// your DDs by 5%"), and (c) the reverse — tags a bonus "fleet" even though its own matched
// text is self-referential ("increases this ship's EVA by 5%", e.g. Brest's first skill).
// All three are guarded against here rather than by re-running the extraction, since a
// runtime text check on the bonus's own captured phrase is enough to catch what matters.
const SELF_LANGUAGE_RE = /\b(this ship('s)?|her own|own)\b/i;
const OTHER_SHIPS_TARGET_RE = /\byour\s+(DDs?|CLs?|CAs?|CBs?|BBs?|BCs?|CVs?|CVLs?|SSs?|SSVs?|Vanguard|Main Fleet|fleet)\b/i;

function computeEffectiveStats(ship, level, isRetrofit, isAugmented, isFateSim) {
  const base = computeStats(ship, level, isRetrofit);
  if (!base) return null;

  const skills = getSkillsForState(ship, isRetrofit, isAugmented, isFateSim);
  const percentSum = {};
  const flatSum = {};
  const modifiers = [];
  const modifierIndex = new Map();
  const seenRaw = new Set();

  for (const skill of skills) {
    for (const b of (skill.statBonuses || [])) {
      const isSelfScoped = b.scope === "self" || (b.raw && SELF_LANGUAGE_RE.test(b.raw));
      if (!isSelfScoped) continue;
      if (b.raw && OTHER_SHIPS_TARGET_RE.test(b.raw)) continue;
      const dedupeKey = `${skill.name}::${b.raw}::${b.min}::${b.max}`;
      if (seenRaw.has(dedupeKey)) continue;
      seenRaw.add(dedupeKey);
      const amount = typeof b.max === "number" ? b.max : b.min;
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

  const stats = {};
  for (const key of NUMERIC_STAT_KEYS) {
    if (!(key in base)) continue;
    const pct = percentSum[key] || 0;
    const flat = flatSum[key] || 0;
    const value = pct || flat ? Math.round(base[key] * (1 + pct / 100) + flat) : base[key];
    stats[key] = { value, delta: value - base[key] };
  }

  return { stats, modifiers };
}

// Builds the compact 3-column grid matching the game's own stat panel — one cell per
// stat, no header row since the grid IS the layout (each cell carries its own icon +
// abbreviated label). A `null` entry in gridDefs (see STAT_GRID) renders as an empty
// cell so the blank slots the game's own panel has (Cost, and the Oxygen-for-submarines
// slot) still hold their place in the 3-column shape instead of collapsing it. Populates
// `container` directly rather than building/returning its own wrapper, since the whole
// stats section is one grid now.
//
// A boosted stat shows "base+delta (real)" — e.g. "286+69 (355)" — rather than just the
// final real number: showing only the post-skill value with no base in sight makes it
// ambiguous which number is which, so the base figure is shown explicitly alongside the
// delta and the real total.
function buildStatsGrid(container, gridDefs, ship, level, base, effective) {
  for (const def of gridDefs) {
    const cell = document.createElement("div");
    cell.className = "stat-grid-cell";
    if (!def) {
      cell.classList.add("stat-grid-blank");
      container.appendChild(cell);
      continue;
    }

    // "Cost" isn't part of the normal per-level stat pipeline at all (own formula, no
    // skill-bonus delta), so it skips both the effective-stats lookup and the base block
    // entirely and goes straight through computeOilCost().
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
      value.appendChild(document.createTextNode(formatStatValue(baseRaw)));
      const deltaEl = document.createElement("span");
      deltaEl.className = "stat-delta";
      deltaEl.textContent = delta > 0 ? `+${delta}` : `${delta}`;
      value.appendChild(deltaEl);
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

  for (const modifier of effective.modifiers) {
    const pill = document.createElement("span");
    pill.className = "combat-modifier-pill";
    if (modifier.target) pill.classList.add("has-target");
    pill.title = modifier.sources.map(modifierSourceText).join("\n\n");

    const value = document.createElement("span");
    value.className = "combat-modifier-value";
    value.textContent = `${modifierLabel(modifier)} +${Math.round(modifier.amount * 100) / 100}%`;
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

// The wiki writes every level-scaled skill value as "base (max)" — "increases this
// character's FP by 3.5% (8%)" means 3.5% at skill level 1 and 8% at level 10. Carrying
// both numbers through every sentence is what makes long descriptions unreadable, so
// only ever one of the two is shown: the base value by default, the max-level one when
// the "Max Level" toggle is on. Either way the parentheses themselves disappear.
//
// Descriptions are pre-sanitized to plain text plus <b> tags, and those tags routinely
// sit between the two numbers ("<b>20%</b> <b> (40%)"). Rather than drop whatever falls
// inside a match — which would leave unbalanced markup and bold the rest of the
// paragraph — every tag inside the matched span is carried over into the replacement in
// its original order, so only the numbers and the parentheses themselves disappear.
const LEVEL_PAIR_GAP = "(?:\\s|<\\/?b>)*";

// "3.5% (8%)" → "3.5%" or "8%". A value can be signed, and a penalty shrinking with skill
// level makes the max the smaller number ("-40% (-20%)", Little Renown's 2nd salvo).
// Guarded on the two values carrying the same sign and unit, so the wiki's own typos
// ("for 20s (50)s", "5% (15)%", "-1.5 (6%)") are left untouched rather than mangled.
const LEVEL_PAIR_NUMBER_RE = new RegExp(
  `([+-]?)(\\d+(?:\\.\\d+)?)(%|s)?(${LEVEL_PAIR_GAP})\\((${LEVEL_PAIR_GAP})([+-]?)(\\d+(?:\\.\\d+)?)(%|s)?(${LEVEL_PAIR_GAP})\\)`,
  "g"
);

// "Lv.1 (Lv.10)" → "Lv.1" or "Lv.10", the level of a skill-scaled barrage. Spacing after
// "Lv." varies between pages, hence the optional space on both sides.
const LEVEL_PAIR_LV_RE = new RegExp(
  `(Lv\\.\\s?\\d+)(${LEVEL_PAIR_GAP})\\((${LEVEL_PAIR_GAP})(Lv\\.\\s?\\d+)(${LEVEL_PAIR_GAP})\\)`,
  "g"
);

// "All Out Assault - Fletcher Class I (II)" → "... Class I" or "... Class II", the tier
// the attack reaches at each end of the skill's level range. Some pages use the Unicode
// numerals Ⅰ/Ⅱ instead of the ASCII letters, and a handful write the pair the other way
// round ("All Out Assault (I) Ⅱ", base parenthesized instead of max) — both orders mean
// the same thing, so both collapse to a single numeral.
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

// `atMaxLevel` picks which half of each pair survives; the other half and the
// parentheses are dropped.
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

// Wiki skill descriptions are one unbroken paragraph of prose — up to 8 sentences, with
// nested conditions and ";"-separated effect lists all running together. These turn that
// prose into blocks: a condition line followed by its actions as bullets, one block per
// sentence. Nothing is reworded and no character is dropped except the separators that
// bullets replace, so the text stays exactly what the wiki says.
//
// This runs on the HTML string rather than the DOM, which is safe here because
// descriptions are sanitized down to balanced <b> tags with no HTML entities anywhere —
// so a ";" or ". " found in the string is always prose, never markup. It has to run after
// renderLevelValues: splitting the raw text instead would trip over the "(8%)" halves the
// reader never sees.

// Every split has to ignore separators inside parentheses — an aside like "(DMG is based
// on the skill's level; can activate up to 2 times per battle)" carries semicolons that
// are not list separators (Moskva's "Frozen Fortress").
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

// Sticky flags: splitTopLevel anchors each test at the position it is inspecting.
// "…by 5. When the battle starts" is a real sentence end, so digits before the period are
// deliberately not excluded; the three exceptions that are NOT sentence ends are "Lv. 1"
// (a spacing variant of the barrage level), "No. 1" (San Diego's skill name) and a lone
// initial ("Allen M. Sumner", "William D. Porter").
// The second alternative catches a period the wiki glued straight to the next sentence
// with no space ("…Detection Gauge value by 10.As long as this ship is afloat:", Albion;
// "…by 3.5%.[Operation Siren]Every time…", Alabama). All 114 in the dataset are real
// sentence ends — no abbreviation is ever followed directly by a capital — and missing
// them let a whole sentence get swallowed into the next one's condition line.
const SENTENCE_SEPARATOR = /(?<!\bLv|\bNo|\b[A-Z])\.(?:\s+(?=[A-Z0-9"“(])|(?=[A-Z[]))/gy;
const SEMICOLON_SEPARATOR = /;\s*/gy;
const CLAUSE_SEPARATOR = /,\s+/gy;

// The wiki numbers parallel effects inline — "gains the following effects: 1) … 2) …"
// (A2's "Devastating Cleave") — which is a list already, just written as running text.
// Only "N)" counts: "N." is always a decimal or a sentence end in this dataset (48 cases,
// no real enumeration among them) and "N:" is a threshold table ("3 to 5: …", Implacable).
// The optional trailing colon covers the wiki's own "2): Dive Bomber" slip (Béarn META).
// Tag-tolerant, because Juneau's "Martyr+" wraps every single word in its own <b>, marker
// included. The lookbehind keeps the marker to a real list number: it must open a token,
// never trail one, so a stray "…up to 10) " inside prose cannot pass for an item.
const ENUMERATION_SEPARATOR = new RegExp(
  `(?:^|(?<=[\\s>;:]))${LEVEL_PAIR_GAP}\\d\\)${LEVEL_PAIR_GAP}:?(?:\\s|<\\/?b>)+`,
  "gy"
);

// A sentence opening with a run of these is stating conditions, not effects.
const SUBORDINATE_CLAUSE_RE = /^(?:and |or |but |then )?(?:when(?:ever)?\b|while\b|during\b|if\b|once\b|after\b|before\b|upon\b|every\b|each time\b|the first time\b|at the (?:start|beginning|end)\b|for (?:every|each)\b|as long as\b)/i;

// "Activates All Out Assault I: Moskva once every 12 times…" — this colon ties the tier to
// the class the attack is named after, it introduces nothing. Only an exact "All Out
// Assault" + optional tier is excluded, so "All Out Assault II only: …" keeps its colon.
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

// Bullets are for the skills that actually need them: two or more actions, or a condition
// piled up from two or more clauses. A plain "Every 20s: fires a barrage." reads fine as
// one line and stays one line — 22% of the dataset's descriptions produce bullets.
function buildClauseBlock(sentence) {
  const colon = lastConditionColon(sentence);
  if (colon > -1) {
    const header = sentence.slice(0, colon + 1).trim();
    const items = splitTopLevel(sentence.slice(colon + 1), SEMICOLON_SEPARATOR);
    // A condition with nothing after its colon has to stay a plain line: it is the caption
    // of whatever follows (a numbered list, usually), and bulleting it would emit an empty
    // list ("When the battle starts, and every 20s:", Sakawa).
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

// A ";" list only reads as a list when a single condition at the front governs all of it.
// If no segment opens with a condition the segments are independent statements (Albion's
// "Unblemished White Cliffs"), and if several bring their own condition they are parallel
// pairs, not items (Nubian's "It's Cleaning Time!"). Both cases become standalone blocks
// instead of bullets dangling under nothing.
function governsSegmentList(segments) {
  const withColon = segments.filter(segment => lastConditionColon(segment) > -1).length;
  return withColon === 1 && lastConditionColon(segments[0]) > -1;
}

// Promoting a ";" clause to a block of its own makes it a sentence, so it gets sentence
// punctuation: the ";" it used to hang off becomes a period, and its first letter is
// capitalized. Skips any leading tag so "<b>if</b> there are…" is still caught.
function startSentence(html) {
  return html.replace(/^((?:<[^>]*>|\s)*)([a-z])/, (full, prefix, letter) => prefix + letter.toUpperCase());
}

// A numbered item routinely runs for several sentences (Béarn META's "1) Main Gun: …" spans
// three), so the list has to be carved out before sentences are split — otherwise each item
// is scattered across blocks and its "1)" is left stranded mid-paragraph. Items therefore
// hold blocks of their own rather than a string, and the sentence that introduces the list
// is lifted out to caption it.
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

  // Only the last item has no marker after it to bound it, so it would otherwise run to the
  // end of the skill and swallow whatever follows the list (A2's "Berserk Mode lasts for up
  // to 40s…"). Items are parallel by nature, so the last one is cut to the granularity its
  // siblings use: if none of them runs past a sentence end, neither does it.
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
  // The sentence right before the list introduces it, so it captions the bullets instead of
  // sitting above them as an unrelated paragraph.
  const caption = blocks.length && blocks[blocks.length - 1].text ? blocks.pop().text : null;
  // Items are often chained with ";" as well as numbered; the bullet already separates them,
  // so a trailing one would just dangle (Glorious META's "Rosen Mark").
  blocks.push({ header: caption, list: spans.map(span => buildSentenceBlocks(span.replace(/[;\s]+$/, ""))) });
  if (tail.trim()) blocks.push(...buildSentenceBlocks(tail));
  return blocks;
}

function buildSentenceBlocks(html) {
  const blocks = [];
  const rawSentences = splitTopLevel(html, SENTENCE_SEPARATOR);
  for (let i = 0; i < rawSentences.length; i++) {
    // The separator swallowed the period closing every sentence but the last, so give back
    // exactly those. Testing for a trailing period instead would both miss the ones hidden
    // behind a closing tag ("<b>max Health.</b>", Juneau) and invent one for a description
    // that genuinely ends without it ("(10s cooldown, starts on cooldown)", Atago).
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
  return blocks;
}

// Some skills describe two alternative versions of themselves, one per game mode, marked
// with the wiki's own bracketed tags — Alabama's "Just Gettin' Fired Up" is a full Regular
// description followed by a full Operation Siren one. Run together they read as a single
// list of effects, hiding the fact that only half of it applies at a time, so each tag
// starts its own labelled section.
//
// Only these six tags are modes. Other bracketed spans are status names that belong in the
// prose ("[Pursued]", "[Expurgating Flame]", "[Venus Concoction]") — they are told apart by
// this explicit list plus the position check below, since a status name is referenced
// mid-sentence while all 77 mode tags in the dataset sit at a sentence boundary. Reno's is
// wrapped in <b>, hence the tags consumed on either side.
const SKILL_MODE_TAG_RE = /(?:<\/?b>|\s)*\[(Regular play|Regular|Operation Siren only|Operation Siren|Exercise only|Non-Exercise Only)\](?:<\/?b>|\s)*/gi;
const SENTENCE_END_RE = /[.!?][)\]"”]*$/;

function skillModeColor(label) {
  return /Operation Siren/i.test(label) ? OPERATION_SIREN_TAG_COLOR : "var(--text-muted)";
}

// Some skills name a mechanic of their own — "Berserk Mode" (A2), "Frostshred" (Moskva),
// "[Pursued]" (Algérie META) — then spend several sentences describing it, which is what
// buries the rest of the skill. Those sentences get grouped under the mechanic's name.
//
// Detection is deliberately narrow, since a wrong grouping is worse than none: the name has
// to be introduced by one of these cue verbs AND reused later, so ordinary capitalized game
// vocabulary ("Main Guns", "Max HP") can never qualify.
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

// The cue verbs occasionally pick up bookkeeping instead of a name: "inflicts Lv.1 Holy
// Judgment" (Alsace) yields "Lv", and "inflicts DMG up to 6 times" (Little Prinz Eugen)
// yields "DMG". These two are the only ones in the dataset, so they are named outright
// rather than filtered by a minimum-length rule that would be arbitrary either way.
const NAMED_MECHANIC_STOPLIST = new Set(["lv", "dmg"]);

// The names to color inside one skill's own text. Looser than what earns a section: a name
// only has to be coined and then reused, whether or not the sentences around it happen to
// form one uninterrupted run. Mode tags are stripped first so "[Operation Siren]" can't be
// read as a mechanic by the bracket cue — it has its own color already.
function namedMechanics(html) {
  SKILL_MODE_TAG_RE.lastIndex = 0;
  const text = html.replace(SKILL_MODE_TAG_RE, " ").replace(/<[^>]*>/g, "");
  return mechanicNames(text).filter(name => {
    const lower = name.toLowerCase();
    if (NAMED_MECHANIC_STOPLIST.has(lower) || KEYWORD_INFO.has(lower)) return false;
    // Naming something once is just a sentence — the color has nothing to connect it to.
    const uses = text.match(new RegExp("\\b" + escapeRegExp(name) + "\\b", "gi"));
    return uses && uses.length >= 2;
  });
}

// Entering the mechanic and leaving it are transitions, not part of the state: each carries
// its own trigger and reads on its own, so they stay outside the section rather than opening
// and closing it (A2 — "…: enters Berserk Mode." above, "When Berserk Mode ends: …" below).
// What the label then covers is only what holds while the mechanic is active.
// Recognising the entry sentence may be looser than discovering the name in the first place:
// this only ever shrinks a section that already exists, so an extra verb here cannot invent
// one anywhere (Momo Belia Deviluke hands out Plan Execution with "gives", which is not a
// discovery cue — the name is found on a later "grants" instead).
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

// The blocks describing a mechanic have to form one uninterrupted run that leaves something
// outside it — a section covering the whole skill explains nothing (Moskva's "Unyielding
// Valor", where every sentence is about it). A second name inside the run means the split
// would be arbitrary, so nothing is grouped at all (Oumi's Elegant/Besotted pair).
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
  // Both eligibility tests above run on the untrimmed run on purpose: trimming only ever
  // shrinks it, so a run rejected for covering the whole skill stays rejected instead of
  // sneaking in through a transition sentence being moved out.
  let { first, last } = run;
  if (introducesMechanic(texts[first], run.name)) first++;
  if (last > first && endsMechanic(texts[last], run.name)) last--;
  return first <= last ? { name: run.name, first, last } : null;
}

// Mode-split skills are left alone: they already carry a label, and nesting a second one
// inside would compete with it.
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
    // Text sitting above an Operation Siren tag with no tag of its own IS the regular
    // version — the three skills that spell both tags out confirm the pairing. An explicit
    // [Regular play] or [Exercise only] section means the opposite: what precedes it is a
    // shared preamble (U-2501, Honoka), so it stays unlabelled.
    const impliesRegular = /Operation Siren/i.test(marks[0].label);
    sections.push({ mode: impliesRegular ? "Regular" : null, blocks: buildSkillBlocks(lead) });
  }
  for (let i = 0; i < marks.length; i++) {
    const body = html.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : html.length).trim();
    if (body) sections.push({ mode: marks[i].label, blocks: buildSkillBlocks(body) });
  }
  return sections;
}

// No <b> currently spans a split point anywhere in the dataset, but a fragment that ends
// mid-bold would otherwise bold everything after it, so each one is closed off and the
// tag reopened on the next.
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

function appendSkillDescription(container, html) {
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

// Some retrofit skills replace a base skill and say so in their own description,
// e.g. "(Replaces Burn Order)". We use that text to pick which half of the skill
// list belongs to the base ship vs. the retrofitted one.
// The wiki marks each skill's name with "(R)" if it requires retrofit, or "(Aug)" if
// it's a Unique Augment variant — a separate equipment-like system from retrofit.
// isModified/isRetrofitVersion (precomputed at build time from "(R)" + "(Replaces X)")
// tell us which skill a retrofit skill replaces, so the old one can be hidden.
// Unique Augment and Fate Simulation skills both always immediately follow the base
// skill they replace in the source data, so that adjacency (not name-matching, which
// isn't consistent across ships) is what pairs an "(Aug)"/"(FS)" skill with the one it
// swaps out. Fate Simulation is a Research-ship-only mechanic that (like Augment) only
// ever changes skills — no stats, art, or rarity change like a real Retrofit.
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

// Shared by the "Skills" section header toggle and the per-skill ones. The last state the
// user picked sticks across re-renders (flipping Retrofit/Augment) and across characters,
// so the choice only has to be made once per session rather than on every skill of every
// ship opened.
let skillsAtMaxLevel = false;
let skillMaxLevelToggles = [];

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

// The header toggle reads as "on" only while every skill under it is, so flipping the last
// one by hand keeps the two in agreement instead of leaving the header stale. Skills with
// no level-scaled value at all carry no toggle, hence no header button either.
function syncSkillsMaxLevelToggle() {
  modalSkillsMaxToggle.hidden = skillMaxLevelToggles.length === 0;
  if (modalSkillsMaxToggle.hidden) return;
  skillsAtMaxLevel = skillMaxLevelToggles.every(({ toggle }) => isMaxLevelToggleOn(toggle));
  setMaxLevelToggle(modalSkillsMaxToggle, skillsAtMaxLevel);
}

modalSkillsMaxToggle.addEventListener("click", () => {
  skillsAtMaxLevel = !isMaxLevelToggleOn(modalSkillsMaxToggle);
  setMaxLevelToggle(modalSkillsMaxToggle, skillsAtMaxLevel);
  for (const { toggle, paintDescription } of skillMaxLevelToggles) {
    setMaxLevelToggle(toggle, skillsAtMaxLevel);
    paintDescription(skillsAtMaxLevel);
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

    // Highlight the skill(s) that changed with this retrofit, framed in the rarity
    // color the ship just gained — covers both skills that replace an older one and
    // skills that are brand new on retrofit, but never its pre-retrofit counterpart
    // or unrelated Unique Augment skills.
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
      // Only the numbers differ between the two, so the mechanic names are the same either
      // way and are found once rather than on every repaint.
      const mechanics = namedMechanics(atBase);

      // Description is sanitized at build time to only ever contain plain text and <b> tags,
      // used here to keep the wiki's own "important point" highlighting.
      const paintDescription = (atMaxLevel) => {
        appendSkillDescription(desc, atMaxLevel ? atMax : atBase);
        highlightKeywords(desc, mechanics);
      };

      // No toggle on skills whose text holds no level-scaled value at all (a plain
      // "increases this ship's FP by 5%" reads the same either way), so the button only
      // shows up where it actually changes something.
      if (atBase !== atMax) {
        const maxToggle = createMaxLevelToggle();
        maxToggle.title = "Show this skill's values at max skill level (Lv.10)";
        maxToggle.addEventListener("click", () => {
          setMaxLevelToggle(maxToggle, maxToggle.getAttribute("aria-pressed") !== "true");
          paintDescription(isMaxLevelToggleOn(maxToggle));
          syncSkillsMaxLevelToggle();
        });
        setMaxLevelToggle(maxToggle, skillsAtMaxLevel);
        head.appendChild(maxToggle);
        skillMaxLevelToggles.push({ toggle: maxToggle, paintDescription });
      }

      paintDescription(skillsAtMaxLevel);
      body.appendChild(desc);
    }

    item.appendChild(body);
    modalSkillsList.appendChild(item);
  }

  syncSkillsMaxLevelToggle();
}

// Shown over the character portrait (left side of the modal) rather than next to the
// hovered icon, so the barrage table's numbers on the right stay fully readable while
// previewing the animation. Anchored to the bottom of the portrait via the CSS `bottom`
// property (not `top`) so it lines up correctly regardless of the preview's own height,
// which isn't known until the image finishes loading.
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

// A barrage row's skillName can carry extra suffix text the skill itself doesn't have
// (e.g. "All Out Assault - Leander-class II"), so it's matched the same way barrage
// rows were originally paired with skills: longest normalized-prefix match.
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

// Mirrors getSkillsForState: a barrage row for a base skill is hidden once the toggle
// for whatever replaces it (Retrofit/Unique Augment/Fate Simulation) is switched on,
// and a barrage row for the replacement skill only shows once that toggle is on.
function getBarragesForState(ship, isRetrofit, isAugmented, isFateSim) {
  const skills = ship.skills || [];
  return (ship.barrages || []).filter(b => {
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

function renderModalBarrages(ship, isRetrofit, isAugmented, isFateSim) {
  const barrages = getBarragesForState(ship, isRetrofit, isAugmented, isFateSim);
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
  // Multi-line clamped cells (name/notes) need the line-clamp box on an inner wrapper —
  // applying display:-webkit-box directly to a <td> breaks its table-cell layout.
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
    // The flex row of icons lives on an inner wrapper, not the <td> itself — display:flex
    // directly on a table cell breaks its table-cell participation (it stops respecting
    // vertical-align and can throw off the whole row's height), the same issue as the
    // name/notes cells' line-clamp wrappers.
    const gifWrap = document.createElement("div");
    gifWrap.className = "barrage-gif-wrap";
    // Rows for the same skill (different armor/level breakdowns) share the same
    // animation — show it once rather than repeating the identical thumbnail down
    // every row.
    const newGifs = (b.gifs || []).filter(g => !shownGifIds.has(g.id));
    newGifs.forEach(g => {
      shownGifIds.add(g.id);
      const img = document.createElement("img");
      img.className = "barrage-gif";
      // A single generic "play" icon for every row — the actual per-barrage animated
      // gif only ever appears in the big hover preview.
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

// Hovering used to trigger a cold fetch+decode of the full animated gif (some run to
// 300+ frames), which visibly played in slow motion while the browser caught up. Quietly
// warming the browser's cache for every gif this ship could show — across all
// Retrofit/Augment/Fate Simulation states, not just what's visible right now — means
// it's already decoded by the time the user actually hovers.
const preloadedGifIds = new Set();
function preloadBarrageGifs(ship) {
  (ship.barrages || []).forEach(b => {
    (b.gifs || []).forEach(g => {
      if (preloadedGifIds.has(g.id)) return;
      preloadedGifIds.add(g.id);
      const preloadImg = new Image();
      preloadImg.src = g.path;
      // .src alone only guarantees the bytes are fetched — decode() is what forces the
      // browser to actually decode every animation frame ahead of time, off-screen.
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

// Same label/color convention already used for the ship's own Retrofit/Unique
// Augment/Fate Simulation toggles at the top of the modal — reused here for the
// Interaction tab's per-entry "+" button so it reads as the same concept everywhere,
// covering all three "+" mechanisms (a handful of "+" skills carry no marker at all —
// e.g. Drake's "Flintlock Burst (A)+" — those fall back to the generic label/color).
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

// Strips the wiki's "(Replaces Old Skill Name)" build note some retrofit/Aug/FS skills
// carry — it's bookkeeping about which skill this one swaps out, not battle text, but
// the replaced skill's own name can coincidentally contain a hull-type word (e.g.
// "(Replaces Pocket Battleship)"), which would otherwise register as a false interaction.
function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, "").replace(/\(Replaces [^)]+\)/gi, "");
}

// Many "Hunter" skills read like "Increase own damage dealt to Battleships by 4%" —
// bonus damage against an ENEMY of that hull type/nation, not a fleet buff for an ALLY
// of that type. Since this calculator is ally-team-composition only (no PvP/Exercise
// matchups), a match is only counted when the local text around it doesn't carry one of
// these enemy-targeting cues. This is what excludes e.g. Centaur's "damage dealt to
// Battleships" from showing up as an interaction with Izumo (a Battleship). Covers both
// "damage dealt/dealt to" phrasing AND the bare "DMG to X" / "DMG this ship deals to X"
// shorthand the wiki also uses for the same Hunter-bonus concept.
const ENEMY_TARGET_CUE_RE = /\b(damage dealt to|dmg dealt to|damage dealt against|dmg dealt against|damage against|dmg against|deals?\s+to|deals?\b[^.]{0,25}\bdamage to|dmg to|damage to|against enemy|against enemies|dmg taken by enemy|damage taken by enemy|enemy(?:'s|s)?\s+(?:ships?|fleet|vanguard|main fleet))\b/i;
// The word "enemy"/"enemies" (optionally with a leading article, e.g. "an enemy") right
// before ANY category match — "enemy Royal Navy CL", "enemy DDs", "enemy Submarines" —
// covers every hull-abbreviation/nation combination without enumerating each one.
const ENEMY_IMMEDIATELY_BEFORE_RE = /\b(an?\s+)?enem(?:y|ies)('s)?\s*$/i;
// "Hit Rate against DDs" (Warspite) is the same Hunter-bonus concept as "DMG against
// DDs" but for a different stat — rather than list every stat name, treat "against"
// immediately before any match as enemy-targeting in general, since nothing in this
// dataset ever buffs an ally "against" something (that phrasing is PvP-only).
const AGAINST_CUE_RE = /\bagainst\s*$/i;

// Every ship's first skill is almost always named "All Out Assault", whose own text just
// names the special-attack variant after the ship's own class ("triggers All Out Assault
// - Deutschland Class"). That's a barrage's flavor name, never a fleet buff — Deutschland
// mentioning her own class here doesn't mean she buffs other Deutschland-class ships.
const ALL_OUT_ASSAULT_CUE_RE = /all out assault/i;

// "If sortied WITHOUT other Battleships: increases OWN damage" (Tirpitz) is a self-only
// buff gated on the ABSENCE of ships of that type — the opposite of an interaction with
// one. "fires a barrage FROM battleship Hiranuma" names a summoned unit's own type, not
// an allied ship in the fleet.
const NEGATIVE_CONDITION_CUE_RE = /\b(without|no)\s+(other\s+)?$/i;
const FROM_SOURCE_CUE_RE = /\bfrom\s+$/i;
// "If your Vanguard consists only of this ship..." (Bolzano META) is also a solo-fleet
// condition — it only activates when NO OTHER Vanguard ship is present, so it can't be an
// interaction with one. Checked after the match since the fleet/role word comes first
// ("your Vanguard consists only of...").
const SOLO_FLEET_CUE_RE = /\b(consists|comprised)\b[^.]{0,15}\bonly\b/i;
// "...if this ship is the only ship remaining in your Vanguard..." (Acasta) is the same
// solo-fleet condition as SOLO_FLEET_CUE_RE but phrased the other way round — "only"
// comes BEFORE the fleet/role word instead of after "consists/comprised" — so it needs
// its own check against the text immediately preceding the match.
const SOLO_FLEET_BEFORE_RE = /\bis\s+the\s+only\s+ship\s+remaining\s+in\s*(?:your\s+|the\s+)?$/i;
// "If this ship has Royal Navy gear/aircraft equipped" or "while equipping a CL Main Gun"
// is about this ship's OWN LOADOUT choice, not about having an allied ship of that
// nation/hull in the fleet — completely unrelated to team composition. Scanned forward to
// the next sentence boundary (not just immediately after) since the equipment noun is
// often past an "or Other Nation"/comma-separated list of acceptable nations
// ("Eagle Union, Iris Libre, or Vichya Dominion aircraft equipped").
const EQUIPMENT_CUE_RE = /\b(gear|aircraft|weapons?|main guns?|equipment)\b/i;
function equipmentConditionFollows(text, matchIndex, matchLen) {
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 70);
  const boundary = after.search(/[.;]/);
  return EQUIPMENT_CUE_RE.test(boundary === -1 ? after : after.slice(0, boundary));
}
// "If this ship is (not) in the frontmost position of/in the/your Vanguard: increases
// this ship's X" (Deutschland, Hermione, Alfredo Oriani, Admiral Hipper μ) is a
// self-positional check, not about which OTHER ships share the fleet — unlike
// "...applied to the frontmost ship of the Vanguard", which does target a (possibly
// different) ally and must NOT be caught by this guard. Both "of" and "in" precede the
// fleet word in real skill text ("position of your Vanguard" / "position in your
// Vanguard"), and the determiner varies ("the"/"your"/"this ship's") — all three are
// self-referential, so all are accepted here.
const FRONTMOST_POSITION_CUE_RE = /\bin the frontmost position (?:of|in)\s*(?:the|your|this ship's)?\s*$/i;

// "If this ship is (NOT) your frontmost {Vanguard/Main Fleet} ship: <self-only effect>"
// (Dmitri Donskoi, Admiral Hipper META's first clause) is also a self-positional
// condition — but unlike FRONTMOST_POSITION_CUE_RE it doesn't use the word "position" at
// all, so it needs a separate cue. Deliberately narrow (requires the "if this ship is"
// prefix) so it does NOT catch genuine target phrasing like "...around your frontmost
// Vanguard ship" (Admiral Hipper META's second clause, Essex, Elbe) which has no such
// prefix and must stay matched.
const IF_CONDITION_PREFIX_RE = /\bif\s+(?:there\s+(?:is|are)|this ship (?:is|has)(?:\s+not)?)\b/i;
// Broader fleet-wide target language — if a skill's effect clause (the part after a
// condition resolves with a colon) mentions any of these, it's a genuine ally-facing
// buff even though it was reached via an "if there is/are.../if this ship is..."
// condition (e.g. "if there are 3 ships in your Vanguard: increases your Vanguard's
// EVA..."). Its ABSENCE from the effect clause is what flags a self-only buff whose
// condition merely happened to mention the fleet/role word for headcount/position
// purposes (Brest, Admiral Hipper μ, Bremerton, Alfredo Oriani's Frontline Scoop).
const BROADER_FLEET_TARGET_RE = /\b(your vanguard|vanguard fleet|vanguard ships?|main fleet|your fleet|all your ships?|all ships|allied ships?|other ships?|each ship|every ship|frontmost vanguard ship|frontmost main fleet ship|frontmost ship)\b/i;

// Returns the text of the clause containing `index` — from the nearest preceding
// colon/sentence boundary up to `index` — so an "if...:" condition already closed by an
// earlier colon isn't mistaken for still being open (Baltimore μ's "if there is a CV,
// CVL, or Muse ship in the same fleet: increases this ship's EVA... and increases your
// Vanguard's AA..." — the second colon-bounded clause is a plain effect statement, not
// itself a condition, even though an earlier "if" appears further back in the sentence).
function clauseBefore(text, index) {
  const before = text.slice(0, index);
  const boundary = Math.max(before.lastIndexOf(":"), before.lastIndexOf(". "), before.lastIndexOf("; "));
  return before.slice(boundary + 1);
}

// A match sitting inside an "if there is/are.../if this ship is..." condition, followed
// immediately by a colon whose effect clause never mentions a fleet-wide target, is a
// self-only buff that merely used the fleet/role word as a headcount or positional
// condition (Brest: "if there are 3 ships in your Vanguard: increases this ship's EVA");
// requiring the colon to sit right after the match is what keeps this from misreading
// genuine targets like "...will also apply to your Vanguard ship with the lowest HP"
// (Ganj-i-Sawai), where the match is already inside the effect clause, not the
// condition, and no colon immediately follows it.
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

// Same self-only-condition idea as selfOnlyConditionedEffect, but for skills that use a
// comma instead of a colon to separate the condition from the effect (Acasta: "if this
// ship is the only ship remaining in your Vanguard (The ship that sinks does not have to
// be in the Vanguard), increase this ship's damage dealt..."). Acasta's clarifying aside
// repeats "Vanguard" a second time inside the parenthetical itself, so this is checked
// against EVERY match occurrence (not just the first) — allowing an optional trailing
// "(...)" aside, or just its closing ")" when the match sits inside one, before the
// comma and the self-only verb.
const COMMA_SELF_ONLY_EFFECT_RE = /^\s*(?:\([^)]{0,80}\)|\))?\s*,\s*(?:and\s+)?(?:increases?|decreases?|restores?|grants?|gains?)\s+this ship/i;
function commaSelfOnlyEffectFollows(text, matchIndex, matchLen) {
  return COMMA_SELF_ONLY_EFFECT_RE.test(text.slice(matchIndex + matchLen, matchIndex + matchLen + 100));
}

// "Vanguard Fleet Leader (First Slot)" (Bilibili's 22/33 pair) names a SLOT position —
// being sortied first — not a category of ships; the buff it gates is explicitly scoped
// to "both 22 and 33" by name, never a general Vanguard-wide effect.
const FLEET_LEADER_SLOT_RE = /^\s*Fleet Leader\b/i;

// Per explicit user instruction (2026-08-18): a fleet-wide buff gated behind a
// compositional/positional/status condition that ISN'T guaranteed simply by the
// candidate ship's own nation/hull/role — needing a specific OTHER ship type present
// (Baltimore μ: "if there is a CV, CVL, or Muse ship in the same fleet"), a specific
// slot/role assignment on the buffing ship (Admiral Zenker: "if this ship is the
// Flagship" — the fleet's leader slot specifically, distinct from just being "a Main
// Fleet ship"; frontmost/backmost/center position; Collett: "if this ship has the
// highest AA amongst your Vanguard"), or a headcount threshold ("if there are 3 ships in
// your Vanguard") — no longer counts as a genuine interaction AT ALL, even when the
// effect clause genuinely targets the whole fleet (previously only excluded when the
// effect turned out to be self-only — see selfOnlyConditionedEffect above). This is a
// stricter standard than the "conditions assumed met" philosophy Effective Stats still
// uses; the user drew the line specifically at buffs that depend on something beyond the
// candidate's own category membership, not at conditions in general (a periodic timer or
// "when this ship fires her Main Guns" action-trigger still eventually fires regardless
// of team composition, so those are untouched — only "if there is/are..." and "if this
// ship is/has..." state-gates are treated as unreliable).
//
// Scoped to the whole SENTENCE (bounded by the nearest preceding period, not just the
// nearest colon like selfOnlyConditionedEffect uses) since this game's skill text chains
// multiple colon-separated effect clauses under one earlier "if", using colons as plain
// clause separators rather than to close the condition — Baltimore μ's "if there is a
// CV, CVL, or Muse ship in the same fleet: increases this ship's EVA... and increases
// your Vanguard's AA..." has the match past a SECOND colon, but it's still governed by
// the "if" before the first.
function sentenceBefore(text, index) {
  const before = text.slice(0, index);
  const boundary = before.lastIndexOf(". ");
  return before.slice(boundary + 1);
}
// "(While/When/If) sortied with [a ship/equipment]..." (Arizona META: "...while sortied
// with a ship that has the 'Pearl's Tears' equipped: 50% chance to restore... to the
// ship in your Vanguard...") is the same third-party dependency as "if there is a
// CV/CVL/Muse ship" — just phrased as a partner requirement instead of a presence check.
const SORTIED_WITH_GATE_RE = /\bsortied with\b/i;
function structurallyGatedMatch(text, matchIndex) {
  const sentence = sentenceBefore(text, matchIndex);
  return IF_CONDITION_PREFIX_RE.test(sentence) || SORTIED_WITH_GATE_RE.test(sentence);
}

// A handful of ships happen to be named after generic game terms or ordinary words
// ("Vanguard" is a Royal Navy Battleship, "Fortune" a Royal Navy Destroyer, "The 2nd" an
// SSSS collab ship) — matching their name would mostly catch the word's ordinary use
// ("the Vanguard fleet", "tells a fortune", "the 2nd time"), not real references to them.
const NAME_MATCH_STOPLIST = new Set(["Vanguard", "Fortune", "The 2nd"]);

const ALL_NATION_TERMS = [...new Set(ships.map(s => nationDisplayName(s.nationality)).filter(Boolean))];
const ALL_HULL_TERMS = [...new Set(ships.map(s => HULL_TYPE_TEXT[s.hullType] || s.hullType).filter(Boolean))]
  .flatMap(text => HULL_TEXT_TO_ABBR[text] ? [text, HULL_TEXT_TO_ABBR[text]] : [text]);

// "Dragon Empery Main Fleet ships" or "Sakura Empire CVs" restrict a buff to ships that
// are BOTH that nation AND that role/hull — not to every Main Fleet ship, or every CV.
// A role/hull match immediately preceded by a DIFFERENT nation, or a nation match
// immediately followed by a DIFFERENT hull, means the compound condition excludes this
// candidate ship, so it isn't a genuine match for it.
function otherNationImmediatelyBefore(text, matchIndex, ownNation) {
  const before = text.slice(Math.max(0, matchIndex - 30), matchIndex);
  if (ALL_NATION_TERMS.some(nation => nation !== ownNation && new RegExp(`\\b${escapeRegExp(nation)}\\s*$`, "i").test(before))) return true;
  return compoundNationListExcludes(text, matchIndex, ownNation);
}
// Same compound-restriction idea as above, but for the much more common phrasing where
// the nation and the role word aren't directly glued together — "Northern Parliament
// and Dragon Empery ships in the Vanguard Fleet" (Chang Chun), "Iron Blood ships in your
// Main Fleet" — a short run of connector words (a hull noun, "in"/"of", "the"/"your")
// sits between the nation list and the match. Captures the whole nation list ending
// right before the match, then only excludes candidates whose OWN nation isn't among
// the names actually listed — so a Dragon Empery (or Northern Parliament) candidate
// still matches Chang Chun correctly, while every other nation is excluded from it.
const NATION_LIST_CONNECTOR_RE = "(?:ships?|vessels?|forces|fleet members|CLs?|CVs?|CVLs?|CAs?|CBs?|BBs?|BCs?|BBVs?|DDs?|DDGs?|SSs?|SSVs?)";
// A nation name right before "ship(s) in your Vanguard" isn't always naming who the buff
// is FOR — "when this ship or a Sardegna Empire ship in your Vanguard falls below 30%
// max HP..." (Alfredo Oriani) names who can TRIGGER the effect, while the effect itself
// ("...for all your ships in it") is unrestricted. Only a nation list reached through a
// beneficiary preposition ("of"/"for"/"all") is an actual restriction; one reached
// through a condition/alternative word ("when"/"if"/"once"/"or a"/"another"/"per") is
// just naming a qualifying trigger, not narrowing the recipients.
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

// Where a skill's OWN name literally recurs inside its own description ("Ashen Might -
// Wichita II only: ..." inside the skill named "Ashen Might - Wichita") — that's the
// skill echoing its own title, never a reference to another ship, even when the name
// contains one (Wichita META's own skill mentions "Wichita", her un-retrofitted self).
// Returns character ranges to skip rather than deleting the text outright, since deleting
// it would also remove cue phrases other guards depend on (e.g. "All Out Assault").
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

  // A hull abbreviation glued directly onto a preceding word in parentheses, e.g.
  // "Kaga(BB)", disambiguates which FORM of a specific named ship is meant (Kaga has
  // both a Carrier and a hidden Battleship form) — not a reference to Battleships in
  // general.
  if (text[matchIndex - 1] === "(") return false;

  if (ENEMY_TARGET_CUE_RE.test(text.slice(Math.max(0, matchIndex - 100), matchIndex + 15))) return false;
  if (ALL_OUT_ASSAULT_CUE_RE.test(text.slice(Math.max(0, matchIndex - 60), matchIndex))) return false;
  if (ENEMY_IMMEDIATELY_BEFORE_RE.test(text.slice(Math.max(0, matchIndex - 20), matchIndex))) return false;
  if (AGAINST_CUE_RE.test(text.slice(Math.max(0, matchIndex - 15), matchIndex))) return false;
  if (equipmentConditionFollows(text, matchIndex, matchLen)) return false;
  // "Eagle" is itself a ship name, but also the first word of the "Eagle Union" nation —
  // without this, every "Eagle Union" mention would double as a false "named ship" match.
  if (category === "name" && ALL_NATION_TERMS.some(nation => nation.length > matchLen && new RegExp(`^${escapeRegExp(nation)}\\b`, "i").test(text.slice(matchIndex, matchIndex + 30)))) return false;

  const tightBefore = text.slice(Math.max(0, matchIndex - 20), matchIndex);
  if (NEGATIVE_CONDITION_CUE_RE.test(tightBefore)) return false;
  if (category === "hull") {
    if (FROM_SOURCE_CUE_RE.test(tightBefore)) return false;
    // "AP BB guns" names a weapon/ammo category (Battleship-caliber main guns), not a
    // ship in the fleet.
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

// Used when a "+" skill matched on its own and computeInteractions wants to anchor the
// entry on its base version instead (see the isPlusVariant branch below). Two different
// situations both reach here and need different answers:
// - The base text never mentions the category term at all (Chapayev's "Cavalier of the
//   Ether" is pure self-buff, no "Vanguard" anywhere) — safe to show as the default,
//   un-toggled text: it isn't claiming a match of its own, just showing what the skill
//   looks like without the "+"'s added clause.
// - The base text DOES mention the term, but only through a clause that fails its own
//   guards ("if there are 2 or more Tempesta ships afloat...this HP recovery effect will
//   also apply to your Vanguard ship with the lowest HP", Ganj-i-Sawai) — showing that as
//   the default, non-toggled text would silently reintroduce exactly the kind of
//   unreliable match structurallyGatedMatch (and friends) exist to keep out, just one
//   level removed through the base/+ pairing mechanism. Not safe to anchor on.
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
// A base skill is safe to anchor a standalone "+" match on if it either doesn't mention
// the category term at all, or mentions it AND genuinely qualifies on its own — never
// when its only mention is one that a guard has disqualified.
function isSafeBaseAnchor(skill, category, re, ship) {
  if (!baseTextMentionsCategory(skill, re)) return true;
  return hasGenuineMatch(skill, category, re, ship);
}

// Finds every OTHER ship whose skill text references this ship's nation, hull type,
// fleet role (Vanguard/Main), class, or name directly — the interaction surface a
// team-composition calculator would need to know about. Purely a text-pattern scan
// over each skill's plain-text description; it can't verify in-battle conditions
// (fleet composition counts, HP thresholds, etc.), so a match here means "this skill
// COULD affect this ship", not "always does".
function computeInteractions(ship) {
  const patterns = [];

  if (ship.nationality) {
    patterns.push({ category: "nation", label: ship.nationality, re: new RegExp(`\\b${escapeRegExp(nationDisplayName(ship.nationality))}\\b`, "gi") });
  }
  if (ship.hullType) {
    const text = HULL_TYPE_TEXT[ship.hullType] || ship.hullType;
    const abbr = HULL_TEXT_TO_ABBR[text];
    // "Battleship" and "Submarine" are themselves valid hull types but also plain
    // substrings of the separate "Aviation Battleship"/"Aviation Submarine" hull types —
    // without this guard, an "Aviation Battleship" mention would wrongly count as an
    // interaction for a plain Battleship.
    const avoidAviationPrefix = !text.startsWith("Aviation ") ? "(?<!Aviation )" : "";
    const alt = abbr ? `(?:${escapeRegExp(text)}|${escapeRegExp(abbr)})` : escapeRegExp(text);
    patterns.push({ category: "hull", label: ship.hullType, re: new RegExp(`${avoidAviationPrefix}\\b${alt}s?\\b`, "gi") });
  }
  if (ship.role === "Vanguard" || ship.role === "Main") {
    const text = ship.role === "Main" ? "Main Fleet" : "Vanguard";
    patterns.push({ category: "role", label: `${ship.role} Fleet`, re: new RegExp(`\\b${escapeRegExp(text)}\\b`, "gi") });
  }
  if (ship.class) {
    // ship.class already carries the "Class" suffix ("Izumo Class"), so the pattern is
    // just that stem followed by "class"/"-class"/" class" — not the stem AND the word
    // "class" twice, which is what a naive `${ship.class} class` would require.
    const stem = ship.class.replace(/\s*Class$/i, "");
    patterns.push({ category: "class", label: ship.class, re: new RegExp(`\\b${escapeRegExp(stem)}[- ]class`, "gi") });
  }
  // Skip very short / purely numeric display names (e.g. "22") — they'd match almost
  // any damage number or percentage in unrelated skill text. Also skip names that
  // collide with a reserved game term ("Vanguard" and "Fortune" are both real ship
  // names too) — virtually every match would be the generic term, not the character.
  if (ship.displayName && ship.displayName.length >= 3 && /[a-zA-Z]/.test(ship.displayName) && !NAME_MATCH_STOPLIST.has(ship.displayName)) {
    patterns.push({ category: "name", label: ship.displayName, re: new RegExp(`\\b${escapeRegExp(ship.displayName)}\\b`, "gi") });
  }

  const results = { nation: [], hull: [], role: [], class: [], name: [] };
  const totals = { nation: 0, hull: 0, role: 0, class: 0, name: 0 };
  if (!patterns.length) return { results, totals };

  for (const entry of ALL_SKILLS_INDEX) {
    if (entry.ship === ship) continue;
    const text = stripHtml(entry.skill.description);
    if (!text) continue;
    // A skill that repeats its own name inline ("Ashen Might - Wichita II only: ...")
    // isn't referencing another ship even if that name contains one — e.g. Wichita
    // META's own skill title contains "Wichita", her un-retrofitted self's name.
    const ownNameRanges = selfNameRanges(text, entry.skill.name);
    for (const p of patterns) {
      p.re.lastIndex = 0;
      let m, allyMatch = false;
      while ((m = p.re.exec(text))) {
        if (withinRanges(ownNameRanges, m.index)) continue;
        if (isGenuineAllyMatch(text, m, p.category, ship)) { allyMatch = true; break; }
      }
      if (!allyMatch) continue;

      // A skill's "+" enhanced version (Retrofit/Unique Augment/Fate Simulation — "+"
      // shows up under all three, not just Augment) usually just extends the base
      // text, so both independently match the same category and would otherwise show
      // as two near-duplicate rows for the same ship. Merge them into one entry with
      // the base version as the anchor and the "+" text attached for an in-place
      // toggle, rather than showing both (2B x Chang Chun's "Mutual Assistance" /
      // "Mutual Assistance+", a Retrofit pair, was the reported case).
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
        // The "+" text matched entirely on its own (its base version's own text has no
        // ally-facing language at all, so it never independently matched anything to
        // merge into — Chapayev's "Cavalier of the Ether" is pure self-buff; only the
        // "+"/Aug version's added clause mentions "a ship in your Vanguard"). Still look
        // up that base skill on the same ship and anchor the entry on IT instead of the
        // "+" skill, exactly like the merge case above — so this renders with the same
        // "base text by default, click the marker's own toggle to reveal the +/enhanced
        // text" behavior as every other paired entry, rather than silently showing the
        // "+" text with no way back to what the ship's skill looks like without it
        // (reported: "je ne peux pas cliquer pour voir la version de base").
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

// How many Interaction entries a category page shows at once — categories like "By
// Fleet Role" regularly run into the hundreds now that computeInteractions no longer
// hard-caps results at 100, so the list is paginated instead of dumping everything (or
// silently truncating it) into one long scroll.
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
    // The match only came from the "+" text itself (its base version never
    // independently matched, so there was nothing to merge into — e.g. Chapayev's
    // "Cavalier of the Ether" is purely self-only, only "Cavalier of the Ether+"
    // mentions "a ship in your Vanguard"). There's no un-augmented text to toggle
    // back to here, so this is a plain badge, not a button — but it still needs to
    // say Retrofit/Augment/Fate Simulation, since the shown text already includes
    // that upgrade's bonus and silently showing it as a bare, unmarked skill would
    // misrepresent it as a baseline effect every copy of the ship has.
    const variant = skillVariantInfo(skill.marker);
    const variantBadge = document.createElement("span");
    variantBadge.className = "interaction-variant-badge";
    variantBadge.style.setProperty("--tag-color", `var(${variant.colorVar})`);
    variantBadge.textContent = variant.label;
    variantBadge.title = `${skill.name} includes this ${variant.label.toLowerCase()}'s effect`;
    head.appendChild(variantBadge);
  }
  body.appendChild(head);

  const desc = document.createElement("p");
  desc.className = "interaction-desc";
  desc.textContent = text;
  highlightKeywords(desc, namedMechanics(text));
  body.appendChild(desc);

  if (enhancedText) {
    const enhancedDesc = document.createElement("p");
    enhancedDesc.className = "interaction-desc interaction-desc-enhanced";
    enhancedDesc.hidden = true;
    enhancedDesc.textContent = enhancedText;
    highlightKeywords(enhancedDesc, namedMechanics(enhancedText));
    body.appendChild(enhancedDesc);

    const variantToggle = head.querySelector(".interaction-variant-toggle");
    variantToggle.addEventListener("click", () => {
      const showingEnhanced = variantToggle.classList.toggle("active");
      desc.hidden = showingEnhanced;
      enhancedDesc.hidden = !showingEnhanced;
      skillName.textContent = showingEnhanced ? enhancedSkill.name : skill.name;
    });
  }

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
    }
    if (pager) {
      prevBtn.addEventListener("click", () => { page = Math.max(0, page - 1); renderPage(); });
      nextBtn.addEventListener("click", () => { page = Math.min(pageCount - 1, page + 1); renderPage(); });
    }
    renderPage();

    modalInteractionList.appendChild(details);
  }
}

function effectiveSkins(ship) {
  if (ship.skins && ship.skins.length) return ship.skins;
  // Custom hand-imported ships have no skin list — fall back to their single known image.
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
  renderModalStatsTable(ship, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
  renderModalSkills(ship, retrofitApplied, augmentApplied, fateSimApplied);
  renderModalBarrages(ship, retrofitApplied, augmentApplied, fateSimApplied);
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
  renderModalInteraction(ship);

  modalOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = "";
  currentShip = null;
}

grid.addEventListener("click", event => {
  const card = event.target.closest(".card");
  if (!card) return;
  const ship = shipsById.get(card.dataset.id);
  if (ship) openModal(ship);
});

// The level control is a set of "notch" buttons for the levels that actually matter
// (1 = base, 100 = normal max, 120/125 = the same retrofit/limit-break breakpoints the
// statsCurve data already uses for hand-imported ships) plus a free-entry number input,
// rather than a continuous slider that makes you hunt for an arbitrary level. Both
// controls stay in sync through one shared setLevel() so clicking a notch updates the
// field and vice versa.
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
}

modalLevelNotches.addEventListener("click", event => {
  const btn = event.target.closest(".level-notch");
  if (!btn) return;
  setLevel(Number(btn.dataset.level));
});

modalLevelInput.addEventListener("input", () => {
  // Ignore an empty/mid-edit field instead of snapping it to 1 — otherwise clearing the
  // field before typing a new number (a common way to replace "1" with "56") would force
  // it back to "1" on every keystroke.
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
    // Only jump the displayed art when the user is currently looking at the
    // Default/Retrofit pair — browsing an unrelated costume skin stays untouched.
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

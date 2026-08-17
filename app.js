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
// brand color) rather than a generic palette-slot pick — per explicit user direction
// ("base toi sur la couleur dans l'univers d'Azur Lane"). All 30 values individually
// checked for >=3:1 contrast against this app's dark surface (#0b1120); this can't also
// be CVD-safe pairwise at N=30 (color theory caps reliable categorical distinction at
// ~8 hues — see the `dataviz` skill), which was flagged to the user and deliberately
// overridden in favor of authenticity over separation.
//
// The 13 major/pirate nations below use the exact hex values the user supplied directly
// (their own "dominant color" reference table, presumably from official brand material) —
// EXCEPT Vichya Dominion, Iron Blood, and META, whose given hexes measured under 3:1
// contrast on this dark surface (2.16/2.47/2.68) and were lightened in HSL space (same
// hue and saturation, +L only) until they cleared ~4:1 — noted here since those three
// are NOT the literal values supplied, everything else is verbatim.
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

// ship.nationality stores "BLACK★ROCK SHOOTER (Nation)" — the "(Nation)" qualifier
// disambiguates the nation from other same-named entities in the source data, but never
// appears in actual skill prose and isn't meant to be shown to the user either (it was
// leaking into the filter panel and modal tags verbatim before this).
function nationDisplayName(nationality) {
  return nationality ? nationality.replace(/\s*\([^)]*\)$/, "") : nationality;
}

// Only two things get color-coded: nations and stats — per explicit user instruction to
// strip out every other category ("enlève tout ce qui n'est pas une nation et pas dans la
// liste de la table de couleur", e.g. DMG). Hull types, weapon terms, DMG/Damage, healing
// terms, fleet role (Vanguard/Main Fleet), and Siren were all removed from this system —
// note this also drops the earlier "don't touch Vanguard/Main's color" protection, since
// that color no longer exists here at all; if that's wrong, it needs to come back as an
// explicit ask, not be inferred.
//
// One color per stat, user-supplied hex table (2026-08-17) — verbatim, all 15 already
// cleared >=3:1 contrast on this app's dark surface (#0b1120) with no lightening needed
// (unlike 3 of the nation colors). Abbreviation and spelled-out form share a color
// (FP/Firepower alike); each row also picked up whichever OTHER real-text variant the
// corpus actually uses (Ammo for Ammunition, Max HP for Health, etc — checked by
// occurrence count, not guessed). "Anti Air" (no hyphen, as the user wrote it) never
// appears in the actual skill text (0 occurrences) — "Anti-Air" does (63) — so that's
// the form matched here; only the *display* form changed, not the color.
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

const KEYWORD_GROUPS = [
  // Nations are underlined (see highlightKeywords) as well as colored, since both
  // nations and stats carry many individual hues — the underline is what tells them
  // apart at a glance rather than relying on memorizing 45 colors.
  { className: "kw-nation", perTermColor: t => NATION_COLORS[t], underline: true, terms: [...new Set(ships.map(s => nationDisplayName(s.nationality)).filter(Boolean))] },
  { className: "kw-stat", perTermColor: t => STAT_COLORS[t], terms: Object.keys(STAT_COLORS) }
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
    KEYWORD_INFO.set(t.toLowerCase(), { color, canonical: t, underline: !!g.underline });
  }
}
// Longest term first so e.g. "Max HP" is matched whole rather than leaving a stray "HP".
// Each term also accepts an optional trailing "s" (Destroyer/Destroyers, etc.). The
// second top-level alternative (group 2) matches bare numbers/percentages ("15%",
// "3213") so skill values stand out from the surrounding prose — matched in the same
// pass as the keyword terms so numbers inside an already-colored span (e.g. inside "HP")
// can't be double-wrapped. The third alternative (group 3) matches the literal
// "[Operation Siren]" mode tag some skills use to mark roguelike-only behavior —
// bolded and colored on its own, distinct from the nation/stat palettes.
const OPERATION_SIREN_TAG_COLOR = "#E8A33D";
const KEYWORD_RE = new RegExp(
  "\\b(" + [...KEYWORD_INFO.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|") + ")s?\\b" +
  "|(\\d+(?:\\.\\d+)?%?)" +
  "|(\\[Operation Siren\\])",
  "gi"
);

function keywordInfoFor(matchText) {
  const lower = matchText.toLowerCase();
  if (KEYWORD_INFO.has(lower)) return { ...KEYWORD_INFO.get(lower), plural: false };
  if (lower.endsWith("s") && KEYWORD_INFO.has(lower.slice(0, -1))) return { ...KEYWORD_INFO.get(lower.slice(0, -1)), plural: true };
  return null;
}

// Walks every text node already inside `container` (so it works whether the content was
// set via textContent or as sanitized wiki HTML with existing <b> tags) and wraps each
// recurring keyword in a colored span, without disturbing surrounding markup.
function highlightKeywords(container) {
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
      if (m[2] !== undefined) {
        const span = document.createElement("span");
        span.className = "kw kw-num";
        span.textContent = m[2];
        frag.appendChild(span);
      } else if (m[3] !== undefined) {
        const span = document.createElement("span");
        span.className = "kw";
        span.style.color = OPERATION_SIREN_TAG_COLOR;
        span.style.fontWeight = "700";
        span.textContent = m[3];
        frag.appendChild(span);
      } else {
        const info = keywordInfoFor(m[0]);
        if (info) {
          const span = document.createElement("span");
          span.className = "kw";
          span.style.color = info.color;
          if (info.underline) span.style.textDecoration = "underline";
          span.textContent = info.canonical + (info.plural ? "s" : "");
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
  { key: "rarity", label: "Rarity", values: RARITY_ORDER.filter(r => uniqueValues("rarity").includes(r)) }
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

    for (const value of group.values) {
      wrap.appendChild(makeChip(group.key, value));
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

// Fixed display order. "armor" is a text grade (Light/Medium/Heavy), not a level-scaled
// number, so it's read straight from ship.armorType instead of the computed stat block.
// "oxygen" and "ammunition" have no numeric source anywhere in the data we have — they
// always render as "—" rather than being dropped, same as any other stat missing on a
// particular ship (e.g. oil consumption for the non-custom-imported ships).
const STAT_DEFS = [
  { key: "luck", label: "Luck", icon: "assets/stat-icons/luck.png" },
  { key: "armor", label: "Armor", icon: "assets/stat-icons/armor.png", text: true },
  { key: "speed", label: "Speed", icon: "assets/stat-icons/speed.png" },
  { key: "health", label: "Health", icon: "assets/stat-icons/health.png" },
  { key: "firepower", label: "Firepower", icon: "assets/stat-icons/firepower.png" },
  { key: "antiair", label: "Anti-air", icon: "assets/stat-icons/antiair.png" },
  { key: "torpedo", label: "Torpedo", icon: "assets/stat-icons/torpedo.png" },
  { key: "evasion", label: "Evasion", icon: "assets/stat-icons/evasion.png" },
  { key: "aviation", label: "Aviation", icon: "assets/stat-icons/aviation.png" },
  { key: "oilConsumption", label: "Oil consumption", icon: "assets/stat-icons/oilConsumption.png" },
  { key: "reload", label: "Reload", icon: "assets/stat-icons/reload.png" },
  { key: "asw", label: "Anti-Submarine", icon: "assets/stat-icons/asw.png" },
  { key: "oxygen", label: "Oxygen", icon: "assets/stat-icons/oxygen.png" },
  { key: "ammunition", label: "Ammunition", icon: "assets/stat-icons/ammunition.png" },
  { key: "accuracy", label: "Accuracy", icon: "assets/stat-icons/accuracy.png" }
];

const NUMERIC_STAT_KEYS = STAT_DEFS.filter(d => !d.text).map(d => d.key);

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
const modalTags = document.getElementById("modal-tags");
const modalRetrofitControl = document.getElementById("modal-retrofit-control");
const modalRetrofitCheckbox = document.getElementById("modal-retrofit-checkbox");
const modalAugmentControl = document.getElementById("modal-augment-control");
const modalAugmentCheckbox = document.getElementById("modal-augment-checkbox");
const modalFateSimControl = document.getElementById("modal-fatesim-control");
const modalFateSimCheckbox = document.getElementById("modal-fatesim-checkbox");
const modalLevelControl = document.getElementById("modal-level-control");
const modalLevelSlider = document.getElementById("modal-level-slider");
const modalLevelValue = document.getElementById("modal-level-value");
const modalStatsSection = document.getElementById("modal-stats-section");
const modalStatsGrid = document.getElementById("modal-stats");
const modalEffectiveStatsSection = document.getElementById("modal-effective-stats-section");
const modalEffectiveStatsGrid = document.getElementById("modal-effective-stats");
const modalCombatModifiers = document.getElementById("modal-combat-modifiers");
const modalSkillsSection = document.getElementById("modal-skills-section");
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

function renderModalStats(ship, level, isRetrofit) {
  const computed = computeStats(ship, level, isRetrofit);
  if (!computed) {
    modalStatsSection.hidden = true;
    modalLevelControl.hidden = true;
    return;
  }
  modalLevelControl.hidden = false;
  modalStatsSection.hidden = false;
  modalStatsGrid.innerHTML = "";

  for (const def of STAT_DEFS) {
    const raw = def.text ? ship.armorType : computed[def.key];

    const chip = document.createElement("div");
    chip.className = "stat-chip";
    chip.title = def.label;

    const icon = document.createElement("img");
    icon.className = "stat-icon";
    icon.src = def.icon;
    icon.alt = def.label;
    chip.appendChild(icon);

    const val = document.createElement("span");
    val.className = "stat-value";
    val.textContent = (raw === undefined || raw === null || raw === "") ? "—" : raw;
    chip.appendChild(val);

    modalStatsGrid.appendChild(chip);
  }
}

const COMBAT_MODIFIER_LABELS = {
  critRate: "Crit Rate",
  critDamage: "Crit DMG",
  damageDealt: "DMG Dealt",
  weaponEfficiency: "Weapon Efficiency",
  hitRate: "Hit Rate",
  evasionRate: "Evasion Rate"
};

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
  const modifierSum = {};
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
          modifierSum[key] = (modifierSum[key] || 0) + amount;
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

  return { stats, modifiers: modifierSum };
}

// Mirrors renderModalStats's full STAT_DEFS loop (every stat, including the text-only
// Armor grade and the never-populated Oxygen/Ammunition slots) rather than only the
// stats a skill happens to touch — this is meant to stand in for the Stats block above,
// not as a shorter "bonuses only" addendum to it.
function renderModalEffectiveStats(ship, level, isRetrofit, isAugmented, isFateSim) {
  const base = computeStats(ship, level, isRetrofit);
  const effective = computeEffectiveStats(ship, level, isRetrofit, isAugmented, isFateSim);

  if (!base || !effective) {
    modalEffectiveStatsSection.hidden = true;
    return;
  }
  modalEffectiveStatsSection.hidden = false;
  modalEffectiveStatsGrid.innerHTML = "";
  modalCombatModifiers.innerHTML = "";

  for (const def of STAT_DEFS) {
    const entry = def.text ? null : effective.stats[def.key];
    const raw = def.text ? ship.armorType : (entry ? entry.value : base[def.key]);
    const delta = entry ? entry.delta : 0;

    const chip = document.createElement("div");
    chip.className = "stat-chip" + (delta ? " stat-chip-boosted" : "");
    chip.title = def.label;

    const icon = document.createElement("img");
    icon.className = "stat-icon";
    icon.src = def.icon;
    icon.alt = def.label;
    chip.appendChild(icon);

    const val = document.createElement("span");
    val.className = "stat-value";
    val.textContent = (raw === undefined || raw === null || raw === "") ? "—" : raw;
    chip.appendChild(val);

    if (delta) {
      const deltaEl = document.createElement("span");
      deltaEl.className = "stat-delta";
      deltaEl.textContent = delta > 0 ? `+${delta}` : String(delta);
      chip.appendChild(deltaEl);
    }

    modalEffectiveStatsGrid.appendChild(chip);
  }

  for (const [key, amount] of Object.entries(effective.modifiers)) {
    const pill = document.createElement("span");
    pill.className = "combat-modifier-pill";
    pill.textContent = `${COMBAT_MODIFIER_LABELS[key] || key} +${amount}%`;
    modalCombatModifiers.appendChild(pill);
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

function renderModalSkills(ship, isRetrofit, isAugmented, isFateSim) {
  const skills = getSkillsForState(ship, isRetrofit, isAugmented, isFateSim);
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
      // Description is sanitized at build time to only ever contain plain text and <b> tags,
      // used here to keep the wiki's own "important point" highlighting.
      desc.innerHTML = skill.description;
      highlightKeywords(desc);
      body.appendChild(desc);
    }

    item.appendChild(body);
    modalSkillsList.appendChild(item);
  }
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
  highlightKeywords(desc);
  body.appendChild(desc);

  if (enhancedText) {
    const enhancedDesc = document.createElement("p");
    enhancedDesc.className = "interaction-desc interaction-desc-enhanced";
    enhancedDesc.hidden = true;
    enhancedDesc.textContent = enhancedText;
    highlightKeywords(enhancedDesc);
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
  renderModalStats(ship, currentLevel, retrofitApplied);
  renderModalEffectiveStats(ship, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
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
  modalLevelSlider.value = "1";
  modalLevelValue.textContent = "1";
  modalRetrofitCheckbox.checked = false;
  modalRetrofitControl.hidden = !ship.hasRetrofit;
  modalAugmentCheckbox.checked = false;
  modalAugmentControl.hidden = !(ship.skills || []).some(s => s.marker === "Aug");
  modalFateSimCheckbox.checked = false;
  modalFateSimControl.hidden = !(ship.skills || []).some(s => s.marker === "FS");

  modalName.textContent = ship.displayName;
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

modalLevelSlider.addEventListener("input", () => {
  currentLevel = Number(modalLevelSlider.value);
  modalLevelValue.textContent = String(currentLevel);
  if (!currentShip) return;
  renderModalStats(currentShip, currentLevel, retrofitApplied);
  renderModalEffectiveStats(currentShip, currentLevel, retrofitApplied, augmentApplied, fateSimApplied);
});

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

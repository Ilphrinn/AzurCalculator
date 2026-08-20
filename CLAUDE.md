# AzurCalc — project handoff / continuity notes

Written by Claude to resume work after a PC change. Read this before doing anything else
in this project. It captures state that isn't obvious from the code alone.

## What this is

A local static web app (plain HTML/CSS/vanilla JS, **no build tools**) cataloging every
Azur Lane character. Opened directly via `file://index.html` — no server. This is why
data lives in `data/ships.js` (`SHIPS_DATA` global var, not `fetch`ed JSON): `file://`
pages can't `fetch()` local files due to CORS, so the dataset is inlined as a `<script>`.
`data/ships.json` is the same data in real JSON, kept for tooling/scripts to read with
`require()`; **the two must be regenerated together** — `ships.js` is just
`const SHIPS_DATA = <ships.json content>;`. If you edit ship data, edit `ships.json` and
regenerate `ships.js` from it (or edit both identically). `data/equipment.js` /
`data/equipment.json` are the same arrangement for the gear catalog (`EQUIPMENT_DATA`).

**Both `.js` files are pretty-printed** (2026-08-20, on request: they had been generated
as one enormous single line each — 3.8 MB and 233 KB — which is unreadable when opened in
an editor). They now use `JSON.stringify(data, null, 2)`, the same indent their `.json`
twins already used, so each `.js` is line-for-line identical to its `.json` apart from the
`const X = ` prefix and the trailing `;` — ships.js and ships.json are both 221 278 lines,
equipment.js and equipment.json both 13 676. Regenerate the same way; do NOT re-minify
them, the size difference (ships.js 3.8 MB → 6.1 MB) costs nothing here since the page is
opened from disk, and the diffability is worth far more when ship data changes.

Files: `index.html` (structure), `app.js` (all logic, one file, ~2700 lines), `style.css`.

## Data provenance (important — don't try to re-scrape)

- Primary source: `Site web/` — the user manually saved wiki pages from
  azurlane.koumakan.jp (one folder per ship under `Site web/ships/{Name}/` +
  `{Name}_files/`), because **the live wiki is fully blocked to automated access** via an
  Anubis proof-of-work challenge — confirmed blocking HTML, API, and raw images alike.
  Never attempt to fetch it programmatically; ask the user to save more pages if new data
  is needed.
- Numeric stats/skills/equipment for ~861 "real" ships come from the
  `raw.githubusercontent.com/Fernando2603/AzurLane` datamine (not blocked). ~27
  hand-imported ships (ids prefixed `wiki-*`, plus Surrey) instead carry a 4-point
  `statsCurve` (levels 1/100/120/125) read straight off their wiki stat table, and have
  `stats: null` / `equipment: null`.
- Three wiki pages — `Site web/Combat - Azur Lane Wiki.htm`, `Damage Calculations -
  Azur Lane Wiki.htm`, `Anti-Submarine Warfare - Azur Lane Wiki.htm` — contain the
  game's actual formulas (damage, crit, hit rate, effective stats, ASW/sonar, etc.).
  `computeEffectiveStats` in app.js implements the wiki's own `CurrentScalingStat`
  formula from the Damage Calculations page. If you need another formula (e.g. eventual
  damage-per-second output), these pages are the source of truth — read them, don't
  guess.

## Ship data shape (`data/ships.json`, flat array, 888 ships)

Key fields: `id, displayName, class, nationality, hullType, hullShort, role, rarity,
stats, statsCurve, retrofitBonus, skills, barrages, armorType, painting, skins,
hasRetrofit, equipment, augmentModules`.

- `stats: {base, growth, enhance}` — level-scaled via `computeStats()` in app.js:
  `base + growth*max(level-1,1)/1000 + enhance + retrofitBonus`. `statsCurve` ships use
  linear interpolation instead (`interpolateStatsCurve`).
- `skill.marker`: `"R"` (Retrofit), `"Aug"` (Unique Augment), `"FS"` (Fate Simulation,
  Research-ship-only). A marked skill always sits **immediately after** the base skill it
  replaces in the array — that adjacency (not name matching) is how they're paired, since
  replacement skill names don't follow a consistent convention.
- `skill.statBonuses[]`: `{stats: [canonicalKey...], min, max, isPercent, scope: "self"|
  "fleet", raw}`. **This was auto-extracted from skill text by a one-off script earlier in
  the project and is NOT fully reliable** — `scope` in particular is sometimes wrong in
  both directions (see "Known data quality issues" below). Don't trust `scope` blindly;
  `computeEffectiveStats` in app.js has the corrective logic, copy its approach rather than
  re-trusting the raw field elsewhere.
- `ship.barrages[]`: `{skillName, trigger, statScaling, ammoType, baseDmg, count,
  lightDmg, mediumDmg, heavyDmg, notes, effect, gifs: [{id, label, path}]}`. Matched to a
  skill via longest-normalized-prefix matching (see `matchSkillForBarrage` in app.js).

## Features built so far (this session and earlier)

1. **Core catalog**: grid, search (by name + by class), filters, sort, modal detail view
   with Retrofit / Unique Augment / Fate Simulation toggles and a level control.

   **Level control is notches + a free-entry field, not a slider** (2026-08-18, feedback
   relayed from the user's friend: "les gens se fichent de voir un niveau 56" — a smooth
   1-125 slider makes you hunt for an arbitrary number nobody cares about, when what
   actually matters is which milestone a ship is at). `#modal-level-notches` has one
   button per meaningful breakpoint — originally just 1 / 100 / 120 / 125 (the four points
   `statsCurve` uses for hand-imported ships: base, normal max, +retrofit, +limit-break),
   the user then asked for 1 / 10 / 30 / 70 / 100 / 120 / 125 instead, adding four early
   leveling checkpoints. Purely a static HTML change (`index.html`'s `.level-notch`
   buttons) — the JS reads whichever notches exist in the DOM via `data-level`
   attributes rather than a hardcoded array, so the notch count isn't assumed anywhere
   in app.js and can be adjusted again the same way — plus `#modal-level-input`, a plain
   number field for typing an exact level. Both drive the same `setLevel(newLevel)`
   (clamps to 1-125, updates `currentLevel`, re-renders the stats table) via
   `updateLevelControlUI()`, which syncs the field's value and which notch (if any) shows
   `.active`; typing a level that isn't one of the notch values just leaves none
   highlighted. The field's `input` handler
   deliberately ignores an empty value rather than snapping it to 1 — otherwise clearing
   the field before typing a replacement (the natural way to change "1" to "56") would
   force it back to 1 on every keystroke; a `change` handler on blur reverts an
   still-empty field to the last valid level instead of leaving it blank.

   **Level input's spinner arrows restyled to match the scrollbar** (2026-08-19,
   directly after the scrollbar redesign above — "reprends le même style graphique au
   niveau des flèches"): the number input's native up/down spinner (browser-default
   grey chevrons) is hidden (`::-webkit-inner/outer-spin-button { -webkit-appearance:
   none }`) and replaced with two real `<button>`s (`#modal-level-spin-up/down`,
   `.level-spin-buttons` wrapper, `index.html`) absolutely positioned over the input's
   right edge — reusing the EXACT SAME inline-SVG triangle data URIs as the
   `::-webkit-scrollbar-button` arrows added for the scrollbar (identical path/fill,
   just a smaller `background-size`), so the two arrow styles actually share their
   source rather than looking similar by coincidence. Same "no hover state" convention
   as the scrollbar buttons — no `:hover` rule written for `.level-spin` either.
   Wired in `app.js` (`modalLevelSpinUp`/`modalLevelSpinDown` click listeners, right
   after the existing level-input listeners) to call the SAME `setLevel(currentLevel ±
   1)` function the notches and text field already use — clamping/re-render behavior
   is identical, no new logic duplicated. Verified via headless test: clicking up/down
   moves `currentLevel` by 1 and updates the input's displayed value each time, and
   clamps correctly at the 1/125 bounds (10 rapid down-clicks from level 3 lands
   exactly on 1, not negative). Full 888-ship regression still 0 errors.
2. **Barrages**: per-ship table below Skills, with animated-gif previews. Gifs are stored
   locally (`assets/barrage-gifs/{id}.gif`, sourced from user-saved wiki "File:" pages).
   Row icon is a generic play-icon placeholder (`assets/gif-icon.png`) — hovering shows
   the real animated gif enlarged over the character portrait. Gif icons wrap
   (`flex-wrap`) inside their column rather than overflowing when a skill has multiple
   variant gifs (e.g. Azuma has 3 for one row — the worst case in the dataset).
3. **Stats display** (`computeEffectiveStats` / `renderModalStatsTable`), replacing the
   old stacked "Stats" + "Effective Stats" rows of pills. Went through four iterations in
   one 2026-08-18 feedback thread before landing:
   1. First pass: one merged Base/Real table, every stat in one flat list.
   2. User asked for "tableau 1 séparation tableau 2, en reprenant l'ordre du jeu" with a
      screenshot of the real in-game stat panel — split into two Base/Real tables
      (primary reordered to match the game's own grouping, secondary for the rest) with a
      visual gap between them.
   3. User said this still didn't match, asked for pointers on how to give better
      feedback, then supplied a full-panel screenshot: **the game shows one compact
      3-column grid with ONE value per stat** (delta inline, e.g. "478 +178" in a single
      cell) — never a separate base figure anywhere in that view. The Base/Real-columns
      idea was scrapped for the primary block entirely; showing Base at all in a
      "like the game" table was the actual mismatch, not the grouping/order (guessed
      right) or the two-table split (also guessed right, kept for the moment).
   4. User approved the grid, then asked to fold the secondary block into it too
      ("intègre aussi le reste") and drop Ammunition ("je pense n'est pas utile ?") —
      confirmed correct rather than assumed: it has no numeric source anywhere in the
      data, every ship would've shown "—" for it forever. The two-table split from
      step 2 is gone; everything is one grid now. Oxygen has the *exact* same
      always-empty issue as Ammunition but wasn't named, so it was flagged back
      ("Oxygen a le même souci — tu veux que je l'enlève aussi ?") instead of silently
      dropped alongside it or silently kept — don't extend a stated exception to a
      look-alike case without asking, even when the reasoning obviously transfers.
   5. User said yes to Oxygen, and separately named Oil Consumption too ("enlève oxygen
      et oil consumption, ils ne sont pas utilisés non plus") — checked against the data
      before touching anything (same as every other "is this stat actually empty" claim
      in this thread) rather than trusting the assumption outright: both sit at 0/888
      ships with any numeric value, confirmed correct. Both removed from `STAT_GRID`.

   Final shape: `STAT_GRID` (`buildStatsGrid`) is one 14-slot array, rendered via CSS
   Grid (`grid-template-columns: repeat(3, 1fr)`) directly into `#modal-stats-table`
   (no wrapper div — `buildStatsGrid(container, defs, ship, effective)` populates the
   container it's given rather than building/returning its own). The first 12 slots
   reproduce the game's own compact panel exactly — reading order HP/Armor/RLD,
   FP/TRP/EVA, AA/AVI/·, ASW/·/LCK — followed by Speed and Accuracy folded in from the
   old secondary table, which the game's panel doesn't actually show at all but now
   render through the identical single-cell style for visual consistency rather than a
   separately-formatted block (Oil Consumption, Oxygen, and Ammunition — the rest of that
   old secondary table — are gone entirely, all three confirmed to have zero numeric data
   across the whole dataset). Every filled cell has its own icon + abbreviated label
   (HP/RLD/FP/TRP/EVA/AA/AVI/ASW/LCK/SPD/ACC, matching the game's compact wording where a
   game equivalent exists — full name still in the `title` tooltip) and a single value
   that gets an inline `+N`/`-N` delta (accent-colored) when a skill boosts it. Two slots
   among the first 12 are `null` and render as empty cells rather than collapsing the
   grid: "Cost" (not tracked anywhere in this app's data, and there's no icon for it
   either) and the slot that shows Oxygen in-game but only for submarines — moot now that
   Oxygen isn't tracked at all, so every ship just gets a blank cell there.
   `NUMERIC_STAT_KEYS` is derived straight from `STAT_GRID` (`.filter(d => d && !d.text)`)
   instead of a separate combined array. Real values follow the wiki's own
   `CurrentScalingStat` formula, summing active self-scope skill bonuses; non-stat bonuses
   (Crit Rate, DMG Dealt, etc.) still render as separate pills below the grid. Section
   caption: "after active skills, conditions assumed met" (no "Base vs. Real" language
   anywhere anymore — nothing in this section shows Base).

   If asked to remove another stat from the grid, verify it's actually empty
   dataset-wide first (`node -e` a quick count over `data/ships.json`, same as every
   removal in this thread) rather than trusting the claim — two of five removal requests
   here were self-corrections/confirmations the user explicitly asked for, but the
   pattern only works because each one got checked, not assumed.

   6. **A boosted cell now shows all three numbers, not just the final one**
      (2026-08-18, next message): user asked "355 c'est sa stat de base?" about A2's
      Firepower at level 125 — the grid was showing only the post-skill Real value with a
      delta ("355 +69"), and with no Base figure displayed anywhere in this section
      anymore (removed in step 3), there was no way to tell 355 wasn't itself the base.
      Answered with the actual numbers computed from the app's own functions rather than
      a hand-derived guess (`computeStats`/`computeEffectiveStats` called directly in a
      headless test): base 286, +24% from summed active skill bonuses (Devastating
      Cleave's 20% FP + Vengeance's two separate +2% FP entries), `Math.round(286×1.24)
      = 355`. User's follow-up: show all three — `buildStatsGrid` now renders a boosted
      cell as `{base}{+delta} ({real})`, e.g. "286+69 (355)" — base in normal text
      color, delta in `--accent` via the existing `.stat-delta` class, real value in
      `--text-muted` parens via a new `.stat-grid-real` class. An unboosted cell (no
      skill bonus, base === real) still renders as a single plain number — the compound
      format only appears where there's an actual delta to explain. `buildStatsGrid`'s
      signature gained a `base` parameter (`renderModalStatsTable` already had it
      computed for the initial null-check, just wasn't passing it through). The old
      `.stats-cell-boosted` class (which colored the entire cell value accent when
      boosted) is gone — no longer needed now that the delta and real spans carry their
      own colors independently of the base number.
   7. **Tightened up for density** (2026-08-18, next message: "compacter un peu plus le
      tableau... sur l'icone + valeur") — `.stat-icon` 16px → 14px (safe to touch
      globally now that this is the only remaining user of the class, since the old
      Base/Real table's icons shared it before being removed in step 4),
      `.stat-grid-cell` padding and gap both reduced, and `justify-content: space-between`
      dropped from the cell so the value sits right next to its icon+label instead of
      pinned to the cell's far edge — that stretch was the main readability complaint,
      not the font sizes (trimmed slightly too, but secondary).
   8. **Values still didn't line up column-to-column** — dropping `space-between` in
      step 7 fixed the far-edge gap but introduced a new ragged-left effect instead (user
      illustrated it literally, staggering the words of their own sentence): with the
      value packed right after a content-sized label, "Armor" pushes its value further
      right than "AA" or "HP" do on other rows of the same column, so the numbers no
      longer form a straight line. Fixed with `.stat-grid-icon-label { width: 3.4rem; }`
      — a fixed width instead of content-sized, so every label reserves the same
      horizontal space regardless of text length ("Armor" vs "AA") and the value that
      follows starts at the same x-position in every row of a column.
   9. **"Divise la taille du tableau par 2"** — first attempt (`grid-template-columns:
      repeat(3, 1fr)` + `max-width: 50%` on `.stats-grid`) broke the layout: `1fr` tracks
      still respect each column's content-based minimum width by default (`min-width:
      auto`), and a boosted cell's "135+3 (138)"-style text doesn't shrink — capping the
      *container* to 50% while the columns still individually demanded their full
      content width meant the 3rd column (and part of the 2nd) got pushed past the edge
      and clipped by `overflow: hidden`, silently losing RLD/EVA/LCK entirely. Fixed
      properly with `grid-template-columns: repeat(3, auto)` + `width: fit-content` on
      `.stats-grid` instead of a percentage: each column now sizes to its own widest
      cell's actual content rather than all three being forced equal, and the container
      shrink-wraps to the sum of the three instead of stretching to fill the modal's
      full width — which is what "too wide" actually meant (excess empty space in every
      cell, not that the content itself needed to compress). Landed at roughly half the
      previous width without cutting anything off, confirmed by re-running the
      888-ship/0-error smoke test after.
   10. **"ça fait 1/3 avec 50%, ce qui est étrange"** — `width: fit-content` sizes the
       grid to an absolute pixel amount driven by its content, not a percentage of the
       panel, so its apparent proportion of the modal necessarily shifts with window
       width (a wider window doesn't widen the grid, so the same fixed-size table reads
       as a smaller fraction of a bigger panel). Explained this mechanism and asked
       whether the user wanted a true responsive 50% (would need to allow value text to
       wrap instead of clipping, since that's what broke step 9's first attempt) or to
       keep the fixed/content-based approach — they chose to keep fixed-size but make it
       a bit more generous: `.stat-grid-cell` padding `0.3rem 0.45rem` → `0.4rem 0.75rem`,
       gap `0.3rem` → `0.4rem`, and `.stat-grid-icon-label` width `3.4rem` → `3.8rem`.
       Still `fit-content`/`auto`-columns underneath — same caveat as step 9 applies if
       this comes up again: it's an absolute size, its on-screen proportion will keep
       moving with window width, and that's expected, not a bug.
   11. **"le tableau de A2 est plus grand que les autres"** — with `.stat-grid-value`
       still sized to its own text content (no explicit width), a ship whose boosted
       format happens to be long (A2's "286+69 (355)") makes that column, and so the
       whole `auto`-sized grid, wider than a ship whose values stay short and unboosted
       (Admiral Hipper's plain "895"). Root cause is the same `fit-content`/`auto` design
       from step 9 — great for "don't clip, don't stretch," but it means *every* ship's
       grid is a slightly different size depending on its own stat lengths, which reads
       as inconsistent across the app. Fixed by giving `.stat-grid-value` a fixed
       `width: 7.2rem`, measured (`getBoundingClientRect()` in a headless probe against
       the real `.stat-grid-value` font/weight, not guessed) to fit the longest content
       the user specified as the target: `"1234+1234 (1234)"` — a 4-digit base, 4-digit
       delta, and 4-digit real value all at once. Confirmed dataset-wide that no ship's
       actual computed HP (the largest stat) exceeds 4 digits at level 125 (max: 9795,
       Mecklenburg) — a rare stacked self-HP%-buff could theoretically push a boosted
       value over 4 digits, but no observed case does; if one ever does, it will overflow
       its fixed cell rather than wrap, which is an acceptable trade for "every ship's
       table is now identically sized" per what was asked. With both label (3.8rem) and
       value (7.2rem) now fixed, every column across every ship computes to the exact
       same `auto` width, so the whole grid is data-independent — confirmed visually
       identical between A2 and Admiral Hipper side by side at a realistic desktop
       window size (1200-1400px; a too-narrow test window, e.g. 1000px total with the
       image column eating half of it, can still make the now-wider fixed grid overflow
       and scroll — not a regression in the fixed-vs-narrow-window sense, just means this
       layout assumes a normal desktop window, which matches how this app is used).
   12. **"Passe à 5 chiffres"** — bumped the sizing target from `"1234+1234 (1234)"` to
       `"12345+12345 (12345)"`. Re-measured the same way (headless probe against the
       live `.stat-grid-value` class, this time waiting on `document.fonts.ready` first —
       the original 4-digit measurement had been taken before web fonts settled and read
       6.73rem one run vs. 6.11rem once fonts were confirmed loaded, a reminder that this
       kind of measurement needs the font ready-check to be trustworthy across runs).
       5-digit string measured 7.40rem; `.stat-grid-value`'s `width` is now `7.6rem`
       (small safety margin, same convention as before). No other dimension needed to
       change — the label width (3.8rem) and cell padding are independent of how many
       digits the value itself needs.
   13. **Luck moved, Cost reinstated with real data** — "Mets Luck sur la ligne du
       dessous" moved LCK out of the primary 12-slot grid (row 4, col 3) down into the
       trailing row, now `SPD / ACC / LCK`; the slot it vacated is a second blank cell
       (row 4 is just `ASW / · / ·` now). Separately, the user supplied
       `Site web/Oil Cost - Azur Lane Wiki.htm` and asked for Cost back in its real
       in-game position — "à droite de AVI et en dessous de EVA", i.e. row 3 col 3,
       exactly the slot already reserved as a `null` placeholder since step-4-of-the-
       earlier-thread (`STAT_GRID`'s row-3 blank always WAS "where Cost goes, once we
       have data for it" — this fills that same slot rather than moving anything).

       Cost isn't level-scaled from a base/growth curve like every other stat here — the
       wiki's own formula is `OilCost = ⌊MaxCost·(100+min(Level,99))/200⌋ + 1` (surface)
       or `⌊(MaxCost+1)·(100+min(Level,99))/200⌋` (submarine, no trailing +1), where
       `MaxCost` = hull-type cost + rarity cost (+1 more if Decisive/DR **and** Main
       Fleet — the wiki lists "DR Vanguard" +6 and "DR Main" +7 as the complete values,
       not a stacked "+6 then +1", so the code's separate `decisiveMainBonus` add still
       lands on the right total) + a META +1 + the limit-break bonus + a small per-class
       modifier (`EXTRA_COST_MODIFIER_BY_NAME`, keyed by display name straight from the
       wiki's "Ships from class" column rather than `ship.class` text, since two entries —
       Minato Aqua, Homura — have no shared class at all). Implemented in
       `computeOilCost()`, right before `computeStats`.

       **The naive MathML reading was wrong and caught before shipping**: parsing
       `⌊MaxCost·100+min(Level,99)/200⌋+1` at face value as
       `floor((MaxCost*100 + min(Level,99))/200)+1` looked plausible but didn't reproduce
       the wiki's own worked example (the "At Limit Break level caps" table, MaxCost=7
       row: LB0/Lv.70→1, LB1/Lv.80→3, LB2/Lv.90→5, MLB/Lv.100→7). Went back to the raw
       MathML (`<mfrac>` numerator is `100+min(Level,99)`, and the whole fraction is what
       `MaxCost` multiplies) to get the actual grouping —
       `floor(MaxCost*(100+min(Level,99))/200)+1` — then re-verified against all 5
       columns of that table row before trusting it (all matched exactly). This is the
       same "measure/verify against ground truth, don't eyeball a formula" instinct as
       the font-width probes in steps 9-12, just applied to a game-mechanics formula
       instead of CSS. **If any other stat is ever backed by a formula instead of raw
       data, verify it against a worked example the same way before shipping — a formula
       that "looks right" from the source markup is not the same as one that's been
       checked against a known output.**

       **No limit-break tracking exists anywhere in this app** (no UI concept of
       duplicate-based star investment, and the level control doesn't imply one either —
       a ship can sit at any level below its cap independent of its actual LB state).
       Rather than guess a specific mid-progression state, the limit-break bonus is
       always the MAX one (+6 surface / +3 submarine) for every ship — the same fixed
       assumption the wiki itself already mandates for PR/DR/UR/META ships regardless of
       investment, extended here to all rarities for one stable, comparable number,
       consistent with Effective Stats already assuming max skill level rather than
       modeling a specific state. **Validated against real ground truth, not just
       internal consistency**: the user's own reference screenshot from earlier in this
       session (New Jersey, level 125, in-game Cost: 17) — `computeOilCost` on this
       app's New Jersey ship object at level 125 returns exactly **17**. Cost's icon
       reuses `assets/stat-icons/oilConsumption.png` (no dedicated Cost icon exists in
       any saved wiki page) — swap it if a real one gets saved later.
   14. **Combat-modifier pills (Crit Rate, Crit DMG, Hit Rate, DMG Dealt, etc.) moved
       beside the grid, not below it** — the user pointed at A2's "Crit Rate +20%" pill
       specifically and asked for it, and everything like it, to sit to the right of the
       stats grid instead of wrapping underneath. `#modal-stats-table` and
       `#modal-combat-modifiers` are now wrapped in a `.stats-and-modifiers` flex row
       (`index.html`) instead of being two stacked block children of
       `#modal-stats-section`; `.modal-combat-modifiers` switched from a horizontal
       wrapping row (`flex-direction: row` + `flex-wrap: wrap`, pills side by side
       underneath the grid) to a vertical stack (`flex-direction: column`,
       `align-items: flex-start`) so multiple pills read top-to-bottom in that side
       column instead of sprawling sideways. `.stats-and-modifiers` itself still carries
       `flex-wrap: wrap`, so on a narrow window the pill column drops below the grid
       rather than forcing horizontal overflow. No JS changes — `renderModalStatsTable`
       already targeted the same `modalStatsTable`/`modalCombatModifiers` element refs,
       just relocated in the DOM tree.
   15. **Modal close ("X") button nudged left** — it was overlapping the modal's own
       scrollbar (`.modal-close { right: 0.6rem }` sat close enough to the edge that the
       scrollbar thumb rendered on top of/beside it). Changed to `right: 1.5rem`; `top`
       unchanged. Verified visually via headless screenshot, not just by reading the CSS
       — scrollbar and X are now clearly separated with New Jersey's modal open.
   16. **Scrollbar redesigned, close button retightened** (2026-08-19) — item 15 solved
       the overlap by guessing at clearance against the *native* (unstyled) browser
       scrollbar, whose width/behavior isn't fully predictable (Windows can vary it, and
       Chromium's default thumb has its own built-in hover-darken state) — the user
       asked to replace it with a custom one instead: "légèrement plus large, enlever
       l'effet sur le passage de souris, et mettre deux flèches en haut et en bas...
       cela permettra de resserrer légèrement la croix." New global rule block (right
       after the `body` rule in `style.css`, applies everywhere — the only scrollable
       region in the app is `.modal-info`, but this is written generically rather than
       scoped to it) using the `::-webkit-scrollbar*` pseudo-elements (this app is only
       ever tested in Chromium/Edge per this project's own headless-testing convention,
       so WebKit-prefixed scrollbar styling — not the standards-track `scrollbar-width`/
       `scrollbar-color`, which can't do custom arrow buttons at all — is the right tool
       here, not a compatibility risk for how this app is actually used):
       - `::-webkit-scrollbar { width: 16px }` — wider than the native default.
       - `::-webkit-scrollbar-thumb` is one flat `var(--border)` fill with a 3px
         `var(--bg-elevated)`-colored border (creates a subtle inset-padding look) —
         **no `:hover` rule exists for it**, which is what actually removes the hover
         effect: browsers only apply their own built-in hover-darken behavior to an
         *unstyled* native scrollbar; once `::-webkit-scrollbar-thumb` is customized at
         all, nothing changes on hover unless a `:hover` variant is explicitly added, so
         omitting one was sufficient — no extra "disable hover" rule was needed or
         written.
       - `::-webkit-scrollbar-button:single-button:vertical:decrement/increment` —
         up/down arrow buttons at the two ends, drawn as inline SVG triangle data URIs
         (`fill='%238a97b3'`, i.e. `--text-muted` hardcoded since CSS custom properties
         can't be referenced from inside an encoded SVG data URI) rather than a Unicode
         glyph or an image asset — crisp at any zoom, no extra file.
       Close button retightened now that the scrollbar's width is fixed and known
       instead of guessed: `.modal-close`'s `right: 1.5rem` (item 15) → `right: 1.1rem`.
       Verified visually on New Jersey's modal (scrollbar arrows render at top and
       bottom, thumb has no hover-state flicker, X sits close to the scrollbar without
       overlapping it).
   17. **Combat-modifier pills carry their restriction, and no longer merge unrelated
       bonuses** (2026-08-19) — "Pour la partie puces a côté des statistiques, je voudrais
       plus de précisions sur les infos. Par exemple Alvitr n'augmente ses dégâts que
       contre les light armor." A pill read `${COMBAT_MODIFIER_LABELS[key]} +${amount}%`
       off one summed number per stat, so Alvitr's "DMG Dealt +15%" (Light-Armor-only, per
       "Rune of Omniscience") was indistinguishable from an unconditional one — and worse,
       an unconditional +10% and a "+15% vs Light Armor" on the same ship would have added
       up to a "+25%" that applies to nothing. `computeEffectiveStats` now returns
       `modifiers` as an **array of entries grouped per (stat, qualifier)** instead of a
       `{key: amount}` object; only `renderModalStatsTable` consumed it, so nothing else
       needed to change.

       The qualifier comes from the bonus's own `raw` phrase (`modifierQualifier`), by
       cutting the verb, the possessive and the trailing "by X% (Y%)" away, then taking
       what surrounds the stat term: a **target** after it ("to Light Armor enemies", "to
       Sirens", "with AP") and a **source** weapon before it ("Main Gun", "Torpedo"). Both
       halves are filtered rather than taken raw — a target only counts if it opens with a
       restriction preposition (`MODIFIER_TARGET_RE`), which drops the "dealt" left over
       from "Crit DMG dealt" and the lone "increases damage dealt by self"; a source only
       counts if it names a
       weapon from `MODIFIER_SOURCES` (~12 terms), which drops possessives ("this boat's",
       "Tirpitz's") and other stats riding the same sentence ("FP and Crit Rate").
       `MODIFIER_SOURCES` also fixes the casing, since the wiki writes both "Main Gun
       efficiency" and "main gun efficiency" and the pills sit side by side. A source is
       folded into the label rather than shown separately ("Main Gun Efficiency", "Torpedo
       Crit Rate" — never "Main Gun Weapon Efficiency", see `modifierLabel`); a target
       renders as a second line inside the pill (`.combat-modifier-target`, and
       `.has-target` squares the stadium radius off since it reads badly around two lines).

       Verified by surveying **all 115 distinct pill shapes the dataset produces** (script
       in scratchpad, eval'ing the helpers against `ships.json` — the same
       check-every-case-not-just-the-reported-one method as the Interaction guards) rather
       than by looking at Alvitr alone: no junk qualifier survived, 150 of 465 pills across
       888 ships carry a restriction, 0 errors.

       The pill's `title` (`modifierSourceText`, `cursor: help`) quotes the skill name
       plus the **whole sentence** the bonus was extracted from, at max skill level to match
       the number shown — `raw` drops whatever gated it, and that gate is often the real
       precision ("Once per battle, when this barrage scores a total of 3 hits: increases
       this ship's Crit Rate and Crit DMG by 25%", Alvitr's other two pills). Only the
       combat-modifier pills got this treatment: the same audit over plain numeric stats
       found **3 qualified bonuses dataset-wide**, all odd stat mappings, so the grid was
       left alone.

   **Takeaway on giving feedback for this kind of change**, from step 3 when asked
   directly: point at what's specifically wrong rather than "it doesn't match": is it the
   values shown (one vs. two), the shape (grid vs. list), or the grouping/order? A
   concrete structure ("3 columns, 4 rows, in this order") or an annotated screenshot
   beats "like the game" alone — "like the game" only fully lands once the actual
   reference image is in hand.
4. **Interaction** (`computeInteractions` / `renderModalInteraction`): scans every OTHER
   ship's skills for text mentioning this ship's nation / hull type / fleet role / class /
   name, grouped into collapsible categories. **This is ally-team-composition only — PvP/
   Hunter-type bonuses against enemies of that type are deliberately excluded.** This
   required a long list of precision guards (see below) after several rounds of the user
   pointing out specific false positives by name. The excerpt shown per match is the
   FULL skill description, never truncated — an earlier version cut it to 400 chars +
   "…", which the user flagged (2026-08-17, "dans les skills, les textes ne sont pas
   complets") after some skills ran past 900 characters. This is the same "never cut
   text" principle already applied to the Barrages table earlier in the project — don't
   reintroduce a length cap here for tidiness/performance without checking with the user
   first, even if a modal ends up with a very tall Interaction list.

   **Per-entry "+" toggle, not a section-wide checkbox** — a base skill and its "+"
   enhanced version ("+" appears under Retrofit `R`, Unique Augment `Aug`, AND Fate
   Simulation `FS` markers, not just Augment — 228 "+"-suffixed skills exist across the
   dataset, only 179 of them Aug-marked) usually both independently match the same
   Interaction category, since the "+" text is normally the base text with something
   appended rather than a full replacement. A first attempt at fixing this (2026-08-17)
   added a single "Unique Item" checkbox for the whole Interaction section that only
   handled the Aug-marked ~179 — the user rejected this ("Non ce n'est pas ce que je
   demande") with a concrete counter-example: 2B x Chang Chun's "Mutual Assistance" /
   "Mutual Assistance+" pair is Retrofit-marked (`R`), so it kept showing as two rows
   regardless of that checkbox's state. What the user actually wanted: **ONE row per
   matched skill, with a small "+" button inside that specific row** to reveal the
   enhanced text, not a global toggle. `computeInteractions` now detects this itself —
   when a match's skill name ends in `+`, it looks for an already-collected entry (same
   source ship, same category) whose skill name is the "+"-stripped version and merges
   into it (`existing.enhancedSkill` / `existing.enhancedText`) instead of pushing a
   second row; if the base version never independently matched this category (e.g. only
   the "+" text's added clause mentions the relevant fleet role), the "+" version is
   simply shown alone, no merge needed. `renderModalInteraction` renders the base text by
   default with both paragraphs pre-rendered (`.interaction-desc` /
   `.interaction-desc-enhanced`, the second `hidden`) and a toggle button that flips
   visibility + swaps the shown skill name — no re-render or `highlightKeywords` re-run
   needed on click. `ALL_SKILLS_INDEX` is a single flat list again (both base and "+"
   skills included, unfiltered) — there is no per-render or global toggle state to plumb
   through anymore.

   **The toggle button's label/color match the marker**, not a generic "+"
   (`SKILL_MARKER_VARIANT` / `skillVariantInfo()`, `.interaction-variant-toggle`) — "Retrofit"
   in `--accent` blue, "Augment" in `--gold`, "Fate Simulation" in `--rarity-elite` violet,
   reusing the exact same label/color convention as the ship's own toggle row at the top of
   the modal (`.retrofit-checkbox` / `.augment-checkbox` / `.fatesim-checkbox`) so the
   concept reads the same everywhere in the app. The color is set per-instance via a
   `--tag-color` custom property (same mechanism as the rarity tag and nation tag/chip),
   not a fixed class-level color. A handful of "+" skills carry no marker at all (3 found
   dataset-wide, e.g. Drake's "Flintlock Burst (A)+") — `skillVariantInfo()` falls back to
   a generic "Enhanced" / `--text-muted` for those; this fallback path exists in code but
   wasn't exercised by any actual Interaction match found during testing (the 3 null-marker
   skills apparently don't happen to produce a base/+ merge in the current dataset).

   **The toggle/badge shows a checkbox-style pastille** (2026-08-17, later same day) — a
   hollow circle (`border: 1.5px solid currentColor`) that fills solid
   (`background: currentColor`) when active, added via `::before` on both
   `.interaction-variant-toggle` and the ship's own top-of-modal Retrofit/Augment/Fate
   Simulation `<input type="checkbox">`s (which got `appearance: none` + the same custom
   circle styling, replacing the native browser checkbox) — one consistent "this is a
   toggle, and here's its current state" visual language across the whole app, per direct
   user request rather than a plain always-solid dot.

   **A skill whose "+" text matched entirely on its own (no base pairing) still needs a
   working toggle, not just a label** — found via two rounds of the same report.
   Chapayev's base skill "Cavalier of the Ether" is pure self-buff text with no
   ally-facing language at all; only her "+"/Aug version adds "When a ship in your
   Vanguard hits an enemy with this ailment, her DMG dealt is increased by 5%" — so the
   base version never independently matches any category, meaning the original merge
   branch in `computeInteractions` (which only ever merges a "+" match into an `existing`
   entry created by the base's OWN independent match) had nothing to merge into, and
   pushed the "+" skill as a bare standalone entry with no `enhancedText`. First fix
   ("Chapayev n'a pas le bouton Augment") added a static, non-interactive
   `.interaction-variant-badge` labeling it "Augment" — better than showing it as an
   unmarked skill, but the user immediately followed up ("je ne peux pas cliquer pour voir
   la version de base") wanting the actual base text too, not just a label confirming an
   upgrade was baked in. Real fix: in the `isPlusVariant && !existing` branch, look up the
   base skill directly on `entry.ship.skills` by name (regardless of whether it
   independently matched anything) and anchor the pushed entry on THAT skill instead —
   `{ skill: baseSkill, text: stripHtml(baseSkill.description), enhancedSkill: entry.skill,
   enhancedText: <the "+" text that actually matched> }` — the exact same shape the merge
   branch produces, so it renders through the identical code path: base text shown by
   default (pastille hollow), click the marker-labeled toggle to reveal the "+" text
   (pastille fills). `.interaction-variant-badge` and its CSS stay in place as a fallback
   for the (currently never-hit) case where the base skill can't be found on the ship at
   all — but the normal case now always produces a real toggle, not a label.

   **Interaction excerpts brought up to Skills' own formatting/Max Level parity**
   (2026-08-19, on direct request: "je veux que tu apportes les mêmes règles que dans les
   skills classiques. Mise en forme, couleur, max level par compétences, et a droite
   d'intéraction"). Before this, an Interaction excerpt was `desc.textContent = text`
   (`text` = `stripHtml(skill.description)`) — one flat, unstyled paragraph, no bullets,
   no bold, no way to see a skill's max-level numbers, even though the exact same
   underlying skill objects already got all of that in the Skills tab. Color-coding
   (`highlightKeywords`) was ALREADY applied here beforehand — that part didn't need
   fixing, only formatting and Max Level were actually missing.

   `buildInteractionItem` now renders `skill.description`/`enhancedSkill.description`
   (the raw HTML those skills always carry — `entry.text`/`entry.enhancedText` are just
   `stripHtml()` of the exact same field, confirmed 1:1 by reading `computeInteractions`
   before touching anything, so swapping the render source changes nothing about what
   matches) through the identical `renderLevelValues` → `appendSkillDescription` →
   `highlightKeywords` pipeline Skills already uses — same bullets/condition-action
   grouping/bold "important point" spans, not a second implementation. `.interaction-desc`
   gained `display: flex; flex-direction: column` (to hold the same multi-block output
   `.skill-desc` does) and a `b { color: gold }` rule, copied from `.skill-desc`'s own.

   **Max Level**: a per-item toggle (`createMaxLevelToggle()`, the same button Skills
   uses) shown in an entry's head row when its text actually has a scaled value, plus a
   section-header one next to "Interaction" (`#modal-interaction-max-toggle`, same
   `modal-section-title-row` markup as the Skills `<h3>`). Structurally this can't reuse
   Skills' `skillMaxLevelToggles` (one flat array built once per modal open) as-is:
   Interaction paginates, so at most ~20 of a category's possibly-hundreds of entries are
   ever in the DOM at once, and old array entries would go stale on every page flip.
   Fixed by never keeping a persistent list at all — `syncInteractionMaxLevelToggle()`
   queries `modalInteractionList.querySelectorAll(".max-level-toggle")` fresh every time
   (so it only ever sees what's actually on screen right now), and each toggle's paint
   function lives in a `WeakMap` keyed on the toggle element itself, populated once in
   `buildInteractionItem` and pruned automatically by GC when its page gets replaced —
   no manual bookkeeping needed across page or category changes. The sync call sits
   inside each category's own `renderPage()` (so a Prev/Next click re-syncs the header)
   with one more call after the whole category loop in `renderModalInteraction` (the
   in-`renderPage()` call is a no-op on a category's very first render, since its own
   `<details>` isn't attached to `modalInteractionList` yet at that point — the query
   would miss it; the post-loop call is what catches the true initial state).

   A base/"+" pair (the existing per-entry variant toggle from the section above) gets
   ONE Max Level toggle covering both — clicking it paints base AND enhanced text
   together (`paintBoth = atMax => { paintBase(atMax); paintEnhanced(atMax); }`), so
   switching Retrofit/Augment/Fate Simulation with the variant toggle afterward never
   lands on a stale level. Shown only if at least one of the two actually has a scaled
   value, same "no toggle where it wouldn't change anything" rule Skills already follows.

   **Bug caught before shipping, twice**, both by testing the actual rendered DOM rather
   than trusting the diff: the first rewrite of `buildInteractionItem` dropped
   `body.appendChild(head)` entirely while restructuring the function around it — every
   entry silently lost its ship name, skill name, variant toggle, AND the new Max Level
   toggle (the toggle was still being built and given a click handler, just never
   attached to anything the user could see or click), while the description text still
   rendered fine — visually looking almost correct in a screenshot, only caught by
   querying `.interaction-head` in a headless test and getting `null`. `.interaction-desc`
   gaining `display: flex` also needed the same `[hidden]` override
   `.max-level-toggle[hidden]` already has (`.interaction-desc[hidden]`/
   `.interaction-desc-enhanced[hidden] { display: none; }`) — the `[hidden]` attribute's
   UA-stylesheet rule and an author `display: flex` rule sit at equal specificity, so
   without the explicit override the base/enhanced text toggle would have shown both
   paragraphs stacked instead of swapping.

   Verified: full 888-ship open/close regression (0 errors), plus 2B specifically (the
   documented worst-case for Interaction volume) — 39/40 items on the first visible pages
   across categories carry a working Max Level toggle, clicking the section header
   changed all 39, pagination's Next button still works and freshly-rendered items
   correctly inherit the current Max Level state, and Chapayev's base/+ pair (the
   documented anchor case from earlier this file) renders correctly with Max Level
   toggled AND the enhanced text shown simultaneously.

   **The section above missed a real alignment bug that only surfaced once real ship
   modals were looked at** (2026-08-19, next message: "J'ai des 'Max level' qui ne sont
   pas a droite de leurs bulle de skill") — the 888-ship regression and the targeted
   tests all passed because they check FUNCTION (does clicking the toggle change the
   text) not LAYOUT (is the toggle actually flush with the card's right edge), so this
   shipped unnoticed. Root cause: `.interaction-body` (the flex child holding the head
   row + description, sibling to the portrait `.interaction-icon`) never had `flex: 1` —
   `.skill-body` in the Skills section always has (`flex: 1; min-width: 0;`), but nothing
   in Interaction previously needed the head row to fill the card's full width, since
   there was no `margin-left: auto` element inside it before this session's Max Level
   toggle. Without `flex: 1`, `.interaction-body` (and the `.interaction-head` row
   inside it) shrank to its own content's width instead of stretching to the card's
   available width — so `margin-left: auto` on the toggle WAS correctly pushing it to
   the right edge of that too-narrow box, just not to the card's actual right edge,
   which is why it only affected entries with a short ship+skill name (long ones
   happened to be wide enough already to reach, or nearly reach, the true edge, masking
   the bug). Fixed by adding the same `flex: 1` `.skill-body` already has. Confirmed by
   measurement, not just a screenshot glance: `getBoundingClientRect()` on 2B's "By Fleet
   Role" page showed `.interaction-head`'s own right edge exactly matching each toggle's
   right edge (0.0px gap) even on the broken cards — proving the toggle's own
   margin-auto logic was never the bug — while `.interaction-head`'s width varied
   293-556px against a constant 647px card width; after the fix, 0/39 toggles measured
   more than 30px short of the card's actual right edge (was 13/39 before).

   **"Belfast a la moitié de son texte en jaune sans raison"** (2026-08-19, next message) —
   reported against Interaction, but reproduced identically in Belfast's own Skills tab
   (her retrofit "Smokescreen: Belfast"), proving this predates the Interaction rewrite
   above and simply wasn't visible before: Interaction surfaces the SAME `skill.description`
   through the SAME `appendSkillDescription` now, so a pre-existing rendering issue only
   Belfast's own 4 skills could previously trigger now also shows up across the ~40 other
   ships that reference her. Not a tag-balance bug (`balanceBoldTags` already handles a
   fragment cut mid-`<b>`) — the SOURCE data itself has long runs of individually-
   `<b>`-wrapped single words ("`<b>Increases</b> <b>this</b> <b>ship's</b> <b>SPD</b>
   <b>by</b> <b>10.</b>`"), almost certainly the wiki's own auto-linker turning into bold
   once tags were stripped, one recognized term at a time — confirmed dataset-wide
   (21 skills carry a run of 4+ back-to-back single-token `<b>` tags; Belfast's
   "Smokescreen: Belfast" is the worst at 60 words, Juneau's "Martyr+" — already flagged
   in an ENUMERATION_SEPARATOR comment elsewhere in this file — second at 44) rather than
   assumed from the one reported ship. Every sampled case reads as noise, not
   intentional emphasis: Colorado's "Big Seven" even bolds a stray `(gif)` marker.

   Fixed with `stripAccidentalWordBoldRuns()` (`app.js`, right before
   `appendSkillDescription`, which now runs it on `html` as its first step) — strips
   `<b>`/`</b>` off any run of **2 or more consecutive** single-token bold tags
   (`<b>[^\s<>]+</b>` glued only by whitespace), never touching the text itself. A
   single `<b>` wrapping a whole phrase together (Belfast's own "All Out Assault":
   `<b>(Upon Retrofit)</b>`) has a space INSIDE the tag, so it can never match the
   single-token pattern and is left completely alone — this is what makes the fix safe:
   the normal, clearly-intentional case (one tag around a real phrase) is structurally
   different from the artifact case (many tags, one per word), so no denylist or
   per-skill exception is needed. An ISOLATED single-token tag with plain text on both
   sides (not touching another bold tag) also survives untouched, since the pattern
   requires 2+ in a row — e.g. Juneau's "Martyr" keeps 2 of its 9 original tags
   ("sunk," and "members," both standalone), only the 4-word run at the end
   ("of their max Health.") gets unwrapped. Applies to both Skills and Interaction at
   once since both call through the same `appendSkillDescription` — one fix, not two.
   Verified: Belfast's "Smokescreen: Belfast" now renders as normal text with its
   condition/bullet structure intact (the wall of bold was very likely also confusing
   the sentence/bullet splitter, since the fixed version now shows a cleaner "1: ... 2 or
   more: ..." bullet breakdown than before); full 888-ship regression still 0 errors.
5. **Keyword color-coding** (`highlightKeywords`, `KEYWORD_GROUPS`, `NATION_COLORS`,
   `STAT_COLORS`): recurring terms in skill descriptions and Interaction excerpts get
   consistent colors. **Only two categories are color-coded at all: nations and stats** —
   plus one standalone exception added 2026-08-17: the literal `[Operation Siren]` mode
   tag some skills carry gets bolded and colored (`OPERATION_SIREN_TAG_COLOR = "#E8A33D"`,
   matched as `KEYWORD_RE`'s 3rd top-level alternative / `m[3]` in `highlightKeywords`,
   not part of the `KEYWORD_GROUPS` nation/stat system since it's a single literal string,
   not a pluralizable vocabulary term). It's intentionally an exact-bracket match — plain
   "Operation Siren" without brackets (the mode name used in ordinary prose elsewhere in
   the same skill text) stays uncolored; don't loosen this to match the bare phrase too,
   that was deliberately not asked for.
   `NATION_COLORS` also colors the nation everywhere else it's shown as a UI pill, not
   just inline text: the nation tag in the modal's top tag row (`renderModalTags`, via a
   `.nation-tag` class reusing the same `--tag-color` custom-property mechanism the
   rarity tag already used) and the nation filter chips at the very top of the page
   (`makeChip`, `.chip.nation-chip` — colored border/text when unselected, solid fill
   with dark text when active/selected). If nation colors are ever revised, both of these
   pick the change up automatically since they read `NATION_COLORS` directly — no
   separate list to keep in sync.
   Everything else (hull types, weapon terms, DMG/Damage, healing verbs, fleet role
   Vanguard/Main Fleet, Siren) was explicitly removed on 2026-08-17
   ("enlève tout ce qui n'est pas une nation et pas dans la liste de la table de couleur.
   Exemple : DMG") — this also removes the earlier "Vanguard/Main Fleet color is fixed,
   don't touch it" rule from the previous session, since that color doesn't exist in this
   system anymore at all. If asked to re-add a removed category, that's new scope, not a
   revert — check with the user which color family (if any) it should join, don't just
   restore the old hardcoded hex from git history/memory.
   - **Nations get one color EACH** (`NATION_COLORS`, 30 entries). The 13 major/pirate
     nations (Eagle Union, Royal Navy, Sakura Empire, Iron Blood, Dragon Empery, Sardegna
     Empire, Northern Parliament, Iris Libre, Vichya Dominion, Kingdom of Tulipa, Liga de
     Pedrería, META, Tempesta) use **exact hex values the user supplied directly**
     (2026-08-17, their own "dominant color" reference table) — these are authoritative,
     don't second-guess or re-derive them. Three of those thirteen — Vichya Dominion,
     Iron Blood, META — were lightened in HSL space (same hue/saturation, `+L` only) from
     the user's given hex because the literal value measured under 3:1 contrast on this
     app's dark surface (2.16/2.47/2.68); the other ten are the verbatim supplied hex.
     `Universal` and the 16 collab nations (Neptunia, Bilibili, KizunaAI, Hololive, ...)
     were NOT covered by the user's table — those still use general-knowledge picks
     (source franchise's own brand color — Neptunia purple, KizunaAI cyan, SSSS neon
     green, etc.), grounded via `Site web/Nations - Azur Lane Wiki.htm` (lists the 30
     nations but has no hex codes itself — the wiki's own badge icons are monochrome line
     art, not colored brand assets). If the user supplies hex values for any of these
     remaining 17, replace the guess the same way — verbatim first, lighten only on a
     contrast failure. **Nations are also underlined** (`text-decoration: underline`, via
     the `underline: true` flag on that `KEYWORD_GROUPS` entry) — this is what tells a
     colored nation apart from a colored stat at a glance, now that both are per-entity
     palettes; don't remove the underline without giving nations back a single shared
     color, or the two systems become visually indistinguishable.
   - **Stats get one color EACH** (`STAT_COLORS`, 15 entries) using **exact hex values
     the user supplied directly** (2026-08-17, their own stat color table) — Luck, Armor,
     Reload, Health, Firepower, Torpedo, Anti-Air, Evasion, Aviation, Oil Consumption,
     ASW, Speed, Oxygen, Ammunition, Accuracy. All 15 cleared >=3:1 contrast verbatim, no
     lightening needed. Each row also colors whichever abbreviation/variant the actual
     corpus uses (checked by occurrence count, not guessed) — FP for Firepower, Ammo for
     Ammunition, HP + Max HP for Health, etc. "Anti Air" as the user wrote it (no hyphen)
     has zero occurrences in the real skill text; "Anti-Air" (hyphenated) has 63, so
     that's the form matched — only the display spelling differs from the table, not the
     color. `Oil Consumption` has zero occurrences in skill text at all (it's a passive
     stat, never referenced in prose) — included anyway for completeness with the user's
     table; it just never highlights anything currently. This REPLACES the earlier stat
     palette entirely, including the 5 combat-modifier colors (Crit Rate, Crit DMG, Hit
     Rate, Evasion Rate, Weapon Efficiency) — those aren't in the user's 15-row table, so
     per the same "remove what's not nation/not-in-the-table" instruction they're gone,
     not folded into anything.
   - **Named mechanics are a THIRD category, added 2026-08-19** on direct request ("je veux
     bien un code couleur pour Armor Break, Special burn, Smokescreen qui sont des
     mécaniques qui reviennent souvent" + "un code couleur pour les skills nommés qui
     reviennent comme Berserk Mode"). This supersedes the "only two categories" rule above
     wherever it still reads that way — nations, stats, mechanics. Two halves:
     - `MECHANIC_COLOR_GROUPS` (5 entries, one color each, same shape as `STAT_COLOR_GROUPS`)
       covers the statuses that are game-wide vocabulary, picked by corpus frequency rather
       than by feel: Burn (98 descriptions), Special Burn (41), Armor Break (40),
       Smokescreen (32), Flooding (20). Each row also carries whichever other spelling the
       text actually uses — "Burning" (18), "Armor-broken" (3) — counted, not guessed; a
       trailing "s" is already handled by `KEYWORD_RE`. **These 5 hues are picks, not
       supplied**: unlike the nation and stat tables there was no user table and no saved
       wiki page documenting the game's own colors for these effects (checked: the Combat
       page says nothing about them), so they're mnemonic guesses — fire, water, cracked
       armor, smoke — and should be replaced verbatim if the user ever supplies real ones.
     - Per-skill names a single skill coins for itself ("Berserk Mode", "Frostshred",
       "Pearl Moon" — 22 across the dataset, 93 occurrences) share ONE color,
       `NAMED_MECHANIC_COLOR = "var(--accent)"`, deliberately the same color the mechanic's
       own section label already uses so the name in the sentence and the block it heads
       read as one thing. A palette here would be meaningless — each name appears in
       exactly one skill, so there'd be nothing to memorize.
     `namedMechanics(html)` derives them from the existing `mechanicNames()` cues, with two
     filters: mode tags are stripped first (so the bracket cue can't capture
     "[Operation Siren]", which has its own color), and a name must be **used at least
     twice** — matching the user's own "qui reviennent" wording, and cheap protection
     against a loose cue. `NAMED_MECHANIC_STOPLIST` handles the only two things the cues
     pick up that aren't names: "Lv" (from Alsace's "inflicts Lv.1 Holy Judgment" — note
     the real mechanic there, "Holy Judgment", is what the cue *misses*) and "DMG" (Little
     Prinz Eugen's "inflicts DMG up to 6 times"). Named outright rather than filtered by a
     minimum length, which would be arbitrary in both directions.

     **Mechanics are rendered as a tinted chip** (`.kw-mech`), not just colored text —
     with three palettes now sharing one sentence, hue alone can no longer say which system
     a colored word belongs to: a stat is colored and bare, a nation is colored and
     underlined, a mechanic sits on a chip. This is also what makes the per-mechanic hues
     safe despite sitting close to stat hues (Armor Break/Luck are 8 RGB units apart,
     Burn/Firepower 20) — they're never confusable because the treatments differ. The tint
     is `color-mix(in srgb, currentColor 16%, transparent)`, so JS still only sets `color`.
     It's applied via `box-shadow` spread rather than horizontal padding on purpose:
     padding widens the inline box and leaves the following comma or period floating a
     space away from the name ("enters Berserk Mode ."), which was visible in the first
     screenshot pass.

     **Mechanics keep the casing the wiki wrote** (`keepCase: true` on the group), unlike
     nations and stats, which are normalized to `canonical`. "smokescreen" is lowercase in
     72 of its 87 occurrences — capitalizing them all would be the formatting visibly
     rewriting the text, which this project's skill-formatting work has ruled out
     throughout. Verified: full 5376-render losslessness pass shows **0 character
     failures and 0 word-token failures** after the change.

     Wiring: `highlightKeywords(container, mechanics)` gained a second argument, and the
     per-skill names take **group 1** of the match regex, ahead of the fixed vocabulary, so
     a name that starts with a global term ("Standard Armor Break", Intrepid) is matched
     whole instead of losing its first word to the shorter global match. With no names to
     pass, group 1 compiles to `((?!))` — a group that can never match — which keeps every
     other group's number stable rather than having two regex shapes. `KEYWORD_RE` is now
     built per call by `keywordRegExp()`, with the no-extras case cached (the Interaction
     list calls it once per rendered entry). The previously-unused `className` field on
     `KEYWORD_GROUPS` is now what carries `kw-mech` onto the span, so nation/stat spans
     also gained `kw-nation`/`kw-stat` classes — harmless, no CSS targets them.
     Also collapsed `escapeForRegExp` into the pre-existing, byte-identical `escapeRegExp`
     — the former was added a session earlier without noticing the latter already existed.

   **This deliberately breaks the dataviz skill's "≤8 categorical hues" rule for both
   nations and stats, on the user's explicit instruction**, after I raised the CVD-
   distinguishability tradeoff as a doubt and the user chose authenticity/granularity
   over guaranteed pairwise separation both times. Both sets are individually
   contrast-validated (≥3:1 against `#0b1120`) but NOT validated pairwise — some visually
   similar clusters are expected and accepted (nations: Iron Blood/Universal both cool
   greys, Neptunia/Date A Live both purple, several collab pinks; stats: none currently
   close, closest pair Anti-Air/Oxygen at a comfortable margin). Don't reach for the
   `--pairs all` validator on either set — it structurally can't pass at N=15 or N=30 and
   re-running it just reproduces the already-accepted tradeoff. All four color categories
   are per-entity rather than per-group, so the dataviz skill's 8-hue categorical cap
   doesn't apply to anything in this system — there's no shared group left to keep under 8.
   Two exceptions, both small enough that every pair IS worth checking by hand: the
   mechanic palette (N=5, closest pair Special Burn/Smokescreen at a comfortable margin;
   the original Flooding blue was moved off `--accent` because the two chip colors sat 32
   RGB units apart), and the ammo/caliber palette added the same day (N=4 distinct colors
   — ochre/red/blue/orange, `high-caliber` deliberately reuses HE's red per the user's own
   spec — four different hue families, no close pair possible). Do the same for any future
   set small enough to make it meaningful.

   - **Ammo type and caliber are a FOURTH category, added 2026-08-19** on direct request
     ("normal -> ocre, HE -> rouge, AP -> bleu, SAP -> orange, High caliber -> rouge").
     `AMMO_CALIBER_TERMS` (`app.js`, right after `MECHANIC_COLOR_GROUPS`) holds 6 entries:
     `Normal`, `HE`, `AP`, `SAP`, `high-caliber`, `high caliber`. Rendered plain (bare
     colored text, the `.kw-ammo` class carries no chip/underline of its own) — the
     abbreviations read the same visual weight as `.kw-stat`, which is deliberate.

     **The 4 abbreviations needed case-sensitive matching, which nothing else in this
     file does** — `KEYWORD_RE` is built with the `i` flag throughout (required for e.g.
     "smokescreen" appearing lowercase most of the time), but under that flag "HE"
     matches the pronoun "he" and "Normal" matches the ordinary adjective ("returns to
     normal") constantly. Checked against the actual corpus before shipping (the same
     `node -e` frequency-count habit used for every other palette here): exact-case
     "HE"/"SAP"/"Normal" have **zero** false positives (0 "He" the pronoun, 0 lowercase
     "normal"-the-adjective survives requiring the capital). `keywordInfoFor` gained a
     `caseSensitive` check (`matchText !== info.canonical` rejects the match, falling
     through to plain text) rather than trying to encode case into the shared regex — it
     stays one `i`-flagged pattern for every group, and only the ammo terms opt into the
     stricter check (`AMMO_CALIBER_TERMS[t].caseSensitive`, read via `perTermCaseSensitive`
     on the `KEYWORD_GROUPS` row, same indirection `perTermColor` already uses).

     **"AP" stays ambiguous even with exact case** — Action Points (a fleet-wide airstrike
     resource, "your fleet gains 10 AP", "AP cost") is written in the identical case as AP
     ammunition, so case alone can't separate them. `apIsAmmoType(text, index)` is a
     context check (same `text.slice` pattern `isGenuineAllyMatch`'s guards already use for
     Interaction) verified against **all 105 occurrences by hand**: Action Points is always
     either preceded by a digit/"more" ("gains 10 AP", "10 or more AP") or followed by
     "cost"/"consumption"/"-consuming" ("AP cost", "an AP-consuming skill"); the ammo sense
     never touches either. 71 ammo / 34 Action Points, both counts confirmed correct by
     eye before wiring the guard in — this is the same "verify every case, not just the
     reported one" method the Interaction guards were built with, applied to a fourth
     color palette this time instead of a matching category.

     **"high-caliber"/"high caliber" needed the opposite fix**: the user wrote "High
     caliber", but the actual corpus (checked, not assumed) writes it lowercase mid-
     sentence in all 5 occurrences ("a high-caliber main gun (280mm or higher)") — a
     capitalized term would have silently matched nothing. No case-collision risk either
     way (unlike the abbreviations, "high-caliber" as an exact 2-word phrase doesn't
     collide with ordinary prose), so it's the one entry in the group left
     case-insensitive. `Large-caliber` and `CA-caliber` (found alongside it, same corpus
     sweep) were deliberately left uncolored — asked the user directly rather than
     guessing whether the "same 280mm threshold, different wiki wording" reading was
     right, and the answer was to scope this to high-caliber only.

   **Data quirk found while wiring this up**: `ship.nationality` stores
   `"BLACK★ROCK SHOOTER (Nation)"` (with a literal `" (Nation)"` suffix) for that one
   collab — a disambiguation artifact that never appears in actual skill prose and was
   leaking into the modal tags and filter-panel chip label verbatim before this session.
   `nationDisplayName()` strips a trailing `" (...)"` parenthetical and is used everywhere
   nationality is matched against text or shown to the user (`KEYWORD_GROUPS` nation terms,
   `computeInteractions`'s nation regex, `ALL_NATION_TERMS`, `renderModalTags`, the filter
   chip label) — but NOT for the raw `ship.nationality` value used internally for grouping/
   counting/filter-state, which is left untouched so filter behavior doesn't change. This
   is the same bug *shape* as the earlier `ship.class` "Class"-suffix bug (source data
   carries bookkeeping text that must be stripped before it's used for matching or shown to
   the user) — worth checking for a third instance of this pattern if something else in the
   data ever silently fails to match.
   Coverage was audited against the actual corpus (`node -e` frequency counts per
   candidate term) rather than guessed — e.g. this is how "SPD" (134 occurrences) and
   spelled-out "Damage" (308 occurrences) were caught as gaps in an earlier, abbreviation-
   only version of this system.
6. **Modal section titles ("Level", "Stats", "Skills", "Barrages", "Interaction") were
   near-illegible for bright-rarity ships** (2026-08-18) — `.modal-info`'s background is
   a rarity-colored gradient (`color-mix(in srgb, var(--modal-rarity-color) 55%,
   var(--card-bg))` fading to `--card-bg`), and these titles were styled with
   `var(--text-muted)` (#8a97b3), a desaturated blue-grey picked for contrast against
   flat `--bg`/`--card-bg`. Computed against the actual mixed gradient color for a Super
   Rare ship (A2, gold `#f4d35e` mixed in) the contrast ratio comes out to roughly
   **1.3:1** — effectively invisible, not just "hard to read". No single flat text color
   fixes this for every rarity (Normal grey through Decisive red all mix to very
   different backgrounds), so instead of hunting for one color that happens to survive
   every rarity's gradient, `.modal-section-title` and `.modal-level-control-label` got a
   dark halo: `color: var(--text)` (bright, near-white) plus a two-layer
   `text-shadow` (`0 1px 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.5)`) and bumped to
   `font-weight: 700`. This is the standard "text over a photo" technique — a dark
   outline around light text stays legible against ANY background color/lightness,
   unlike a flat-color contrast fix which only covers the specific background(s) it was
   computed against. `text-shadow` is inherited, so `.modal-subsection-hint` (the
   "after active skills..." bit nested inside the Stats `<h3>`) picks up the same halo
   automatically without its own rule change. Verified by screenshot against two of the
   worst-case gradients in the dataset: A2 (Super Rare gold) and Alsace (Ultra Rare
   pink) — both render "Level"/"Stats"/"Skills" clearly readable where they were
   previously blending straight into the background.
7. **Follow-up polish on the same modal, same session** (2026-08-18, next message):
   - `.modal-subsection-hint`'s remaining `opacity: 0.8` + `var(--text-muted)` styling
     (the em-dash hint text next to "Stats") was still comparatively dim despite
     inheriting the halo from item 6 above — changed to `color: var(--text)` with no
     opacity reduction, same brightness as the section title it's attached to, on
     direct request ("mets aussi la même couleur en lisible"). The leading "—" was
     replaced with "," per explicit request too — text is now "Stats, after active
     skills, conditions assumed met" instead of "Stats — after active skills...".
   - The Interaction section's explanatory sentence ("Other characters with skills that
     reference this ship's nation, hull type, fleet role, class, or name directly.") was
     removed outright — the section is self-explanatory from its entries, per direct
     request. Its dedicated `.modal-interaction-hint` CSS rule (a small negative-margin/
     font-size tweak that only that one paragraph used) was deleted alongside the
     `<p>` in `index.html`, not left behind as dead CSS.
   - **Ship name in the modal header now uses the ship's own rarity color** instead of a
     fixed `var(--gold)` — `.modal-heading h2` reads `var(--modal-rarity-color,
     var(--gold))`, the exact same CSS custom property `openModal()` already sets on
     `.modal` per-ship (`app.js`, used since earlier in the session to tint the
     `.modal-info` background gradient) — no JS change needed, just pointing the
     heading's `color` at a variable that was already being kept in sync. Given the
     `.modal-info` background gradient is ALSO derived from this same rarity color
     (55% mixed near the top, fading out), a name rendered in the identical flat color
     can sit close in luminance to its own backdrop right where the heading lives —
     same underlying risk as item 6, so the same dark-halo `text-shadow` was added here
     too rather than assuming the rarity color alone would stay legible.
   - **Rarity filter chips merged**: the Rarity filter row used to list all 7
     `RARITY_ORDER` values as separate chips; "SR/Priority" and "UR/Decisive" are now
     one chip each, on direct request ("réunis SR/Priority et UR/Decisive"). New
     `RARITY_FILTER_GROUPS` (`app.js`, right after `RARITY_ORDER`) defines the chip-to-
     underlying-rarities mapping — `{ label: "SR/Priority", values: ["Super Rare",
     "Priority"] }` etc. — and `FILTER_GROUPS`'s rarity entry now exposes `options`
     (this shape) instead of a flat `values` list. New `makeMultiChip(group, values,
     label)` sits next to the existing `makeChip`: same click-to-toggle chip, but it
     adds/removes ALL of its `values` from `active[group]` together instead of just one,
     and reads "active" if ANY of them is currently selected (they can only ever be
     added/removed as a pair through this chip, so in practice they're always in sync).
     `applyFilters`'s matching logic (`active[key].has(s[key])`) needed no change at
     all — a ship's single `rarity` string is still just checked against Set
     membership, and the Set can now simply hold two rarity strings behind one visual
     chip. Verified: clicking "SR/Priority" selects exactly 341 ships (309 Super Rare +
     32 Priority, counted directly from `ships.json`), matching the expected union.
8. **Ship name header, three iterations in one session, converging on a strip header
   with a faction-logo watermark.**
   1. First attempt (2026-08-18): "un petit bandeau stylisé en fonction de la nation sur
      le nom... ça ferait ressortir les noms" — made `#modal-name` itself a small
      solid-color banner (nation color as background) with pointed ribbon ends via
      `::before`/`::after` `clip-path` triangles.
   2. User: "pas terrible, fais en sorte que ce petit bandeau soit simplement lisible" —
      the ribbon shape wasn't wanted, readability was the actual ask. Walked back to a
      plain rounded rectangle with a nation-colored left accent border and a darkened
      `color-mix()` fill, dropping the pointed-end pseudo-elements.
   3. **Next message, the real ask** (2026-08-19 — turns out steps 1-2 hadn't found the
      actual request yet): "Ce que je voulais c'est un espèce de header en bande avec le
      logo du navire et son nom. La couleur peut être générique. Regarde dans Nation, les
      logos de factions, mets le en espèce de filigrane en arrière plan." Both prior
      attempts colored the name text/box itself by nation — what was actually wanted is
      a full-width strip header (not a text-hugging box) with a **generic** background,
      the existing hull icon + ship name sitting on it as before, and the nation's own
      faction *logo* (not a color) bled into the background as a large, faint watermark.

      **Sourcing the logos**: `Site web/Nations - Azur Lane Wiki.htm` has a proper table
      (`In-game Nation | Prefix | Belligerent | Icon`) — each icon's wrapping
      `<a title="...">` names its real nation unambiguously, so the code-to-nation
      mapping was read directly off that (`node -e` regex over the raw HTML,
      `title="([^"]+)"><img src=".../50px-([A-Za-z]+)_1\.png"`), not guessed from the
      2-3 letter filename codes (which don't obviously map to nation names — e.g. Royal
      Navy's icon file is coded `En` not `Rn`). Confirmed the icons are the monochrome
      transparent-background line art already noted when this file was first opened for
      colors (2026-08-17) — exactly right for a watermark, no recoloring needed.
      **Only 16 of the app's ~30 nations have a genuinely distinct icon on that page** —
      the wiki's own Collaboration Nations section reuses ONE generic placeholder graphic
      (coded `Um`) for every collab except Neptunia/Bilibili/Utawarerumono, which do have
      real icons of their own. Rather than show that same placeholder for a dozen
      unrelated collabs, `FACTION_LOGO_CODE` (`app.js`, right after `NATION_COLORS`)
      only maps the 16 nations with a real logo; everything else just gets no watermark
      — graceful degradation, the same pattern already used for Cost/hull-icon/etc. when
      data is missing, confirmed at 808/888 ships getting a watermark, 0 crashes for the
      other 80.
      The 16 PNGs themselves (`100px-{code}_1.png`, the best resolution actually saved
      from the wiki) were copied to `assets/faction-logos/{code}.png` — kept the source's
      own short code as the filename (avoids the accented/starred characters in some
      nation names — Liga de Pedrería, BLACK★ROCK SHOOTER — becoming filenames).

      **Markup/CSS**: `.modal-heading` (formerly just a flex row for hull-icon + h2) is
      now the strip itself — `background: var(--card-bg)` (deliberately generic, not
      rarity- or nation-tinted, per "la couleur peut être générique"), padded, rounded,
      `overflow: hidden` to clip the oversized watermark. A new
      `#modal-nation-watermark` `<img>` sits first in the DOM, absolutely positioned to
      the strip's right edge, sized to 220% of the strip's height (deliberately
      overflowing top/bottom, clipped by the strip's `overflow: hidden`) and rendered at
      `opacity: 0.14` with `filter: brightness(0) invert(1)` (forces the grey line art
      to flat white, so it reads as a subtle watermark regardless of the source icon's
      own shading). Populated once per ship in `openModal()` (`app.js`, replacing the
      old `--modal-nation-color` CSS-variable logic entirely — that variable and its
      background-tint use from attempts 1-2 are gone, not left dead). Hull icon and `h2`
      both got `position: relative` so they paint above the absolutely-positioned
      watermark without needing an explicit `z-index` (later in DOM order = on top,
      within the same stacking context). The name's text color is still tied to rarity
      (item 7) with the same dark-halo `text-shadow` from item 6 — untouched by this
      redesign, still layered on top of the new generic strip.

      **Offered, not yet taken**: "Si tu les veux en plus grand dis moi" — the saved
      wiki page only has these logos up to 100px; if the watermark ever needs to look
      crisper (e.g. rendered larger, or on a high-DPI screenshot), ask the user for
      higher-resolution source images rather than upscaling the current ones.
      Verified: full 888-ship open/close regression at 0 errors, and visually confirmed
      on Abercrombie (Royal Navy logo watermark, visible but subtle) and A2
      (NieR:Automata — no watermark, confirmed the `hidden` fallback doesn't leave an
      empty broken-image box).
   4. **User liked the strip, asked for one more thing** (2026-08-19, next message:
      "c'est super pour le header ! Fais juste un dégradé de la couleur de la faction
      qui pars de la droite vers la gauche") — a right-to-left fade of the nation color
      layered into the strip's background, on top of (not instead of) the generic
      `--card-bg` from step 3. `--modal-nation-color` (the CSS variable from attempts
      1-2, removed in step 3 when the flat nation-colored box was dropped) is back,
      set the same way in `openModal()` from `NATION_COLORS[nationDisplayName(...)]` —
      this time it drives a gradient layer instead of a solid fill, so it coexists
      cleanly with the per-nation watermark *logo* from step 3 (only 16 nations) since
      `NATION_COLORS` covers essentially the whole roster (0/888 ships missing an
      entry, confirmed earlier this session) — every ship gets the color fade, only
      some also get a logo silhouette on top of it. `.modal-heading`'s `background`
      became two comma-separated layers: `linear-gradient(90deg, transparent 0%,
      color-mix(in srgb, var(--modal-nation-color, var(--border)) 55%, transparent)
      100%), var(--card-bg)` — the gradient (painted on top) is transparent at the left
      edge and a 55%-strength nation tint at the right edge, over the flat `--card-bg`
      layer beneath it as a fallback where the gradient itself is transparent. Right
      edge is deliberately where both the color and the logo watermark concentrate —
      the two reinforce the same nation identity in the same corner rather than
      competing for attention across the strip. Verified visually on Abercrombie
      (Royal Navy gold, fading from strong at the right past the watermark crest to
      transparent at the left, name still crisp) and Karlsruhe (Iron Blood red, same
      pattern) — full 888-ship regression still 0 errors after the change.
   5. **The offered higher-resolution logos arrived** (2026-08-19, next message: "Je te
      laisse regarder, je t'ai mis toute les images disponibles. Prends ce qui
      t'inspire le plus.") — the user saved the wiki's own per-file "File:{code} 1.png"
      pages (`Site web/File_{code} 1.png - Azur Lane Wiki.htm` + `..._files/`, one per
      faction) rather than just re-supplying the Nations page. These file pages embed
      each logo at its true original resolution (356-656px depending on nation,
      confirmed by reading each PNG's own `IHDR` width/height — not guessed from the
      thumbnail's `data-file-width` attribute) — a real upgrade over the 100px
      thumbnails item 8.3 had settled for. All 16 previously-mapped `assets/faction-
      logos/{code}.png` files were overwritten with these originals (same filenames, so
      no code changes needed for the existing 16).

      **This batch also included one nation the Nations-page table never had a row
      for**: `File_Cm 1.png` — "Cm" doesn't appear anywhere in that table (Universal is
      only mentioned in the prose above it, per item 8.3's own note), but the file
      page's own "links to this image" list included both "Eagle Union" and, more
      tellingly, "Universal" and "Universal Bulin" among the dozens of unrelated articles
      the same icon happens to be linked from — and the image itself is a generic
      gear/cog emblem, not a national flag, consistent with Universal being "a
      strictly-neutral nation... used universally by every other nation" (the same
      description item 8.3's design note already quoted). Added as `"Universal": "Cm"`
      in `FACTION_LOGO_CODE` — confirmed `"Universal"` is an actual `ship.nationality`
      value in this dataset first (`node -e` over `ships.json`) before wiring it in, not
      assumed. `File_Nation10.png` (the "Iris Orthodoxy" duplicate flagged back in item
      8.3's logo-sourcing work) was NOT added — same check, confirmed `"Iris Orthodoxy"`
      never actually appears as a `ship.nationality` value in this dataset (only "Iris
      Libre" does, already covered), so there's nothing for it to be a logo for here.
      Watermark coverage: 811/888 ships (up from 808/888). Full 888-ship regression
      still 0 errors after swapping in the new assets.
   6. **The remaining 13 collabs asked for by name, then reversed to "give them the
      shared icon anyway"** (2026-08-19) — user asked "mets les logos de chaque sous
      faction", listing all ~16 minor/collab nations (the ones tucked into the
      filter panel's "Subfactions ▾" dropdown) paired with their real-world franchise
      titles (e.g. "SSSS → SSSS.Gridman / SSSS.Dynazenon", "Danmachi → Is It Wrong to
      Try to Pick Up Girls in a Dungeon?"). Checked each of the 13 still-missing ones
      (KizunaAI, Hololive, Venus Vacation, The Idolmaster, SSSS, Atelier Ryza, Senran
      Kagura, To LOVE-Ru, BLACK★ROCK SHOOTER, Atelier Yumia, Danmachi, Date A Live,
      NieR:Automata) against multiple ships per collab, not just one (Hestia/Danmachi,
      Minato Aqua/Hololive, Anniversary Kizuna AI, Akane Shinjo/SSSS) — every one of
      them, on their own individual ship pages, points at the exact same generic
      `Um_1.png` the Nations page's Collaboration table already reuses for all of them.
      Reported this back rather than fabricating or guessing at distinct art (no live
      wiki access to search for one, and inventing a placeholder would misrepresent
      what actually exists). **User's reply confirmed the same finding independently
      and settled it**: "Ces nations n'ont pas de logos. Ils utilisent le fichier
      'UM_1' regarde de ce côté" — rather than leaving these 13 with no watermark
      (this map's original design, from step 3, specifically to avoid showing one
      unrelated placeholder for a dozen different franchises), the user chose to show
      the shared "Um" watermark for all of them anyway. All 13 added to
      `FACTION_LOGO_CODE` mapped to `"Um"`, no new asset files needed (already have
      `assets/faction-logos/Um.png` from step 3). Net effect: watermark coverage went
      from 811/888 to **888/888** — every ship in the dataset now gets one. Full
      regression still 0 errors.

9. **Equipment section** (2026-08-19, first pass) — the user asked to start designing the
   equipment part: a new section between Stats and Skills, showing the slots the way the
   game's own Gear panel does (they supplied a New Jersey in-game screenshot), grounded in
   `Site web/`'s `Equipment`, `Augmentation` and `Dockyard` pages. This is the first piece
   of the long-deferred equipment work (see "Unresolved" below) — the **slot layout only**;
   there is still no gear item catalog anywhere in this project, so nothing is "equipped".

   **What a slot looks like** (second pass, same day, after the first draft showed the
   full accepted-type list as text): a **square tile** — sized and framed like a ship card's
   thumbnail in the catalog grid, deliberately, since that grid is the picker this will
   eventually open — with the slot's **short name** underneath ("Main Gun", "Secondary",
   "AA Gun", "Torpedo", "Auxiliary", ...) and two chips below that: `Mounts ×3` and
   `Efficiency 150%`. The tile is empty (a dashed frame and a "+"), because there is no gear
   catalog and nothing to put in it yet; it is a plain `div`, NOT a button or a hover-styled
   affordance, since equipment selection isn't wired up and pretending otherwise would be a
   lie. The **Augment slot's tile is round**, not square — it is a separate socket in the
   game, not a sixth gear box — and carries nothing under its name.

   **Both chips spell their label out** (`Mounts ×3`, not a bare `×3`) because the user
   asked what the bare number meant — the card wasn't self-explanatory. "Mounts" is the
   game's own word for these: the Dockyard page describes a Limit Break as "adding
   additional equipment mounts (guns, torpedoes, planes)". Efficiency got the same treatment
   for symmetry, a lone "150%" raising the same "percent of what?" question. (For the
   record, since it came up: mounts are how many copies of the equipment fire — New Jersey's
   3 main-gun turrets, Unicorn's 4 fighters — while efficiency multiplies each shot's
   damage, per the Dockyard page's own wording.)

   **Detail lives in the tile's `title` tooltip, not on the card** — this is the section's
   consistent rule, applied twice on request: the full accepted-type list ("Accepts: BB Main
   Guns") plus `Preload N` (339 slots have one) for gear slots, and for the augment the list
   of modules it fits ("Fits: Type-4O Sword (unique), Lance, Greatsword — requires max Limit
   Break"). The augment's module list was visible under the card in the first pass and the
   user asked for it gone; moving it to the tooltip keeps the data reachable rather than
   dropping it, and `UNIVERSAL_AUGMENT_MODULES` still earns its keep by tagging the ship's
   own unique module "(unique)" there. If asked to trim anything else off these cards, do
   the same thing rather than deleting the underlying data.

   Efficiency is the fully-limit-broken figure — the wiki writes it as a progression
   ("120% → 150%"), the datamine keeps only the end value, which matches the
   max-investment assumption the stats grid already makes (see Cost, item 13).

   **The short name can't come from the type code alone for guns** — a BB's slot 2 takes DD
   guns as her *secondary* battery while a DD's slot 1 takes the same DD guns as her *main*
   one, so the code is identical and the meaning isn't. Rule (`EQUIPMENT_SHORT_NAMES` +
   `GUN_TYPE_CODES`): the first gun-taking slot on a ship is her "Main Gun", any later one
   is "Secondary"; every other code maps to a fixed short name. Checked against all 156
   distinct (hull, slot, types) combinations in the dataset before shipping — it also lands
   right on the awkward ones: submarines, whose deck gun sits in slot 3 behind two torpedo
   slots, still read "Main Gun"; Béarn's CL-gun-or-dive-bomber slot 3 reads "Main Gun";
   Akashi (repair ship) reads "Auxiliary" for slot 1.

   **`EQUIPMENT_TYPE_NAMES` was derived, not guessed** (`app.js`). `ship.equipment[slot]
   .type` is a list of bare numeric codes. Every saved wiki ship page has a Gear table
   naming what its slots 1-3 accept ("BB Main Guns", "Torpedoes", ...), so a scratchpad
   script cross-referenced 837 of those tables against the codes in `ships.json` — every
   code that reaches a listed slot came out unambiguous (1 DD / 2 CL / 3 CA / 4 BB / 5
   Torpedoes / 6 AA / 7 Fighters / 8 Torpedo Bombers / 9 Dive Bombers / 10 Auxiliaries /
   11 CB / 12 Seaplanes / 13 Submarine Torpedoes / 20 Missiles). **The wiki's table never
   lists the auxiliary slots 4-5**, which is where the leftovers live: 15 and 18 are still
   named by the few ships that also carry them in a listed slot ("Anti-Air Guns / ASW
   Bombers", "Auxiliaries / Cargo"), and 14 (DD/CL/CA only, both aux slots) is the
   anti-submarine slot the ASW page describes as sonar/depth charges. **17 has no source
   anywhere** — 2 ships, Köln and Köln META — so it is deliberately left out of the map and
   simply doesn't render, rather than being given an invented name. 21 never appears alone,
   only glued to 6, and the wiki labels every slot carrying the pair plainly "Anti-Air
   Guns", so **for the display name** it maps to the same string and the duplicate is
   deduped away — that reproduces the wiki's own label exactly. **This is only true of the
   label**: for what a slot may actually mount, 6 and 21 are different permissions — see the
   Time Fuze entry below, where treating them as one was an active bug. If a future dataset
   adds a code, the unknown-code path is already the graceful one: it disappears from the
   list.

   **`ship.augmentModules` is new data** (`data/ships.json` + regenerated `ships.js`) —
   the augment slot's modules are on each ship's wiki page ("Augment | N/A | Bowgun,
   Officer's Sword | 1") but were never extracted. A one-off scratchpad script pulled the
   Augment row off all 888 pages: **863 ships get modules, 25 don't** (24 have no saved page
   at all — the μ ships, Enterprise (Eagle Union), etc.; Royal Fortune has a page but no
   Augment row, consistent with the Augmentation page's note that Sailing Frigates only get
   one if they have a unique module).

   **The first extraction pass silently lost 35 ships** and it was only caught because
   An Shan and Unicorn visibly had no augment card in the rendered section. Cause: the row
   walk scanned forward to the next bare integer to find the "Max #" column, but a ship with
   a retrofit writes that column as a progression ("1 → 2"), so the walk ran past it, the
   row parsing desynced, and the whole table was abandoned — for every retrofitted ship,
   which is exactly the set that went missing. Fixed by matching `^\d+( → \d+)*$` instead
   of `^\d+$`. **Mogami is the one ship whose augment list carries a conditional tail**
   ("( Lance, Greatsword on retrofit)" — she changes hull class on retrofit); the list is
   cut at the parenthesis and keeps her base modules, since nothing about equipment in this
   app is retrofit-aware. Three names that look malformed are real ("A Lady's Hallmark
   (Perhaps)", "T3 Sakura Tech Pack (Display Sample)", "Special Mix (Do Not Drink)") — don't
   "fix" them. Verified before writing that
   nothing else in the dataset moved: re-serialised with `JSON.stringify(ships, null, 2)`
   to match the file's existing indentation (a first pass at indent 1 silently reformatted
   all 5.7 MB), then diffed old vs. new with `augmentModules` stripped — **0 ships changed
   otherwise**, and the only "deletions" in the git diff are last-field lines gaining a
   trailing comma.

   `UNIVERSAL_AUGMENT_MODULES` is the Augmentation page's "Universal Modules" table (12
   names, two per hull class — Hammer/Dual Swords for DDs, Bowgun/Officer's Sword for BBs,
   ...); anything outside that set is a ship's own unique module by construction, so no
   separate unique-module list is needed. The wiki lists the unique module first and that
   order is preserved.

   Verified: full 888-ship pass, section rendered for all 888 (a ship with no `equipment`
   still gets the augment card — 2B, whose only card is "Virtuous Contract"), augment card
   on 863, 0 unnamed slots, 0 broken images, 0 errors. Spot-checked against the wiki:
   New Jersey's five slots and augment row reproduce her page exactly, An Shan shows
   Missiles in slot 2 (the datamine holds her *retrofit* loadout — the wiki writes that
   slot "Torpedoes (Missiles on retrofit)"; this app has one equipment block per ship and
   no retrofit-aware variant, worth remembering if slot data ever looks off for a
   retrofitted ship).

   Section title is "Equipment", English like every other section title, even though the
   request said "équipements" — same code/UI-in-English convention as the rest of the app.

## Known data quality issues in `statBonuses` (worked around at runtime, not fixed at the source)

The original extraction script (not present in this repo — it was a scratchpad one-off)
sometimes mislabels `scope`. Two confirmed directions, both handled in
`computeEffectiveStats`:
- **"self" when it's actually about other ships** (e.g. Shinano: "increases the FP, EVA,
  and ASW of your DDs by 5%" tagged `self`) → guarded by `OTHER_SHIPS_TARGET_RE` (checks
  the bonus's own `raw` text for "your DDs/CVs/.../Vanguard/Main Fleet/fleet").
- **"fleet" when it's actually self** (e.g. Brest: "increases this ship's EVA by 5%"
  tagged `fleet`) → guarded by `SELF_LANGUAGE_RE` (checks for "this ship('s)"/"own"/"her
  own" in `raw`), which overrides the scope field.
- Duplicate identical bonus entries on one skill (seen on Shinano's "Dreamwaker's Bow")
  are deduped by a `seenRaw` Set keyed on skill name + raw text + min/max.

If more mislabeled-scope examples turn up, the fix pattern is: read the bonus's own `raw`
text, not the `scope` field, and add another targeted regex — don't try to re-run or
"improve" the original extraction script (it doesn't exist in this repo/session anymore).

### Missing statBonuses backfilled (2026-08-19)

The user reported a specific ship gaining no Speed from a skill that clearly should grant
one. The mislabeled-`scope` issue above assumes an entry EXISTS but points the wrong way;
this was a different, bigger problem — the original extraction script only ever captured
the FIRST stat clause in a sentence, silently dropping any further one. Two shapes, both
confirmed dataset-wide before touching anything:

- **Continuation**: "...FP by 5% (15%) **and SPD by 3 (8)**" — the first clause got an
  entry, the second (any stat, not just Speed) never did.
- **Standalone**: a skill whose entire bonus is one self clause — "Increases this ship's
  SPD by 5." — with nothing else in the description resembling the pattern the original
  script keyed off, so the skill got zero entries.

Rebuilt both as a scratchpad script (`extract_missing_bonuses.js`, not committed — same
convention as every other one-off data script this project has used), run to a **fixed
point per skill** so a 3+ way chain ("X by A, Y by B, and Z by C") gets every link, not
just the one adjacent to an already-known entry: each pass re-runs both patterns against
the current known-bonus set, and a pass that finds nothing stops the loop. Deliberately
narrow to keep it safe:
- Continuation only fires when a stat token immediately follows the connector
  (`, `/`and `) — a verb in between ("and **decreases** this ship's SPD") can never match,
  which is what makes it safe to run unattended rather than needing a target/polarity
  guard like `isGenuineAllyMatch`'s.
- Standalone only fires directly off "Increases/Increase this ship's/this boat's" —
  same reasoning: the possessive binding is what rules out enemy-target and debuff text
  structurally, not a denylist.
- Scope is computed the same way `computeEffectiveStats` already resolves it at
  runtime (self-language in the anchor overrides a mislabeled `scope` field) — baked in
  at write time so a short new raw fragment ("SPD by 3") doesn't need to independently
  repeat "this ship's" for the runtime guard to recognize it as self.
- A trailing `/` right after the amount (Gouden Leeuw: "AVI by 300**/**400/550/700 based
  on Development level") means a level-progression list, not a (min, max) skill-level
  pair — skipped rather than guessed at, since nothing else in this app models a
  "Development level" axis to pick a value from.
- Restricted to the 11 plain `NUMERIC_STAT_KEYS` stats (the ones the Stats grid actually
  renders). Combat-modifier stats (Crit Rate, Crit DMG, DMG Dealt, Hit Rate, Weapon
  Efficiency, Evasion Rate) were deliberately left out — those need the qualifier-aware
  handling `modifierQualifier` already does for existing entries (see item 3.17 above,
  the Alvitr case), which a bare continuation/standalone scan can't determine safely.

**Two bugs caught before applying, both by diffing the patched file against the original
rather than trusting the script's own summary count:**
1. The sentence-boundary check used to bound a continuation's search window was
   `/[.:;]/` — which also matches the decimal point in "5.0%", truncating the window
   mid-number and silently downgrading e.g. Guichen's "EVA by 5.0% (15.0%)" to a flat
   "+5" with the (15%) upgrade lost entirely. Fixed to `/\.(?!\d)|[:;]/` (a period NOT
   followed by a digit). Caught by manually re-deriving a few chained entries by hand and
   finding the numbers didn't match the source text.
2. The first pass rebuilt every *existing* bonus object from scratch (`{stats, min, max,
   isPercent, scope, raw}`) before appending new ones — which silently dropped the
   `unmapped` field 130 existing entries carried (target terms like "light cruisers" the
   original script couldn't map to a canonical stat key, e.g. on damage-dealt-vs-hull-type
   bonuses). Not read anywhere in `app.js`, but still authoritative data with no business
   being deleted as a side effect of an unrelated fix. Caught by a whole-file diff against
   the pre-patch data (`git diff --stat` showing implausibly many deletions for a supposedly
   additive change) — fixed by keeping the original bonus objects by reference and only
   ever pushing new ones, never rebuilding existing ones. **Whenever a script "patches" a
   large existing JSON structure, diff the full before/after (not just the intended new
   entries) before writing it back — an additive-looking change can still destroy fields
   it never intended to touch.**

**Result**: 174 new entries across 132 ships (`speed` 41, `firepower` 35, `reload` 30,
`evasion` 29, `antiair` 22, `accuracy` 19, `torpedo` 14, `aviation` 4, `luck` 2, `asw` 2),
verified three ways — a whole-file diff showing only additions (plus the trailing-comma-per-new-
sibling noise the augmentModules extraction already established as expected, see item 9
above), the standard full 888-ship `openModal`/`closeModal` regression (0 errors), and a
direct `computeEffectiveStats` spot-check confirming a non-zero Speed delta at level 125
for every ship in the original bug report's neighborhood (Blücher, Le Hardi, Minase,
Algérie, Bayard, Guichen, Mainz).

**Known remaining gap, not chased further**: a handful of skills still carry a self SPD
(or other stat) increase this pass doesn't reach — mostly a second/third value in a
3-way list where the middle link doesn't independently qualify as continuation OR
standalone (e.g. Bayard's "SPD by 20%, EVA by 10% (20%), **and Evasion Rate by 5%
(15%)**" — the trailing Evasion Rate is a combat-modifier stat, out of scope per the
restriction above), and a couple of skills that share a name across several ships
verbatim ("Mobility Mastery") where only some sibling ships' copies matched depending on
exact punctuation. If another specific ship is reported as still missing a stat, use the
same method: pull the skill text with `node -e`, confirm the clause is genuinely a flat
self bonus (not a debuff or enemy-target phrase), and extend the two patterns rather than
hand-editing `ships.json` for one ship.

## Known precision guards in `computeInteractions` (built up example-by-example — read before touching)

The user has repeatedly given **specific named counter-examples** (e.g. "Izumo n'interagit
pas avec Centaur", "Tirpitz ne renforce pas Izumo", "Brest avec Bolzano META") and expects
each to be root-caused and fixed with a general rule, not a special case for that one ship.
Current guards, all in `isGenuineAllyMatch()` in app.js, roughly in the order they were
discovered:

1. `ENEMY_TARGET_CUE_RE` — "damage dealt to X" / "against enemy X" = a Hunter-type PvP bonus
   against enemies of that type, not a fleet buff (Centaur → Izumo).
2. `ALL_OUT_ASSAULT_CUE_RE` — "All Out Assault - X Class" just names the ship's own special
   attack after her own class; never a fleet buff (confirmed by the user: "je n'ai jamais
   vu de All Out qui renforçait des alliés").
3. `NEGATIVE_CONDITION_CUE_RE` — "without other X" / "no X" = buff triggers on the
   ABSENCE of that type, not an interaction with one (Tirpitz → Izumo).
4. `FROM_SOURCE_CUE_RE` (hull category only) — "fires a barrage from battleship Hiranuma"
   names a summoned unit's own type, not a fleet-mate (Natori/Hiranuma → Izumo).
5. "AP BB guns" pattern (hull category, checked via inline regex) — names a weapon/ammo
   category (Battleship-caliber guns), not a ship type.
6. Parenthesis-glued abbreviation, e.g. "Kaga(BB)" — disambiguates which FORM of a named
   ship is meant (Kaga has both a Carrier and hidden Battleship form), not a hull-type
   reference. Guard: char immediately before the match is `(`.
7. `otherNationImmediatelyBefore` / `otherHullImmediatelyAfter` — compound qualifiers like
   "Dragon Empery Main Fleet ships" or "Sakura Empire CVs" restrict the buff to BOTH that
   nation AND that role/hull — a candidate ship only matches if it satisfies the whole
   compound condition, not just one piece of it (Chang Chun → non-Dragon-Empery Main ships).
8. `SOLO_FLEET_CUE_RE` — "if your Vanguard consists only of this ship" is a solo-fleet
   condition, the opposite of an interaction (Bolzano META → Brest; also found the same
   pattern on Dido μ and Azusa Miura).
9. `stripHtml()` also strips `(Replaces Old Skill Name)` bookkeeping text, since the
   replaced skill's own name can coincidentally contain a hull-type word.
10. Hull-type regex has a `(?<!Aviation )` negative lookbehind since "Battleship" and
    "Submarine" are literal substrings of the separate hull types "Aviation Battleship"
    and "Aviation Submarine".
11. The `class` category regex was flat-out broken until fixed this session — `ship.class`
    already includes the word "Class" (e.g. `"Izumo Class"`), so the old pattern required
    the literal text "Izumo Class-class" and could never match anything. Now strips the
    "Class" suffix first and matches `{stem}[- ]class`.
12. `AGAINST_CUE_RE` — the word "against" immediately before ANY category match ("Hit Rate
    against DDs") is always PvP/Hunter phrasing in this dataset, generalized instead of
    enumerating every stat name that can precede it (Warspite → any DD).
13. `ENEMY_IMMEDIATELY_BEFORE_RE` — the literal word "enemy"/"enemies" immediately before
    a match ("enemy Royal Navy CL", "enemy DDs", "enemy Submarines") — `ENEMY_TARGET_CUE_RE`
    alone only recognized "enemy" + a small fixed set of generic words (ships/fleet/etc),
    missing every hull-abbreviation/nation combination that could follow it (Z16 → any
    Royal Navy CL; Roma/Mogador/Cooper/San Jacinto → any Submarine).
14. `equipmentConditionFollows()` — "if this ship has Royal Navy gear/aircraft equipped"
    or "while equipping a CL Main Gun" is about the ship's OWN LOADOUT nationality/type,
    completely unrelated to allied ships in the fleet. Scans forward to the next sentence
    boundary (not just the next word) since the equipment noun is often past an "or Other
    Nation" branch or a comma-separated list ("Eagle Union, Iris Libre, or Vichya Dominion
    aircraft equipped"). This single pattern was responsible for roughly half of all
    remaining false positives found in the full-dataset audit (see below).
15. `FRONTMOST_POSITION_CUE_RE` — "if this ship is (not) in the frontmost position of the
    Vanguard: increases this ship's X" (Deutschland, Hermione) is a self-positional check,
    not about which other ships share the fleet. Deliberately narrow (checks for "in the
    frontmost position of" specifically) so it does NOT catch phrasing that genuinely
    targets a different ship by position ("...applied to the frontmost ship of the
    Vanguard", Z14; "this ship AND the frontmost Vanguard ship's...", Howe) — both of
    those must stay matched.
16. `NAME_MATCH_STOPLIST` — a few ships are literally named after reserved game terms or
    ordinary English words: **Vanguard** (Royal Navy Battleship), **Fortune** (Royal Navy
    Destroyer), **The 2nd** (SSSS collab). Matching their `displayName` would almost
    always catch the word's ordinary use ("the Vanguard fleet", "tells a fortune", "the
    2nd time") rather than a real reference to the ship — these are excluded from the name
    category entirely rather than trying to disambiguate every occurrence.
17. `selfNameRanges()` / `withinRanges()` — a skill that echoes its own name inline
    ("Ashen Might - Wichita II only: ...", inside the skill titled "Ashen Might -
    Wichita") isn't referencing another ship even when that name contains one (Wichita
    META's own title contains "Wichita", her un-retrofitted self). Computed as character
    ranges to skip, NOT by deleting the substring from the text — an earlier attempt that
    deleted it caused a regression by also erasing the literal "All Out Assault" cue text
    that guard #2 depends on (class-category false positives jumped 33→224 before this
    was caught and fixed).
18. `ENEMY_TARGET_CUE_RE` also needs bare `"dmg to X"` / `"damage to X"` (no "dealt") and
    `"deals to X"` — some Hunter bonuses skip the word "dealt" entirely ("Increases this
    ship's DMG to CVs and CVLs by 5%", I-26/U-73/Noshiro; "the DMG this ship deals to BBs
    and BCs", Murmansk).
19. The window `ENEMY_TARGET_CUE_RE` scans before a match had to be widened from 60 to 100
    chars — a long nation list ("DMG dealt to Iron Blood, Sardegna Empire, Sakura Empire,
    and META ships") can put the actual nation past a 60-char lookback.

### Second false-positive wave (2026-08-17, later same day): self-only conditions wrongly read as fleet-wide targets

The user spotted 2B showing interactions with `33`, `22`, `Acasta`, `Admiral Hipper META`,
`Admiral Hipper μ`, `Alfredo Oriani`, `Arizona META`, `Baltimore μ` — none of which
actually buff her — contrasted with `Avrora`'s "Increases your Vanguard's DMG dealt by
15% (35%)", a genuine, unconditional match. Root cause, found by dumping
`computeInteractions(2B)`'s full output (not just guessing from skill text): the `role`
category (`Vanguard`/`Main Fleet`) is extremely permissive — the literal word "Vanguard"
appears constantly in **self-referential position/headcount conditions**
("if this ship is the only ship remaining in your Vanguard...", "if this ship is in the
frontmost position of your Vanguard...") that were being read as if they named the
buff's target, when the actual effect that follows targets only "this ship". Four new
guards in `isGenuineAllyMatch`, all added this round:

20. `FRONTMOST_POSITION_CUE_RE` was too narrow (`"in the frontmost position of(?:\s+the)?"`
    only) — real text varies the preposition ("of" vs "in") and the determiner ("the" vs
    "your" vs "this ship's"): "position of your Vanguard" (Alfredo Oriani), "position in
    your Vanguard" (Admiral Hipper μ). Broadened to
    `/\bin the frontmost position (?:of|in)\s*(?:the|your|this ship's)?\s*$/i`.
21. `selfOnlyConditionedEffect()` — the general fix. A match sitting inside an
    "if there is/are.../if this ship is..." condition (`IF_CONDITION_PREFIX_RE`), where a
    colon immediately follows the match, and the effect clause after that colon never
    mentions a fleet-wide target (`BROADER_FLEET_TARGET_RE`: "your Vanguard", "all your
    ships", "other ships", etc.), is a self-only buff that merely used the fleet/role word
    as a headcount or positional gate (Brest: "if there are 3 ships in your Vanguard:
    increases **this ship's** EVA..."; Admiral Hipper μ's "Soothing Shield": "...in your
    Vanguard: immediately deploys **these shields**" — no self-mention needed, absence of
    a broader target is what counts). `clauseBefore()` bounds the check to the CURRENT
    colon-separated clause specifically so an earlier "if" that already resolved with its
    own colon doesn't leak into a later, unconditional clause (Baltimore μ: "if there is a
    CV, CVL, or Muse ship in the same fleet: increases this ship's EVA... **and increases
    your Vanguard's AA**..." — the Vanguard-AA clause is past the "if"'s own colon, so it's
    correctly read as a plain effect, not a condition, and stays matched). Requiring the
    colon immediately after the match is what avoids misreading a genuine target reached
    via a comma instead ("...if there are 2 or more Tempesta ships afloat in this fleet,
    this HP recovery effect will also apply to **your Vanguard ship with the lowest
    current HP**", Ganj-i-Sawai — no colon right after the match, so this guard correctly
    doesn't fire).
22. `commaSelfOnlyEffectFollows()` — same idea as #21 but for the comma-separated variant
    of the same pattern (Acasta's "Death Raid": "if this ship is the only ship remaining
    in your Vanguard (The ship that sinks does not have to be in the Vanguard), **increase
    this ship's** damage dealt..."). Acasta's own clarifying aside repeats "Vanguard" a
    SECOND time inside the parenthetical itself, past the point where `SOLO_FLEET_BEFORE_RE`
    (the before-match solo-fleet check, added the same round to catch "is the only ship
    remaining in" — the reverse phrasing of the pre-existing `SOLO_FLEET_CUE_RE`, which
    only caught "consists/comprised ... only") already excludes the first occurrence — so
    this guard checks EVERY occurrence, accepting an optional `(...)` aside or a lone
    trailing `)` (when the match itself sits inside the parenthetical) before the comma
    and the self-only verb.
23. `otherNationImmediatelyBefore()` only caught a nation DIRECTLY glued to the role/hull
    word ("Dragon Empery Main Fleet ships") — real text almost always has connector words
    in between ("Northern Parliament and Dragon Empery **ships in the** Vanguard Fleet",
    Chang Chun), which the strict adjacency check missed entirely, letting Chang Chun's
    compound-nation buff match every candidate regardless of nation. New
    `compoundNationListExcludes()` captures the whole nation list ending right before the
    match (allowing a hull noun + "in"/"of" + "the"/"your" in between) and only excludes
    candidates whose own nation isn't among the names actually listed — so Dragon Empery
    and Northern Parliament ships still correctly match Chang Chun, every other nation
    doesn't. Had to add `NATION_LIST_TRIGGER_PREFIX_RE` as a guard on the guard: a nation
    name before "ship(s) in your Vanguard" doesn't always mean the buff is FOR that
    nation — "when this ship **or a Sardegna Empire ship** in your Vanguard falls below
    30% max HP..." (Alfredo Oriani's "Paparazza's Retreat") names who can TRIGGER a
    smokescreen that then benefits "all your ships in it", unrestricted by nation; reached
    through "when/if/once/whenever/or a/another/per" it's a trigger-condition, not a
    beneficiary list, so `compoundNationListExcludes` backs off in that case.
24. `FLEET_LEADER_SLOT_RE` — "Vanguard Fleet Leader (First Slot)" (Bilibili's 22/33 pair)
    names a SLOT position, not a ship category; their buff is explicitly scoped "for both
    22 and 33" by name, never general. Checked as literal "Fleet Leader" text immediately
    following a role-category match.

**At this point** `Admiral Hipper META`, `Arizona META`, and `Baltimore μ` still matched
2B, each via a genuine — if heavily-gated — clause (Baltimore μ: "increases your
Vanguard's AA by 5%" once a CV/CVL/Muse ship is present; Admiral Hipper META: shields
"your frontmost Vanguard ship" when she isn't it herself). This was reported back to the
user as an open philosophy question rather than silently decided — see the next section,
where the user explicitly answered it.

### Interaction's "conditions assumed met" philosophy reversed (2026-08-18)

Asked directly (via `AskUserQuestion`) whether conditionally-gated buffs like Baltimore
μ's and Admiral Zenker's should stay (matching Effective Stats' existing "conditions
assumed met" stance) or be excluded, the user chose **exclude entirely** — a genuine
interaction now requires the buff to be guaranteed simply by the candidate ship's own
nation/hull/role membership, not additionally dependent on some other ship type being
present, a specific slot assignment, or a headcount threshold. This is a **stricter
standard than Effective Stats still uses** — don't backport it there without being asked;
the user's answer was scoped to Interaction specifically. (Side note from the same
answer: "Flagship" in this game means the fleet's leader — the centrally-positioned ship
of the "Main" group — not a generic "Main Fleet ship"; worth remembering if a future
guard needs to reason about fleet-leader mechanics again.)

Three new pieces, all in `isGenuineAllyMatch`'s hull/role/nation branch:

25. `structurallyGatedMatch()` / `STRUCTURAL_GATE_RE` (reuses the existing
    `IF_CONDITION_PREFIX_RE`, now broadened to also accept `"if this ship has"` for
    status checks like Collett's "if this ship has the highest AA amongst your
    Vanguard") — excludes a match reached through an "if there is/are..." (compositional
    presence/headcount) or "if this ship is/has..." (slot/status) condition, **regardless
    of whether the effect clause is self-only or genuinely fleet-wide** — a strictly
    broader net than `selfOnlyConditionedEffect` (guard #21), which only fired when the
    effect turned out to be self-only. Scoped to the whole SENTENCE via a new
    `sentenceBefore()` (bounded by the nearest preceding period, not colon like
    `clauseBefore`) since this dataset chains multiple colon-separated effect clauses
    under one earlier "if" — Baltimore μ's "if there is a CV, CVL, or Muse ship in the
    same fleet: increases this ship's EVA... **and increases your Vanguard's AA**..." has
    the match past a SECOND colon, still governed by the first "if". Action-triggers
    ("when this ship fires her Main Guns", "every 20s") are deliberately NOT treated as
    gates — they eventually fire regardless of team composition, so buffs reached that
    way (Andrea Doria META, Centaur's "Airspace Dominance") still match.
26. `SORTIED_WITH_GATE_RE` — "(while/when/if) sortied with [a ship/equipment]..." is the
    same third-party dependency as "if there is a CV/CVL/Muse ship", just phrased as a
    partner requirement (Arizona META: "...while sortied with a ship that has the
    'Pearl's Tears' equipped: 50% chance to restore... to the ship in your Vanguard...").
    Checked in the same sentence-scoped `structurallyGatedMatch()`.
27. **Fixing this broke the base/+ pairing added for the Chapayev case** (see above) in a
    new, narrower way: when a "+" skill matches on its own and no independent base match
    exists to merge into, `computeInteractions` looks up the base skill and anchors the
    entry on it — but for Ganj-i-Sawai, the base skill's ONLY mention of "Vanguard" is
    itself a gated clause ("if there are 2 or more Tempesta ships afloat...this HP
    recovery effect will also apply to your Vanguard ship with the lowest HP") that fails
    guard #25 — so blindly anchoring on it would show that disqualified clause as the
    entry's default, non-toggled text, reintroducing exactly what guard #25 exists to
    keep out, one level removed through the pairing mechanism. Fixed with
    `isSafeBaseAnchor()`: a base skill is only used as the anchor if it EITHER doesn't
    mention the category term at all (Chapayev — safe, makes no claim of its own) OR
    mentions it AND independently passes `isGenuineAllyMatch` (`hasGenuineMatch()`) — if
    it mentions the term only through a disqualified clause, the entry falls back to
    anchoring on the "+" skill alone (the pre-existing standalone path, rendering as the
    static `.interaction-variant-badge` rather than a toggle, since there's nothing safe
    to toggle back to).

Net effect measured across all 888 ships: role-category matches dropped 147978 → 126661,
hull-category 36612 → 30908, nation-category 18489 → 12373 (a much larger cut than the
self-only-effect round, as expected — this removes every conditionally-gated genuine
target too, not just mislabeled self-only ones). Regression-checked against the
established "must stay matched" precedent set (Howe's and Z14's unconditional
frontmost-ship targeting, Centaur's action-triggered Main Fleet buff, Chang Chun still
matching Dragon Empery/Northern Parliament candidates specifically) — all still hold.

### Elided-subject condition gate, "CarabiniereFuoco di Copertura!+ je ne peux pas voir la version normale" (2026-08-19)

Carabiniere's "Fuoco di Copertura!+" showed up in Interaction (role category) as a bare
`.interaction-variant-badge` — no toggle, no way to see the un-augmented base skill. Root
cause wasn't a rendering bug: `computeInteractions` had already tried to anchor the entry
on the base skill "Fuoco di Copertura!" and correctly refused to (`isSafeBaseAnchor`,
guard #27) because the base's only mention of "Vanguard" is inside "if **this ship is**
placed in the backmost position of the Vanguard Fleet..." — a guard #25 structural gate
(`IF_CONDITION_PREFIX_RE`, requires the literal "this ship is/has"). The "+" version
describes the exact same condition but elides the subject — "if **placed** in the
backmost position of the Vanguard Fleet..." — so `IF_CONDITION_PREFIX_RE` didn't
recognize it as a gate at all, and the "+" text's otherwise-identical clause slipped
through ungated. Base correctly excluded, "+" incorrectly not: the inconsistency (not
"the toggle is missing") was the actual bug.

Fixed by adding `placed` as a third alternative to `IF_CONDITION_PREFIX_RE` (checked
dataset-wide first: only 2 occurrences of "if placed" without "this ship is" anywhere,
Carabiniere and Seattle's "Dual Nock" — Seattle's doesn't affect any current match since
its clause mentions "Escort Fleet", a role category this app doesn't track, so the fix is
effectively scoped to the one reported case while still being a general rule rather than
a name-keyed exception). This makes the "+" clause gated the same as the base, so
**the whole entry now disappears from Interaction** rather than gaining a working
toggle — consistent with the standing "conditions assumed met" reversal for Interaction
(a positional/conditional buff like this was never supposed to count as a genuine
interaction in the first place, toggle or not). Verified: 0 Carabiniere "Fuoco di
Copertura" entries remain anywhere in the dataset, and the established must-stay-matched
precedents (Z14/Howe, Centaur's Airspace Dominance) still hold; full 888-ship regression
still 0 errors.

### Multi-sentence list continuation is NOT auto-detected — narrow per-skill fix only, "Ulrich von Huttenil manque un -" (2026-08-19)

A skill's colon-introduced list of effects is normally semicolon-separated within one
sentence ("...: increases X; decreases Y."), which `buildClauseBlock` already turns into
separate bullets. Ulrich von Hutten's "Revolutionary's Prosaic" instead writes each item
as its own full sentence — "...this sortie: Decrease damage taken by all Iron Blood
ships in that fleet by 5.0%. Increase the Crit DMG Dealt for all Iron Blood ships in
that fleet by 10.0%." — and since `buildSentenceBlocks` splits the whole description
into independent sentences before block-building ever sees them, the second sentence has
no colon of its own and falls through to a plain, unbulleted paragraph instead of a
second "–" bullet under the first condition.

**A general "a subjectless sentence continues the previous list" rule was tried and
rejected before writing anything skill-specific** — checked against the whole dataset
(not just the reported case): 242 `{header, items}` blocks are immediately followed by a
plain-text block, and even after narrowing to "next sentence has no subordinate-clause
cue and no explicit subject" it's still 65 candidates, most of which are ordinary
independent statements that merely happen to also open with a bare imperative verb
(that's just how this dataset writes effects generally, conditional or not — not a
continuation signal). Tightening further to "shares a repeated trailing noun phrase with
the prior item" (the closest genuine signal in Ulrich's case — both items end "...ships
in that fleet by N%") still isn't safe: it found exactly 2 matches, and the second,
Vanguard's "Scatter, Minions of Darkness!", would have been merged WRONGLY — its "next"
sentence ("30s after that battle starts: Fire a special barrage...") actually opens its
own distinct condition that a blanket rule has no way to distinguish from a true
continuation. Asked the user directly rather than guessing which failure mode was more
acceptable; the answer was to fix only the reported skill.

Implemented as `mergeUlrichProsaicListSentence()` (`app.js`, called at the end of
`buildSentenceBlocks`), keyed on this skill's exact header string
(`"As long as this ship is afloat, whenever ANOTHER fleet engages in one of its first
five battles this sortie:"`) rather than ship/skill name — self-scoping since no other
skill in the dataset can plausibly carry the same sentence verbatim, and it reads as a
general (if narrow) rule rather than a hidden per-ship branch. Verified: Ulrich von
Hutten's skill now renders both bullets under the shared condition; Vanguard's
"Scatter, Minions of Darkness!" block structure is byte-identical to before (dumped and
compared); full 888-ship regression still 0 errors. **If another skill turns out to have
the same multi-sentence-list shape, don't extend the general heuristic — verify the new
case the same way (dump its exact block structure, check for a safe distinguishing
signal) and add another narrowly-keyed merge, or ask again if none is safe.**

### Interaction pagination (2026-08-18)

Even after the stricter conditional-gating exclusion above, a common category like "By
Fleet Role" can still legitimately run into the hundreds for a Vanguard CL (2B: 186) —
`computeInteractions` used to hard-cap `results[category]` at 100 (silently dropping the
rest, with a "X shown of Y" label as the only clue), which the user asked to replace with
real pagination instead. The cap is gone — `results[category]` now always holds every
genuine match — and `renderModalInteraction` paginates client-side:
`INTERACTION_PAGE_SIZE = 20`, a `‹ Prev / Page N of M / Next ›` footer
(`.interaction-pager`) appears per category only when it has more than one page, and only
the current page's slice gets built into DOM nodes (`buildInteractionItem()`, extracted
out of the old inline entry-building loop so both the initial render and page-change
re-renders can call it) — a ship with hundreds of role matches doesn't pay for hundreds
of `.interaction-item` DOM nodes up front. Page state is a plain local variable closed
over per category (`let page = 0` inside the `for (const cat of categories)` loop, not
a module-level Map), so it naturally resets every time `openModal` re-runs
`renderModalInteraction` for a (possibly different) ship — no explicit reset code needed,
and no stale page number carries over between ships.

Removing the cap also removes the old totals-vs-shown distinction entirely — every entry
`computeInteractions` counts, it now also returns, so `totals` is unused by
`renderModalInteraction` (still returned by `computeInteractions` itself, just not
destructured there anymore).

### Full-dataset audit methodology (2026-08-17)

The user asked to have every skill read and classified as ally-affecting or self-only
rather than continuing to fix examples one at a time. Reading ~2700 skills individually
isn't feasible in conversation, so instead: a standalone Node script
(`audit_interactions.js`, scratchpad-only, not in this repo) re-implements
`computeInteractions`'s matching + guard logic against `ships.json` directly (no DOM), runs
it for all 888 ships, and dedupes by `(sourceShip, skillName, category, matchedText)` —
collapsing ~888×skills into ~1200-1700 distinct combos, since the same skill/category/
matched-text triple repeats across every candidate ship sharing that nation/hull/role. A
second script (`audit_flag.js`) extracts the actual clause around each match and flags
ones that read as self-only (a self-completion verb phrase like "increases this ship's X"
with no ally-language anywhere in the same clause) for manual review — this narrowed ~1700
combos down to ~170, then to 28, then to 11, then to 5 after each round of fixes, with the
final 5 confirmed as correct matches (the flagging heuristic's own blind spots, not real
bugs — e.g. it didn't recognize "in the same fleet" or "sortied with" as ally language).
**If asked to redo or extend this audit**: recreate both scripts in scratchpad (they're
intentionally not committed — same convention as the earlier `extract_*.js` data scripts),
keep the guard logic in the audit script byte-for-byte in sync with `isGenuineAllyMatch` in
app.js (copy-paste, don't try to `require()` app.js since it expects a DOM), and re-run
after every fix to check for regressions, not just the specific case being fixed.

**If the user gives another counter-example**, the working method has been: pull the exact
ship + skill text with a quick `node -e` query against `data/ships.json`, read the full
sentence (the user has stressed this explicitly — "relis bien le sens complet des phrases
avant de faire des liens"), identify the general pattern (not just that one sentence), add
a guard, then verify with a headless-browser test against both the reported false positive
AND a handful of known-good matches to confirm nothing legitimate got excluded.

## Testing workflow used throughout this project

No test framework — verification is done via headless Edge:

```bash
node --check app.js   # syntax check first, always

# Inject a test script into a full copy of index.html (NOT a truncated slice — app.js
# references #search/#grid/etc. at top-level and throws if they're missing, which
# silently aborts the whole script before reaching later declarations)
node -e "
const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('</body>', '<script src=\"_test_inject.js\"></script></body>');
fs.writeFileSync('_test_final.html', html);
"

# _test_inject.js writes its results into a <pre id="out"> it appends to the page (avoid
# template-literal/backtick escaping through nested shell+node quoting — use the Write
# tool for the injected script file, not an inline node -e heredoc)

# --screenshot is the ONLY way to read a result back on this machine: --dump-dom writes
# nothing at all on this Edge build (150.0.4078 — even --version prints nothing, whether
# run from Bash, from PowerShell, or through Start-Process -RedirectStandardOutput). So
# the injected script styles #out as a full-screen monospace overlay, and the PNG is read
# with the Read tool. Same command for a real visual check, minus the overlay.
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --no-sandbox --virtual-time-budget=60000 --window-size=1250,420 \
  --screenshot=out.png \
  "file:///C:/Users/sasp/Documents/DEV/AzurCalc/_test_final.html"
```

### Editing files with a Node patch script — the one trap

Edits here are usually applied by a small scratchpad Node script doing
`src.replace(anchorText, newText)`, because the shell mangles backslashes in heredocs.
**Always pass the replacement as a function** — `src.replace(f, () => to)` — never as a
plain string. In string form, `$` followed by a backtick, `&`, `'` or a digit is a
substitution token: `$` + backtick means "insert everything before the match". A CLAUDE.md
entry that spelled out the regex `^\d+$` in prose (a `$` immediately before a closing
backtick, twice) silently injected two full copies of the document's 75 000-character
prefix, tripling the file. It was only caught because a later anchor stopped being unique.
The same trap applies to any prose containing a regex, a shell variable or a price.

**Always delete `_test_*`, `_dump*.html`, `_test_visual*.png` after each round** — they're
scratch files, not part of the app. (Path note: from Git Bash, `pwd` gives `/c/Users/...`
which is NOT a valid `file://` URL directly — build the URL as
`file:///C:/Users/sasp/Documents/DEV/AzurCalc/...` explicitly instead of interpolating
`$(pwd)`.)

## Full-codebase cleanup pass (2026-08-19)

The user asked for a review of the whole codebase (app.js/style.css/index.html) to
optimize, trim unnecessary comments, and remove unused/redundant elements — not a new
feature, general maintenance. Method: read every file in full, then verified every
removal candidate mechanically before touching it (a `node -e` script cross-referencing
every CSS class in `style.css` against literal-string usage in `index.html`/`app.js`,
another cross-referencing every `getElementById` id both directions, another counting
occurrences of every top-level `function`/`const` name) rather than removing anything on
a visual hunch — this codebase has had enough iteration (level control, stats grid,
nation banner alone went through 3 designs) that "looks unused" and "is unused" aren't
reliably the same thing without checking.

**Found and fixed** (all confirmed dead by the cross-reference, not guessed):
- `.modal-subtitle` — CSS rule with zero matching element anywhere (leftover from a
  design predating the current tags row).
- `class="modal-stats-section"`, `class="modal-skills-section"` (reused verbatim on the
  Skills/Barrages/Interaction section divs), `class="modal-barrages-list"` — all present
  in `index.html` but had never had a single CSS rule; sections are id-scoped in JS
  anyway (`document.getElementById(...)`), so these classes did nothing. Removed the
  class attributes, kept the ids.
- `<span class="beta-mark">β</span>` — the class's own CSS rule was already removed in
  an earlier session (see the title-case fix note in the level-control section above)
  but the now-inert wrapper span was left in the HTML; unwrapped to plain `β` text.
- `.card` was declared twice (a full rule at the top of the card-grid section, plus a
  stray `.card { cursor: pointer; }` much further down) — merged the single declaration
  into the first block.
- `.card .rarity-strip`'s `background: var(--rarity-color, var(--border))` referenced a
  custom property (`--rarity-color`) that is never actually set anywhere in CSS or JS —
  `render()` always overrides it via `strip.style.background` (an inline style, which
  always wins), so the `var(...)` was dead weight giving a false impression that
  something sets it. Replaced with a plain `var(--border)` fallback.
- Double blank lines around `.augment-checkbox[hidden]`/`.fatesim-checkbox[hidden]`
  (stray formatting from past edits) — tidied.
- `.retrofit-checkbox`/`.augment-checkbox`/`.fatesim-checkbox` were three near-identical
  ~12-line blocks differing only in border/text color — consolidated the shared layout
  properties into one combined selector, leaving only the 2-line color override per
  class (and did the same for their `[hidden]` rules). Verified pixel-identical
  computed styles before/after via screenshot (Karlsruhe, Retrofit toggle checked).

**Comments**: most of this codebase's comments are already exactly the kind this project
wants — a non-obvious WHY tied to a specific guard or historical bug, not a restatement
of the code (per CLAUDE.md's own established convention, built up over many sessions).
The genuine cleanup opportunity was a handful of comment blocks that had drifted into
changelog narration — quoting the user's exact French request, a date, and the blow-by-
blow of a feedback thread that CLAUDE.md already records in full. Trimmed these down to
just the non-obvious technical WHY (STAT_GRID's shape, NATION_COLORS'/STAT_COLOR_GROUPS'/
FACTION_LOGO_CODE's sourcing, the level control's rationale, the boosted-cell
base+delta(real) format) — CLAUDE.md remains the authoritative full history, so nothing
was actually lost, just de-duplicated. Did NOT touch the dense guard-rationale comments
throughout `isGenuineAllyMatch` and friends (the `ENEMY_TARGET_CUE_RE` family, the
structurally-gated-match logic, etc.) — those cite specific ships/skill text as concrete
regression-test cases for each regex, which is exactly the load-bearing kind of comment
this project depends on; shortening those would make the next guard-related bug harder
to diagnose, not easier.

**Dead code**: none found. Every top-level `function`/`const` in `app.js` is referenced
at least once beyond its own declaration (checked mechanically, not by inspection alone)
— this codebase doesn't have leftover dead functions from past iterations, likely
because each redesign this session already removed its own superseded code inline
(e.g. the old Base/Real stats table, the ribbon-banner CSS, `--modal-nation-color`'s
solid-fill usage) rather than leaving it behind.

**Not touched, considered and rejected**: `makeChip`/`makeMultiChip` and
`makeChip`/`makeHullChip`/`makeCategoryLabel` share a similar "toggle a Set, toggle an
`active` class, re-render" shape, but each has different DOM structure or side effects
(icon+label vs plain text; `syncSubfactionButton()` only for nation chips) — merging
them would trade a small line-count reduction for added conditional branching in
already-tested, working code, which isn't a good trade. Left as three similar functions
rather than one over-parameterized one.

Verified throughout with the project's standard headless-Edge regression (open/close all
888 ships, 0 errors) plus targeted screenshots after each structural change, not just
after the final edit.

## Unresolved / explicitly deferred

- **Equipment-aware stats — IN PROGRESS, catalog extraction done (2026-08-20)**. End goal,
  stated directly by the user: a panel to the right of the Equipment section showing
  potential HP / DPS / AA DPS / ASW DPS, a selector capping the max equipment RARITY
  considered, and an "Optimize" button that auto-picks, per slot, whichever equipment
  (at or below that rarity cap) maximizes that slot's relevant raw stat — Main
  Gun/Torpedo slots for DPS, AA Gun for AA DPS, ASW gear for ASW DPS. This is a
  per-slot greedy pick, not a multi-objective tradeoff, since each slot's choice only
  affects its own metric.

  Investigated first whether DPS/eHP could be approximated WITHOUT a gear catalog
  (barrage `trigger` field, a generic "eHP" formula) — both dead ends: `trigger` holds a
  qualifier ("enhanced"/"on main gun fire"), never a firing interval, and 2280/2502
  barrage rows have no trigger at all (tied to the equipped Main Gun's own reload,
  which is exactly the missing data); the wiki's own eHP formula needs the ATTACKING
  enemy's Accuracy/Luck, which this app has no source for. Asked the user directly
  rather than guessing either — chose to build the real equipment catalog first,
  matching what was already flagged here as the acknowledged next major piece of work.

  **Catalog built**: `data/equipment.json`, 581 records across 15 categories (DD/CL/CA/
  CB/BB Guns, Torpedoes, Submarine Torpedoes, AA Guns, AA Time Fuze Guns, Fighters,
  Seaplanes, Dive Bombers, Torpedo Bombers, ASW, Auxiliary), sourced from the wiki's own
  `List of X Guns`/`List of X` pages the user saved for this. Not committed to the repo
  yet — verify it renders correctly first (see remaining steps below) before assuming
  the schema is final.

  **Extraction method** (scripts are scratchpad-only, not committed — same convention as
  every other one-off data script in this project): each wiki equipment-list page has a
  MediaWiki "Tabber" widget with 4 panels — `#tabber-Min_Stats`, `#tabber-Max_Stats`,
  `#tabber-Max_Enhanced`, `#tabber-Max_Rarity` — confirmed by ID, not by DOM position
  (position happened to match this order too, but the ID is what the script actually
  reads). Compared the same gun's numbers across all 4 for "12-Pounder Long Guns T3":
  Min/Max Stats show every T0-T3 tier separately (coefficient 125% both, only Dmg/Rld
  differ — these are progression references, not "fully invested" states); Max_Enhanced
  and Max_Rarity each show only ONE row per gun FAMILY (the best tier), with
  Max_Enhanced's coefficient (148%) actually HIGHER than Max_Rarity's (125%, identical
  to Max Stats) for this item — i.e. **+13 enhancement, not rarity-conversion, is what
  actually reaches this gun's ceiling**, and that isn't true for every item, so the
  extractor keeps the row with the higher DPS/stat total between Max_Enhanced and
  Max_Rarity per item rather than assuming one tab is always better — the "always max
  investment" convention this project already uses everywhere else (Cost's limit-break
  assumption, skill max-level) applied to gear the same way.

  **`--dump-dom` actually works now** — contrary to the note in the Testing Workflow
  section below (written on an earlier Edge build/invocation), re-verified directly
  before use: a trivial page dumped its DOM to stdout correctly. This unlocked a much
  more reliable extraction path than screenshot+read for structured numeric data: the
  injected script writes the parsed table as JSON text into a hidden `<pre
  id="__json_out">`, `--dump-dom` captures it, and a small Node script regex-extracts
  and HTML-entity-decodes that one element rather than trying to OCR a screenshot of
  hundreds of rows. If dump-dom-based extraction is needed again, re-verify it still
  works the same way rather than trusting either claim blindly — Edge builds change.

  **Column layout is NOT the same across every "gun" category — caught by direct
  comparison, not assumed**: DD/CL guns have 21 data columns (rounds/sec present, Range
  splits into Fr/Sh); CA/CB guns have 20 (rounds/sec present, but Range is ONE value);
  BB guns have 19 (no rounds/sec column at all, Range is one value). Reusing the DD
  parser on BB rows silently shifted every trailing field by 1-2 positions — caught
  because the shifted-in DPS "heavy" value was a suspiciously round 200 for every BB
  gun and the "Angle" field contained ammo text ("HE 140/110/90") instead of a degree
  value. Fixed with three separate column-index parsers (`parseGunRow`/
  `parseCAGunRow`/`parseBBGunRow`); re-audited the whole 581-record catalog afterward
  for any other out-of-range DPS/reload/armor values (0 found) rather than trusting the
  fix looked right on the one sample checked.

  **Gear rarity resolved (2026-08-20)**. Asked the user whether to dig further into the
  Equipment page, have them confirm from memory, or work from a guessed hypothesis
  (Ultra Rare/Prototype) — they didn't recognize the question at all ("je ne sais pas de
  quoi tu me parles"), so it was reframed as a concrete, no-game-knowledge-needed ask:
  save one individual gear page, since those carry an explicit "Rarity" infobox row like
  ship pages do. The user instead saved something even better — the wiki's own **category
  listing pages**, one per named rarity: `Category_Common gear`, `Category_Rare gear`,
  `Category_Elite gear`, `Category_Super Rare gear`, `Category_Ultra Rare gear` (each a
  plain `<li>` list of page names/titles belonging to that rarity).

  Cross-referenced two independent ways rather than trusting either alone:
  1. Every gear icon in the `List of X` pages carries a numeric CSS class
     (`alibox rarity-N-bg rarity-N`, `N` 1-6, duplicated on the cell's own
     `data-sort-value`) with no color/name attached in the saved HTML (the actual color
     lives in an external stylesheet this project doesn't have a copy of). Joined each
     `(name, T-tier)` row from the `Max_Enhanced` panel against the 5 category pages by
     name; for names appearing in exactly one category, tallied which `rarity-N` value
     went with which category name. Landed a clean majority at N=3→Rare (164/192),
     4→Elite (144/206), 5→Super Rare (132/176), 6→Ultra Rare (104/104, zero noise). The
     minority noise on 3-5 is consistent with a handful of generic gun names (e.g. "Old
     Heavy Cannon") being reused across genuinely different items on the wiki, not a
     flaw in the join.
  2. Independently, the ASW and Auxiliary list pages (which use an explicit ★-count
     column instead of the T-tier icon system) ALSO carry the item's rarity as a literal
     inline `background`/`background-color` style on the same row — `powderblue`,
     `plum`, `palegoldenrod` (matching the Equipment page's own
     Common/Rare/Elite/Super-Rare color legend, already known from item 9's original
     extraction work) plus a `linear` (gradient) background found only on 6★ items.
     Tallied by exact color per star count: 3★=powderblue=Rare, 4★=plum=Elite,
     5★=palegoldenrod=Super Rare, 6★=linear-gradient=Ultra Rare — this needed no
     majority vote at all, every sample agreed, and it independently reproduces exactly
     the same 3/4/5/6→Rare/Elite/SuperRare/UltraRare mapping found method 1.

  `rarity` (one of `"Common"`/`"Rare"`/`"Elite"`/`"Super Rare"`/`"Ultra Rare"`) is now a
  field on all 581 `data/equipment.json` records — re-matched by the row's visible LINK
  TEXT rather than its `title=` attribute (the two differ for a handful of items, e.g.
  "550mm Triple Torpedo Launcher" vs title "...Torpedo Mount", "de Havilland Sea Hornet"
  vs title-cased "De Havilland...", and the catalog's own `name` field was always built
  from the link text in the first extraction pass — matching on `title` silently missed
  8/581 items on the first attempt, caught by checking the unmatched count wasn't zero
  rather than assuming a partial match was fine). 3 items ended up `"Common"` (guns with
  only a single, low tier available, e.g. "Twin 120mm (Model 1926)") — expected, not a
  bug: nothing stops a family's single/best tier from being a low one.
  `data/equipment.js` (`const EQUIPMENT_DATA = [...]`) was generated from the JSON the
  same way `ships.js` mirrors `ships.json`, and `index.html` now loads it right after
  `ships.js`.

  **Catalog linked to ship slots (2026-08-20)**. `EQUIPMENT_TYPE_CODE_CATEGORIES`
  (app.js, right after `GUN_TYPE_CODES`) maps each numeric slot-type code from
  `EQUIPMENT_TYPE_NAMES` to the matching `category` string(s) in the catalog — built by
  hand since the two vocabularies are worded differently on purpose ("DD Main Guns" vs
  "DD Gun"). `equipmentOptionsForSlot(slot)` returns the catalog subset a given
  `ship.equipment[slot]` can mount, unioned across every type code the slot accepts.
  Two codes are deliberately left unmapped rather than guessed: 18 (Cargo — no catalog
  category exists, `List of Cargo` was saved but never extracted since it isn't combat
  gear) and 20 (Missiles — the user expected these to live inside the Torpedo catalog
  category ("les missiles sont dans les torpedoes"), but the catalog's Torpedo category
  was built from `List of Torpedoes` alone and hasn't actually been checked for missile
  entries yet). Verified against New Jersey (BB Main Gun slot → 51 BB Gun options
  spanning Rare through Ultra Rare; AA slot, type codes [6,21] → 68 options merging the
  AA Gun and AA Time Fuze Gun catalog categories correctly) and a submarine (Albacore —
  her slot 3 deck gun resolves through type code 1, DD Gun, matching the "subs use a DD
  gun as their surface deck gun" note already on `EQUIPMENT_SHORT_NAMES`). Full 888-ship
  open/close regression still 0 errors with `equipment.js` now loaded.

  **Picker UI built (2026-08-20)**. Each of the 5 real gear tiles (not the Augment
  socket — no augment catalog exists) is now clickable when its slot has at least one
  catalog option. `buildEquipmentSlot()` takes an optional `gearCtx`
  (`{ship, slotKey, slot, options}`); clicking the tile calls `toggleEquipmentPicker()`,
  which lazily builds a `.equip-picker` dropdown anchored under that one card (same
  "one popup per trigger, closed by a document-level outside-click listener" shape the
  nation-chip subfaction dropdown already used — reused the pattern rather than adding a
  second one) and caches it on the card so re-opening the same tile within one modal
  view doesn't rebuild a possibly-165-row list twice. `sortEquipmentOptions()` orders
  the list best-first: rarity descending, then `equipmentPrimaryStat()` (whichever
  dps-shaped number that category actually has —`dps.raw`, `aaDps`, `aswDps`, or the
  first flat `statBonus` entry for Auxiliary — falling back through in that order) also
  descending — the same ordering the eventual Optimize button will just take the top of.
  Picking an item calls `setEquippedGear(ship, slotKey, item)` (a plain
  `{ship.id: {slotKey: item}}` in-memory map, `equippedGear` — not persisted, same
  lifetime as `currentLevel`) and repaints only that one tile (`paintTile()`), not a
  full section rebuild, so other slots' open pickers or picks survive. A tile with a
  pick shows the item's own name text in its rarity color (no gear icon assets exist in
  this project, so it's text-on-a-tinted-tile, the same "no image, use color+text"
  fallback already used throughout — nation logos aside, this app has never had gear
  art) via `equipmentRarityColor()`, which resolves through the SAME `RARITY_CLASS` /
  `--rarity-*` custom properties a ship's own rarity tag already uses (`"Common"` reuses
  `"Normal"`'s slot — equipment has no separate palette). Verified: full 888-ship
  open/close regression with the picker actually exercised on every ship's first gear
  slot (open → pick top row → confirm equipped → still 0 errors); targeted New Jersey
  check confirms 51 sorted BB Gun options, picking updates the tile and
  `getEquippedGear`, the Unequip row clears it back to the empty "+" tile, and an
  outside click closes an open picker without picking anything.

  **Gear artwork replaced the text tiles/rows (2026-08-20)**, on direct request ("utiliser
  les images de chaque équipement au lieu des textes. Quand on clique sur un équipement,
  qu'on ai pleins de petites images pour choisir"). The note just above ("no gear icon
  assets exist in this project") is no longer true: the saved wiki `List of X` pages each
  carry an **Icon column** whose `<img>` is the item's real 128px game art, which the
  original catalog extraction simply never looked at.

  `assets/equipment-icons/{id}.png`, 581 files, named by the catalog record's own `id` so
  `app.js` derives the path with no extra data field (`equipmentIconImg()`). Extracted by
  a scratchpad script (not committed, same convention as every other data script here)
  that walks **every** tabber panel of each list page — not just `Max_Enhanced` — and
  indexes rows by `(category, link text, tier)`, taking the largest saved size per key
  (`srcset`'s 2x, 120px for gun-style pages / 100px for the ASW+Auxiliary ★-column ones).
  Matched **581/581 exactly**, with the "same family, any tier" fallback the script also
  implements never once being needed — worth knowing if the catalog grows: an exact
  (name, tier) hit is the normal path, not a lucky one. Joined on the row's **link text**,
  not its `title=` attribute, for the same reason the rarity join was (see above — the two
  differ on ~8 items and `name` was built from the link text).
  13 files are byte-identical duplicates: a real-life gun listed under two categories
  (e.g. "Single 102mm QF Mk V" as both a DD Gun and an AA Gun) legitimately shares art.
  One icon is non-square (`auxiliary-angel-s-feather.png`, 100×117) — `object-fit: contain`
  handles it, don't "fix" the source.

  **The picker is now a grid of icon cells** (`.equip-picker-list` went `flex column` →
  `grid`, `repeat(auto-fill, minmax(40px, 1fr))`, ~6 columns in a 19rem panel) instead of
  a list of name+stat rows; the slot tile holds the picked item's art instead of its name.
  Name/rarity/headline stat moved into the `title` tooltip (`equipmentTooltip()`), the same
  "detail goes in the title, not on the card" rule the rest of this section follows. Since
  a dense grid of unlabelled icons is hard to scan on tooltip delay alone, a
  `.equip-picker-caption` pinned to the panel's bottom (`position: sticky`) names whatever
  cell is hovered or focused. Options are still `sortEquipmentOptions()`-ordered, so the
  rarity-tinted cells also read as bands of descending rarity. `.equip-tile-name`,
  `.equip-picker-row/-name/-stat` are gone (verified zero remaining references before
  deleting, per this project's cleanup convention); `equipmentIconImg()`'s `error` handler
  still swaps in the old text tile, so a future catalog entry without art degrades rather
  than showing a broken-image box.

  **`clampPickerToSection()` — the panel needed real positioning, and one measurement
  wasn't enough.** The panel is centred on its own 7rem card but is 19rem wide, so opened
  from the leftmost slot it hung ~96px outside the Equipment row and was clipped by
  `.modal-info`'s overflow (visible in the first screenshot as a half-cut caption; the
  old 15rem text list overhung less and got away with it). It now measures itself against
  `#modal-equipment` and nudges back inside with a `marginLeft` shift, leaving the CSS
  centring as the default and only correcting the edge cases. The first pass lands ~4px
  short — the panel's own scrollbar hasn't settled when `getBoundingClientRect()` runs —
  so it schedules one `requestAnimationFrame` correction that **accumulates onto the
  current margin** rather than recomputing from zero, which is what makes the second pass
  a no-op once the panel is already inside (guarded by `panel.isConnected`, since an
  outside click can remove it before the frame fires). Verified by measurement, not by
  eye: all 5 of New Jersey's slots report their panel fully within the section's bounds
  after the correction (slot 0 converging 92px → 96px, slots 1-4 needing 0).

  Verified: full 888-ship regression exercising open → pick → unequip on each ship's first
  gear slot — 861 pickers opened, 861 tiles filled with an `<img>`, 861 unequips returning
  the tile to empty, 0 leftover open pickers, 0 errors (the 27 ships with no picker are the
  hand-imported `wiki-*` ones, whose `equipment` is `null`); and a separate probe loading
  all 581 icon files in-page — **581 loaded, 0 failed**.

  **DPS formula re-read closely (2026-08-20) — CLAUDE.md's own earlier summary of it was
  wrong, caught before writing any code.** The `ReloadTime` line quoted just above this
  paragraph (still left as-is, to show exactly what was wrong) drops a **square root**
  that's actually in the wiki's MathML:
  `ReloadTime = WeaponReloadTime × √(200/(CurrentReload+100)) + VolleyTime +
  AbsoluteCooldown` — a flat, non-square-rooted `200/(CurrentReload+100)` (as the earlier
  note had it) would under-reload every ship at any Reload stat above the 100 baseline,
  silently inflating every DPS number. Re-derived straight from the page's raw `<math>`
  source rather than trusting the earlier prose summary, same "don't eyeball a formula,
  check the markup" instinct as the Cost formula bug earlier this file.

  Two things this needs that the wiki does NOT provide cleanly, found while reading the
  page fully rather than stopping at the first formula that looked usable:
  - **`AbsoluteCooldown`** (added on top of the reload time above) is, in the wiki's own
    words, "theorized to be based on the gun type, and not the gun itself" — no table of
    per-type values exists anywhere on this page for Guns/Torpedoes (only AA Guns get a
    stated value, 0.8667s — see the Anti-Air Guns section). Treating it as 0 for
    Guns/Torpedoes is an approximation this app would be silently making, not a verified
    number — needs to be disclosed as such if/when this ships, not presented as exact.
  - **Airstrike reload** (Fighters/Seaplanes/Torpedo Bombers/Dive Bombers) is a DIFFERENT
    formula entirely (`LaunchCooldown`, a count-weighted average across every plane
    equipped in the slot, `× 2.2 × √(200/(CurrentReload+100)) + 0.033`) — the
    Guns/Torpedoes `ReloadTime` formula above does not apply to aircraft at all, so a
    generic "one reload formula for every category" implementation would be wrong for
    3 of the 5 gear slots (Fighter/Seaplane share slots; Torpedo Bomber/Dive Bomber
    share the other). AA Guns and ASW each have their own sections too (Anti-Air Guns,
    Anti-Submarine Warfare — the latter points at the dedicated
    `Anti-Submarine Warfare - Azur Lane Wiki.htm` page already used elsewhere in this
    app) — genuinely 4-5 distinct reload/DPS formula shapes, not one formula with
    per-category constants.

  Given this — and that the app has no worked example to check a Guns/Torpedoes DPS
  number against beyond the one solo example already quoted above (which includes enemy-
  side/combat modifiers this app deliberately never models, per Effective Stats' existing
  "conditions assumed met, no target" convention) — this was intentionally NOT
  implemented yet rather than shipping a guessed `AbsoluteCooldown=0` as if it were exact.
  **Equipped gear now feeds the stats grid (2026-08-20)** — step 1's first half is done.
  `equippedGearFlatStats(ship)` sums the `statBonus` of everything equipped, and
  `computeEffectiveStats` folds it in **as a FlatStatBuff**, which is a specific position
  in the wiki's formula from the Damage Calculations page:

      CurrentScalingStat = [ (ShipBaseStat × CatStatMultiplier) + Σ FlatStatBuffs ]
                             × (1 + Σ StatPercentBuffs) + Σ SkillFlatBuffs

  Equipment is a FlatStatBuff, so it is added **before** the percentage and is itself
  amplified by skill buffs; the flat buffs the code already had are `SkillFlatBuffs`, a
  separate later term that is not. **The two positions are not interchangeable** — New
  Jersey at 125 with a Quadruple 305mm equipped comes out at FP 453 the right way round
  and 436 the wrong way, so this would have been a silent 17-point error.
  `CatStatMultiplier` stays 1: still no Meowfficer or Fleet Tech data.

  **The key names do not match between the two datasets** and this nearly shipped as a
  silent zero: `data/equipment.json` writes Anti-Air as `antiAir`, `STAT_GRID` as
  `antiair`. `EQUIPMENT_STAT_KEY_ALIASES` maps it; without it the 106 catalog entries
  carrying an AA bonus would have contributed nothing at all, with no error anywhere.
  `oxygen` (2 items) is deliberately left unmapped — the grid does not track Oxygen.
  If another stat is ever added to the grid, check the catalog's spelling for it first.

  Mounts do NOT multiply a stat bonus (they decide how many shells fire, not the stat),
  and efficiency multiplies damage, not the stat either — so each equipped item
  contributes its `statBonus` exactly once.

  A boosted cell's tooltip (`statBreakdownText`) now spells the terms out — base,
  equipment, skill %, skill flat, total — because one `+181` can now come from two
  sources that apply at different points in the formula.

  Verified: the formula re-derived by hand against the app's own numbers; the `antiAir`
  alias confirmed to land; unequipping restores the original value; and **9768 stat
  values across all 888 ships reproduce the pre-change formula exactly when nothing is
  equipped** (0 mismatches). The standard fingerprint changes in exactly two expected
  ways — modal HTML grows by the new `title` attributes, and the `eff` hashes move
  because the returned entries carry new fields — while base stats, costs, grid, filters,
  Interaction counts and the CSS sweep stay byte-identical.

  **Default (built-in) equipment, 2026-08-20** — the user supplied
  `Site web/User_ArdWar_DefaultEquips - Azur Lane Wiki.htm` with a standing instruction:
  **the DPS figure must fall back to a slot's built-in weapon when nothing is equipped.**
  An empty slot is not inert in this game; the ship still fires her fixed weapon.

  The mapping needed no guessing: `ship.equipment[slot].default` was already in the data
  as a numeric id, and the page's rows are keyed `fix-<id>`. `data/default-equipment.json`
  / `.js` hold the 49 items (14 guns, 6 torpedoes, 3 AA, 22 aircraft, 4 DC/Aux), reached
  through `DEFAULT_EQUIPMENT_BY_ID` / `defaultEquipmentForSlot(slot)`, with
  `activeEquipmentForSlot(ship, slotKey, slot)` as the "equipped, else built-in" accessor
  the DPS work should use.

  **Coverage: 2579 of the 2583 slots that declare a default (99.85%).** The 4 misses are
  all id 158 (Ganj-i-Sawai, Pearl, Queen Anne's Revenge, Sao Martinho) which that page
  simply never documented — they degrade to no default rather than to an invented one.

  Extraction notes, since the page is not uniform: it holds **5 tables with different
  column layouts**, so each has its own column map, verified by cell count and then
  spot-checked value-by-value against the raw rows for ids 100 and 106 before writing.
  101 rows collapse to 49 items because **13 ids repeat 4x each** (extra ordnance rows for
  one aircraft); the first row wins, and every repeated id happens to be one no ship
  actually uses, so nothing is lost.

  **Known gap the DPS work must handle**: the aircraft table has **no DPS column at all**,
  only Ordnance and reload. So the 346 aircraft slots need their damage derived rather
  than read, while guns (995 slots), AA (705) and torpedoes (533) all carry their own DPS
  figures directly.

  An empty tile marks itself under the "+", with the numbers in the tooltip - the label is
  what makes it visible that a slot is never really empty. It first showed the weapon's own
  name ("BB Gun #103") in small muted text; on request it now reads **"DEFAULT" in white**,
  bold and letter-spaced, because the muted name was hard to read and said less. Which
  weapon it is stays in the tooltip, the same "detail goes in the title, not on the card"
  rule the rest of this section follows. It went through three passes in one thread: pinned
  under the "+" at the bottom edge, then centred beside it, then **replacing the "+"** and
  sized to fill the tile. Replacing it is the right end state - a slot with a built-in weapon
  is not empty, and the "+" is the invitation to fill a slot that is. 2579 tiles show DEFAULT,
  2724 show "+", and **0 show both**.

  **The size is measured, and the first measurement was taken wrong.** Target: the word spans
  ~90% of the tile. Measuring a `cloneNode` appended to `<body>` gave 1.26rem, which rendered
  at **86.1%** - because in `<body>` the span is inline, while in the tile it is a flex item,
  and flex items are blockified. Re-measured **on the real element in place**: 1.32rem, and
  every one of the 2579 labels lands at 90.2% of its tile, none clipped, none off-centre.
  **Measure the element where it actually lives, not a copy of it somewhere else** - the same
  lesson as awaiting `document.fonts.ready` for the stats grid's widths.

  The column direction is safe for a filled tile too, checked rather than assumed: an equipped
  icon still measures the full tile minus its 1px border.

  **A Clear button sits to the right of Optimize** (same pill, neutral rather than accent,
  since it undoes work rather than proposing any). It clears **only the current ship** -
  `equippedGear` is keyed by ship, and wiping the map would throw away work done while
  comparing two of them. Verified: New Jersey's 5 optimised slots and 5 icons go to 0, the
  DEFAULT labels come back on her 3 weapon slots, the stats grid drops back to its bare
  value, and Ayanami's own 5 picks are untouched.
  Defaults deliberately do NOT touch the stats grid: the page carries no stat-bonus
  column, and built-in weapons grant none.

  Also supplied at the same time and **not yet used**: `Gear Lab`, `Equipment Drop Table`,
  `Research Academy` and `Shops` pages, presumably for where gear can be obtained.

  **The four combat figures and goal-driven optimisation, 2026-08-20** — done.
  `computeCombatMetrics` returns **DPS / eHP / DPS ASW / DPS AA`, rendered as four cards
  under the gear slots (`renderCombatMetrics`).

  **DPS.** Per slot: `baseDps x mounts x efficiency x (1 + ScalingStat/100)`, summed.
  The multiplier is the wiki's `WeaponStatMultiplier`; the scaling stat is FP for guns,
  TRP for torpedoes, AVI for aircraft, AA for AA guns, ASW for depth charges
  (`WEAPON_ROLES`). **The catalog figures are a stat-0 baseline, verified rather than
  assumed**: a gun's `dps.raw` reproduces exactly as `dmg x coef x roundsPerSec` with no
  stat term, so multiplying by the stat is not double counting.
  Empty slots contribute their **built-in weapon** via `activeEquipmentForSlot`, per the
  user's instruction - a bare New Jersey still reads 49 DPS, not 0.
  Where no `raw` exists the mean of light/medium/heavy stands in, so no target armour is
  silently assumed. `WeaponScalingCoefficient` is left at 1; the page gives 0.8 for some
  bombs and rockets, which the catalog does not distinguish, so aircraft run slightly
  optimistic.

  **eHP.** `HP / HitRate`, with the wiki's formula
  `HitRate = 0.1 + Hit/(Hit + Eva + 2) + (AttackerLuck - TargetLuck + LevelDiff)/1000`
  clamped to [0.1, 1]. **This is what used to be blocked**: the formula needs the
  SHOOTER's Accuracy and Luck, which this app has no source for. Rather than stay
  unimplemented it now uses a **named reference attacker** -
  `EHP_REFERENCE_ACCURACY = 100`, `EHP_REFERENCE_LUCK = 0`, level difference 0 - stated in
  the card's tooltip. The number is **comparative, not something the game would show**;
  changing the reference shifts every ship by roughly the same factor, so the ranking
  holds. Worth seeing why it earns its place: Ayanami turns 1313 HP into 3658 eHP (2.8x)
  while New Jersey turns 6860 into 9242 (1.35x) - exactly the evasion effect the user
  described.

  **Optimisation goals.** A "Goal" dropdown sits next to the rarity cap. Its options are
  derived from **what the ship's slots can actually hold**, not a hardcoded hull list, so
  each hull naturally gets its own set: BB -> firepower/anti-air, DD -> firepower/torpedo/
  anti-air/anti-sub, CVL -> aviation/anti-air, AR -> anti-air only; plus Recommended and
  Survivability everywhere.

  The user's two rules shape every weight: **survivability first, then AA** (so every
  goal keeps a real weight on health/evasion and a smaller one on anti-air, even a purely
  offensive one), and **amplify what already works rather than patch weaknesses, except
  survivability** - which is why "Recommended" picks its offensive weight from the ship's
  own strongest scaling stat (`recommendedWeights`).

  **Weapon slots are not affected by the goal** - a slot that shoots has one sensible
  answer, its biggest damage figure. **The goal decides the auxiliary slots**, which is
  what makes them optimisable at all: they were previously skipped precisely because
  "best" was undefined without knowing the player's intent. Auxiliary bonuses are scored
  as a share of the largest bonus available for that stat (`auxiliaryStatMaxima`), or a
  weight of 1 on Evasion could never outrank a weight of 0.1 on Health.

  **ASW is excluded unless the Anti-Sub goal is chosen**, per the user - covering both
  ASW equipment proper and any auxiliary whose bonus is ASW (`itemBoostsAsw`).

  **A load-order trap worth remembering**: `auxiliaryStatMaxima` was first written as a
  top-level IIFE reading `EQUIPMENT_STAT_KEY_ALIASES`, which is declared further down the
  file. That threw on the temporal dead zone **at script load**, which aborts the rest of
  app.js silently - every later `const` stays uninitialised and the first symptom is an
  unrelated "cannot access X before initialization" much later. It is lazy now. In a
  single-file script like this, never read a later `const` from top-level code.

  Verified: eHP and hit rate re-derived by hand for two ships and matching exactly; bare
  ships reporting non-zero DPS from built-ins; the goal list differing per hull across
  BB/DD/CVL/SS/AR; Anti-Sub yielding 2 Hedgehogs and 613 ASW DPS while Recommended yields
  0 of each; New Jersey's auxiliaries changing with the goal (Fire Control Table for
  firepower, Sail Components for survivability, AA Radar for anti-air - the BB case the
  user described); and **888 ships measured with 0 non-finite or negative results and
  0 errors**.

  **Layout, on request**: the four figures sit **to the right of the Augment socket**,
  built as a table in the same construction as `.stats-grid` (1px gaps over a
  border-coloured background) rather than as separate chips. `.equipment-and-metrics` is
  the flex row holding the slots and the table, mirroring `.stats-and-modifiers`.
  **Shape, settled over four passes - and the last two were both me guessing at "4 columns
  by 2 rows" instead of asking.** The wording fits three different layouts and I picked the
  wrong one twice before the user drew it:

      DPS  |  XXXX  |  DPS ASW  |  XXX
      EHP  |  XXXX  |  DPS AA   |  XXX

  Four columns **alternating name and value**, two figures per row - not four figures
  across with their names as a header row (pass 3), and not one merged name+value cell per
  figure (pass 2). Pass 1, label and value as two separate grid columns stacked 4 deep, was
  rejected for a different reason worth keeping: a value pinned to the far edge of its own
  cell leaves a stretch of empty space between the two, the exact readability complaint the
  stats grid already went through (item 3.7 above). **A layout described in words is worth
  one clarifying question - the sketch settled in one message what three passes did not.**

  The pairs are laid out **column-first** (`COMBAT_METRIC_FIELDS[column * ROWS + row]`), so
  DPS sits above eHP and DPS ASW above DPS AA - the two surface figures share a column and
  the two specialised ones share the next. The CSS is a plain 4-column row-flow grid; which
  figure lands where is decided by that index, not by grid flow. Names share one fixed
  width and values another, for the reason the stats grid's cells are fixed too: otherwise
  the table resizes per ship and the panel jumps when switching between them.

  Verified by geometry rather than by eye: two rows reading `DPS | 33 | DPS ASW | -` and
  `eHP | 1,761 | DPS AA | 48`, four distinct column lefts, 861 x 8 cells.

  **Sizing and vertical centring** (next message: "un peu plus grand et plus centre par
  rapport aux equipements"). Fonts went 0.62/0.8rem -> 0.72/0.98rem and padding 0.35/0.55rem
  -> 0.5/0.7rem; the table is 284x70.

  Centring took two goes, and the first one was subtly wrong: `align-self: center` centres
  the table against the whole **slot card**, which is half again as tall as the tile because
  it carries the slot's name and its mount/efficiency chips underneath. The table therefore
  sat ~28px below the squares it belongs to - visible, and exactly what the user came back
  on ("le centre du tableau doit etre au meme niveau que le centre des equipements").
  Fixed with `.combat-metrics-anchor`, a wrapper exactly one tile tall that centres the
  table inside itself; `--equip-tile-size` (7rem, on `.equipment-and-metrics`) drives both
  it and `.equip-slot`'s width, so the two cannot drift. A hardcoded offset would have
  worked today and broken the next time the table's font or padding changed.
  Verified by measurement: first tile, Augment circle and table all centre on 454.2px,
  where the whole equipment block centres on 482.4px.

  **"Il manque une stat pour l'ASW sans equipement" - the user was right, and I stopped
  looking one step too early.** The first answer was that DPS ASW is legitimately 0 because
  none of the 810 anti-submarine slots (405 ships) declares a built-in weapon, and the four
  depth charges the built-ins page documents (`DC #141`, `DC #147`, `Aux #468`, `DC #470`)
  are referenced by no slot at all - both facts true, and both checked. What I did not do
  was ask **why those four orphans exist**. The user pointed at the bottom of
  `Site web/Anti-Submarine Warfare - Azur Lane Wiki.htm`, which answers it outright:

  > DDs and CLs are equipped with a **default depth charge launcher**.
  > Destroyers: 15 range, 60 x 2 damage, base cooldown **6.32** seconds
  > Light cruisers: 15 range, 60 x 2 damage, base cooldown **6.99** seconds

  Those cooldowns identify two of the orphans exactly - `DC #141` is 6.32s and `DC #147` is
  6.98s, both at 60 damage - and their published DPS confirms the "x 2": 2 x 60 / 6.32 =
  18.99, which is the figure the table carries. **The launcher is intrinsic to the hull, not
  a slot**, which is precisely why no slot points at it and why looking only at
  `ship.equipment` could never find it. `INNATE_DEPTH_CHARGE_BY_HULL` keys it by
  `hullShort` (DD/CL), and `computeCombatMetrics` adds it **on top of** whatever is equipped,
  per the same page ("equipping depth charge auxiliary equipment ... will increase ASW damage
  output considerably").

  Result: **404 of 861 ships now report an ASW figure unequipped - every DD (241/241) and
  every CL (163/163)**, and no other hull, which is exactly what the page describes.
  Cross-checked by hand on Ayanami at 125 (ASW 120): 18.99 x 2.2 = **41.778**, matching the
  app to the digit - and the small gap against a from-scratch 2 x 60 / 6.32 x 2.2 = 41.772
  is the wiki's own rounding of its DPS column, not an error. Anti-Sub optimisation still
  stacks on top (41.8 -> 671.8). The two remaining orphans, `Aux #468` (US) and `DC #470`,
  still have no documented owner and are left alone.
  `hasAswSlot(ship)` now only explains the genuinely empty case: **Kursk and Tallinn**, the
  two CAs that carry an ASW slot but no innate launcher.

  **The lesson, since it has now bitten twice in this file:** an orphan record in a
  reference table is a question, not noise. Both times the data was already there and the
  mapping was written down somewhere I had not read to the end.

  **A figure a ship does not have is blank, not dashed** (on request: "ne mets pas de '-'
  mets simplement rien"). The cell keeps its fixed width, so the four columns still line up
  and the table stays one size for every ship - verified across all 888: a single table
  width, 0 em dashes left, and all 754 blank cells keep the tooltip that explains why they
  are blank, which is now the only affordance on them. `.combat-metric-empty` went with the
  dash rather than being left as a colour rule with nothing to colour.

  ### Equip restrictions: Time Fuze AA guns are BB/BC only (2026-08-20)

  The user asked whether per-item equip restrictions could be recovered ("certains
  equipement ne peuvent pas etre equipes a certains navires"). One is documented in a page
  this project already has, and the app was getting it wrong.

  **Damage Calculations page**: "Time Fuze AA Guns are special AA Guns **only equippable by
  Battleships and Battlecruisers**." `EQUIPMENT_TYPE_CODE_CATEGORIES` mapped code 6 to BOTH
  `AA Gun` and `AA Time Fuze Gun`, on the earlier reading that code 21 was a harmless
  duplicate of 6 - so **every** AA slot in the game was offered Time Fuze guns.

  Not cosmetic: the four Time Fuze guns are the **top four AA items by DPS** in the whole
  catalog (118 / 116.78 / 110.09 / 109.68, ahead of the best ordinary AA gun at 94.59), so
  Optimize was handing one to every destroyer, cruiser and carrier - 564 slots that cannot
  mount them.

  **The data already encoded the rule; nothing had to be guessed or keyed off a hull list.**
  Code 21 appears on **BB (105), BC (35) and BBV (2) slots and nowhere else** - exactly the
  page's "Battleships and Battlecruisers". So 6 grants ordinary AA guns, 21 grants Time
  Fuze ones, and a capital ship's slot carries both codes and gets both. The display name
  (`EQUIPMENT_TYPE_NAMES`) still collapses them to one "Anti-Air Guns", which is what the
  wiki's own slot label says - **the label and the permission are different questions, and
  conflating them is what caused this.**

  Verified: Time Fuze guns now reach 142 slots and no others; every other hull sees the
  same 64-item AA pool with 0 Time Fuze; Optimize gives Ayanami and Unicorn a Twin 57mm
  Bofors while New Jersey still gets a Time Fuze gun; and across all 888 ships, Optimize
  fills 4305 slots with **0 Time Fuze guns landing on a slot without code 21**, 0 errors.

  ### The 27 hand-imported ships have equipment now (2026-08-20)

  Reported as a gap: "j'ai des navires comme A2, 2B, 22 qui n'ont pas les equipements".
  These are the `wiki-*` ships (plus Surrey) that were never in the datamine, so their
  `equipment` was `null` and the whole section - slots, picker, Optimize, the four figures -
  simply did not exist for them.

  **Their own saved wiki pages carry a Gear table**, the same one `EQUIPMENT_TYPE_NAMES` was
  originally derived from: `Slot | Efficiency | Equippable | Max #`, e.g. A2's
  `1 | 100% -> 110% | CA Main Guns | 2`. A scratchpad script (not committed, same convention
  as every other data script here) parsed all 27, and the vocabulary came out clean - 9
  distinct "Equippable" strings, all already in the code's own name-to-code map. Three rows
  needed care: a slash means two codes (Cherbourg's "CA Main Guns / CB Main Guns", Duncan's
  "CL Main Guns / DD Main Guns"), and Max Immelmann's "(Dev.20)"/"(Dev.30)" marks a
  Development-level unlock this app does not model - kept, consistent with assuming max
  investment everywhere else. Efficiency and mounts take the right-hand side of the
  "a -> b" progression, the max-limit-break value, matching what the datamine stores.

  **Two things the wiki table does not give, handled differently:**
  - **The auxiliary slots**, which it never lists (already noted above). Taken from the
    hull's own majority across every datamined ship - measured, not assumed: the aux pair is
    98-100% identical within a hull (DD/CL `[10,14]`, CVL `[10,15]`, CA/CB/BB/BC/CV `[10]`).
    This is the one inferred part of the record.
  - **The built-in weapon ids**, which it has no column for at all. Left `null` rather than
    guessed, so these ships report **0 DPS with an empty loadout** where a datamined ship
    reports her built-ins. `hasBuiltInWeapons(ship)` swaps the metric tooltip to say so
    instead of repeating "empty slots count as the ship's built-in weapon", which would be
    a lie for exactly these 27. Their ASW figure does work, because the depth charge
    launcher is keyed by hull rather than by slot.

  Also inferred, from the rule established just above: an "Anti-Air Guns" slot gets code 21
  alongside 6 only on BB/BC/BBV - which here is Duncan and Valparaiso.

  Verified: **the Equipment section now renders for 888/888 ships** (was 861), 888 metrics
  tables at 7104 cells, one table width, 0 clipped, Optimize fills 4440 slots (up exactly
  135 = 27 x 5), 0 Time Fuze violations, 0 errors. A2 reproduces her wiki page exactly -
  Main Gun x2 at 110%, Secondary x1 at 70%, AA Gun x1 at 110%. And the write was diffed
  before committing: **the only lines removed from ships.json are the 27
  `"equipment": null,`** - every other field byte-identical.

  **Everything else about restrictions is not in this repo.** The `List of X` pages carry no
  restriction column (checked: their headers are Name/Image/Stars/stats/Notes, and 0 of the
  581 catalog records mention an equip restriction in `notes`), and `nation` on a catalog
  record is an origin tag, not a lock - 406 records carry one and nothing says it restricts
  anything. The wiki puts per-item restrictions in each item's **own page** infobox.

  ### Per-item "Used By", and the Gear Lab toggle (2026-08-20)

  The user then saved 144 individual equipment pages into `Site web/equipment/`, and each
  one answers the question outright: a `<table class="azltable eq-fits">` headed **"Used
  By"**, one row per hull with a tick, a cross, or a ○. So the Anti-Torpedo Bulge is
  crossed for Destroyer and every Submarine, which nothing in the slot type codes expresses -
  a destroyer's auxiliary slot accepts Auxiliaries, just not that one.

  **Parsing notes**: the hull's short code comes from the row's own link title
  ("Destroyer (DD)", "Sailing Frigate (Vanguard) (IXv)"), not from a hand-written name map -
  all 397 tables list the same 17 hulls, and every code matches a `hullShort` in the ship
  data once upper-cased. A page holds one table per tier and **none of the 144 differs
  between its tiers**, so the restriction is a property of the item family and `usedBy` is
  written to every catalog record sharing the name. All 144 page titles matched a catalog
  name exactly.

  **A ○ ("maybe") counts as allowed.** Those rows carry a tooltip naming the only ships
  that qualify - "(Little) Agir only" for Large Cruisers on a torpedo mount - and the slot's
  own type code already picks exactly those ships out: **the only BCs and CBs with a torpedo
  slot in the whole dataset are Odin, Scharnhorst META, Agir and Little Agir**, the wiki's
  own examples. Checked before deciding, rather than treating ○ as a third state the app
  would have to model.

  `equipmentAllowedOnHull` gates both the picker and Optimize, since this is a game rule
  rather than a preference. An item with no `usedBy` stays unrestricted - hiding gear on a
  guess would be worse than offering it. Verified: **422 037 option offers across every ship
  and slot, 67 186 of them from a record that has a Used By table, 0 violations.**

  **The Gear Lab toggle** (requested alongside): Gear Lab gear is crafted, not dropped, so a
  player who has not unlocked it wants it out of the optimiser's reach. `gearLab` starts from
  the **items the Gear Lab page lists in its "Upgrade to" column** - the "Upgrade from"
  column is ordinary drops and does not count. Matched by link text and case-insensitively,
  because the catalog's names come from the list pages' link text and a few differ from the
  page titles (the same trap as the rarity join). One result has no catalog record at all:
  **Twin 203mm (Mle 1924 Submarine-mount)**, a submarine deck gun no `List of X` page covers.

  **Corrected after the user asked what the flag actually meant** ("l'option gear lab ne
  concerne que les equipements uniquement obtenables par le gear lab") - it did not, and the
  answer was no. The flag was on all 280 crafted items, but **112 of those are also listed by
  the gear boxes, Shops, Research Academy or the campaign drop table**, so a player can own
  them without ever touching the Gear Lab; excluding them was wrong. `gearLab` now means
  **obtainable ONLY through the Gear Lab**: crafted, minus everything the other four sources
  list. **168 records**, down from 280.

  The difference is visible on one ship: New Jersey used to lose her Twin 410mm (Type 3
  Shell) when the toggle went off, even though that gun drops elsewhere. Now she keeps it,
  and only the two genuinely Gear-Lab-only picks change. **A flag named after a source must
  mean "only from that source" if it is used to exclude things** - anything obtainable two
  ways is not excluded by removing one of them.

  The button reuses `.max-level-toggle` verbatim - the app's existing "here is a toggle and
  its state" pill, gold with a filled dot when on - so it needed no new CSS beyond cancelling
  the class's `margin-left: auto` inside the tools row. It affects **Optimize only**, like
  the rarity cap; the picker still offers everything, because this is about what the player
  owns, not what the ship may mount. Verified after the correction below: a sweep of all 888
  ships fills 4440 slots either way, with **0 Gear-Lab-only picks** when the toggle is off,
  and 1538 slots changing between the two states.

  **What is still missing, and the useful way to count it.** 145 of 581 records have a Used
  By table, which sounds bad - but Optimize can only ever reach **23 distinct items** across
  every goal and every ship, and **20 of those 23 have no page saved**. That list, not the
  436, is what would actually change a result:

  - **Auxiliary**: 533mm Magnetic Torpedo, Admiralty Fire Control Table, Angel's Feather,
    Frontier Medal, High Performance Anti-Air Radar, Sail Components
  - **Torpedo**: 610mm Quadruple Torpedo Mount (Cruiser), SY-1A Missile
  - **Guns**: Twin 127mm (Type 5 Prototype) (DD), Triple 220mm (SM-40 Prototype) (CA),
    Triple 305mm (12"/50 Mk 8) (CB), Twin 410mm (Type 3 Shell) (BB),
    Twin 57mm Bofors (Mle 1951) (AA), Twin 127mm AA (Type 89 A1 Mod 2) (Time Fuze)
  - **Aircraft**: Lavochkin La-9 (Carrier-based Prototype), Fairey Spearfish (Prototype),
    Nakajima J5N Tenrai (Dive Bomber Prototype), Yokosuka Suisei Model 21
  - **Other**: Hedgehog (ASW), Improved Submarine-mounted G7e Acoustic Homing Torpedo

  The auxiliaries matter most: they are where a restriction actually bites, since a weapon
  slot's type code already does most of the gating.

  ### Obtainable vs unique gear, and skill-named preference (2026-08-20)

  Two rules from the user, both about what Optimize is allowed to reach for.

  **1. Obtainability.** Gear a player can actually go and get is whatever appears on the
  five sources named: gear boxes (`Equipment`), `Gear Lab`, `Research Academy`, `Shops`, and
  the campaign `Equipment Drop Table`. Collected by matching every link on those pages
  against the catalog on three independent cues - the link's `title`, its visible text, and
  the page name in its `href` - because a list page often renders an item as a bare icon
  with no text at all. A first pass that read only `title` found **1** item on the Gear Lab
  page instead of 328; the giveaway was a number too small to be plausible, not an error.
  Result: **429 of 581 names obtainable**, and the remaining **145 records carry
  `unique: true`** - event rewards and event-shop gear. They are overwhelmingly Auxiliary
  (104 of them), which is exactly where event gear lives.

  A unique item is **off the optimiser's table entirely unless a skill names it**.

  **2. Skill-named preference.** A few skills call out a specific piece of equipment:
  Jean Bart's "If this ship is equipped with the Quadruple 380mm (Mle 1935) gun...",
  Helena's "When this ship has an SG Radar equipped...". Scanning every skill for every
  catalog name finds **15 names across the dataset**, and every one reads as deliberate -
  no false positive to filter out. Optimize now ranks a named item above an unnamed one,
  ahead of any score.

  **Matched per ship, not globally** - the one judgement call here. Read globally, rule 1
  would hand Nelson's Pennant of Victory to any ship with a free auxiliary slot, since
  *some* skill names it. Read per ship, the two rules agree with the game: the ship whose
  skill names an item is exactly the ship meant to carry it. 6 of the 15 named items are
  unique, and each is named by its own ship (Nelson, Rikka Takarada, Namiko...).

  **Ranking is three keys in order**, replacing an inline chain of `continue`s with
  `betterCandidate`: weapon over non-weapon (a slot that can shoot is decided by damage,
  so a stat-only item may only win a slot where nothing else shoots), then named over
  unnamed, then score. The keys have to be ordered because the later ones are only
  comparable within the earlier - a damage figure and a stat-preference score are not on
  the same scale.

  `skillNamedEquipment(ship)` builds one alternation regex over all 581 names, longest
  first, and caches per ship id. Built lazily, for the load-order reason recorded above.

  Verified: the in-app index reproduces the offline scan exactly (15 names, same ships);
  Jean Bart takes the Quadruple 380mm, Gangut the Triple 305mm (Pattern 1907), Formidable
  the Fairey Albacore, Helena the SG Radar, and Nelson and Rikka Takarada their unique
  event items - while New Jersey, whose skills name nothing, is unchanged. Dataset-wide:
  4440 slots filled, 25 skill-named picks, 12 unique picks **all named by their own ship**,
  **0 unique picks that are not**, 0 hull violations across 421 505 option offers, and the
  Gear Lab toggle still holds on top of both rules. 0 errors.

  **Known and not addressed** (pre-dates this change): Optimize can fill two auxiliary
  slots with the same item - Helena ends up with two SG Radars - and some auxiliaries say
  "Effect does not stack" in their own notes. Worth raising before adding a no-duplicates
  rule, since duplicates are legal in game for most auxiliaries.

  The user kept adding equipment pages throughout: the `Used By` extraction went
  144 -> 179 -> **347 pages**, and **352 of 581 records** now carry a restriction. It is
  re-runnable; run it again when more arrive.

  **Two traps when re-running it**, both hit once already:
  - `patch_equipment.js` rewrites the `gearLab` flag from the raw crafted list, which undoes
    the "only obtainable there" narrowing. **Always re-run `fix_gearlab.js` after it**, and
    `patch_unique.js` too; then check the three counts (usedBy / unique / gearLab).
  - The one page that never matches is **Twin 203mm (Mle 1924 Submarine-mount)**: the user
    saved it, but no `List of X` page covers that submarine deck gun, so the catalog has no
    record to attach it to. Expected, not a parse failure.

  Coverage after the last batch: **381 pages, 386 of 581 records restricted**. Every weapon
  category is at 70-100%, AA Time Fuze Guns at 4/4, and the remaining gap is mostly Auxiliary
  (127 of the 195 uncovered records). The number that matters is smaller: of the **45 distinct
  items Optimize can reach, 39 are covered and 6 are not** - down from 23, then 9.
  The reachable set itself keeps shifting as scoring changes, so re-measure it rather than
  reusing an earlier list.

  ### A Research toggle beside Gear Lab (2026-08-20)

  Asked for as "un tri par Research pour les elements qui s'obtiennent que par les
  recherches". Same shape as the Gear Lab toggle and the same definition, learned from the
  correction to that one: `research` means **obtainable ONLY through the Research Academy** -
  in that page's list, and in none of gear boxes, the Gear Lab, Shops or the drop table.
  **12 records**, all plausibly research gear: the Prototype guns, the High Performance
  radars, the Improved Hydraulic Rudder. The two flags are mutually exclusive by construction
  (each excludes the other's source), verified at 0 records carrying both.

  `syncSourceToggle(button, on, source)` now serves both buttons rather than a copy each.

  **One judgement call worth recording**: obtainability counts every name the Gear Lab page
  mentions, its INPUT column included, while the `gearLab` flag counts only what it crafts.
  Tightening obtainability to crafted-only would have marked 8 more records `unique` - Single
  12.7mm Browning, Gloster Sea Gladiator and similar Rare/Elite starter gear you feed into
  the lab. Plainly not the event rewards `unique` is for, so their absence from the other
  four pages reads as a gap in those pages, not as evidence. `unique` stays at 145.

  Verified across all 888 ships, four toggle combinations: 4440 slots filled in every one;
  both on gives 1728 Gear Lab and 250 Research picks; Research off gives **0 Research picks**
  and moves 252 slots; Gear Lab off gives **0 Gear Lab picks** and moves 1730; both off gives
  0 of each. 0 unique leaks, 0 hull violations, 0 Time Fuze violations, 0 errors throughout.

  ### Optimize scored weapons at zero Firepower (2026-08-20)

  Reported, and a real bug: the optimiser ranked weapons on the catalog's DPS alone, which
  is a **stat-0 baseline**, so it compared every gun as if the ship had no Firepower. The
  user's example is the cleanest possible demonstration:

  | | raw DPS | Firepower bonus |
  |---|---|---|
  | Prototype Quadruple 152mm Main Gun Mount (UR) | 45.88 | **+65** |
  | Single 152mm (6"/45 Pattern 1892) (Rare) | 45.89 | +12 |

  The Rare gun won **by 0.01 of raw DPS**, while carrying 53 less Firepower - the very stat
  that multiplies its own damage. On Cleveland at 125 (FP 113) the real scores are **127.5
  against 103.3**, the opposite order.

  A weapon is now scored the way `computeCombatMetrics` already renders it - the wiki's
  `WeaponStatMultiplier`, `(1 + ScalingStat/100)` - with the item's own bonus to that stat
  added in (`weaponScoreForShip`). **The optimiser and the DPS figure the app displays were
  disagreeing with each other; they now use the same formula.** Mounts and efficiency stay
  out: they belong to the slot, are equal for every candidate in it, and cannot change the
  order.

  **Two second-order effects are knowingly ignored**, and one ship shows why that is a real
  trade rather than a free win: a gun's Firepower bonus also lifts the ship's OTHER gun
  slots, and picks are made slot by slot rather than jointly. **Chen Hai** is the single
  ship in 888 whose surface DPS drops (937 -> 734): her second slot takes a Fairey Spearfish
  over a Twin 127mm, correctly by that slot's own numbers, but loses the gun's Firepower
  bonus which was feeding her other slot. Modelling that needs a whole-loadout search.

  Measured against the true previous state (named preference on both sides, so only the
  scoring differs): **442 ships change loadout, surface DPS better on 441 and worse on 1**,
  roster total **+4.7%**, 0 errors.

  **Worth knowing about the skill-named preference while reading DPS numbers**: it is
  absolute, so it can cost a lot of raw damage. Formidable drops 1230 -> 804 by taking the
  Fairey Albacore her skill names over a Fairey Spearfish. That is what was asked for - the
  skill bonus is real and this app does not model it - but the metric cannot show the gain,
  only the loss.

  **The two fixed widths were measured, not estimated** - and the measurement that matters
  is not the one taken on a bare ship. A first pass over all 888 unequipped ships put the
  widest value at 3.81rem ("2,086"), which would have clipped the moment anything was
  equipped. Re-run with **Optimize applied at level 125 on every ship**, the real worst case
  is **4.30rem, "10,669"** (Fubuki (Senran Kagura), eHP) - so the value column is 4.4rem and
  the name column 4.7rem (widest label cell 4.58rem, "DPS ASW"), both with `document.fonts.
  ready` awaited first, the same convention as the stats grid's own widths. Checked
  dataset-wide afterwards: **0 cells clip** (`scrollWidth > clientWidth`) across all 888.
  **When sizing a column against "the widest value the data produces", produce the data the
  way the user will - here that means optimised and levelled, not freshly opened.**

  The slot row and the table stay side by side while the row is at least ~1027px, which at
  this modal's proportions means a window of about 1920px and up. Below that the slot row
  wraps and the table drops beneath it, which at two rows tall is a cheap fallback.
  (A probe that tests wrapping as `metrics.top > slots.top` is WRONG now that the table is
  vertically centred - it is offset downward by half the height difference while still on
  the same line. Compare the two centres instead.)

  **`.equip-slot` stays at 7rem.** The first pass trimmed it to 5.8rem after measuring
  that six slots pushed the table underneath - but that measurement was taken in a 1250px
  test window, where the modal's info panel is only ~640px wide and the row cannot fit six
  slots at any size. The user's own window is far wider and never had the problem
  ("Je ne pense pas que tu avais besoin de libéré de la place"). Measured properly: the
  row needs 727px of slots plus a 148px table, which fits from roughly 1450px of window
  upward. Below that the slot row wraps and the table drops below it, which is the intended
  fallback rather than horizontal overflow. **Measure a layout at the width the app is
  actually used at, not at whatever the test harness defaults to.**

  **Known gap**: the built-in aircraft rows point at ordnance ids that page never
  documents, so the ~127 ships whose only weapons are default aircraft report 0 surface
  DPS. The metric tooltip says how many slots were skipped. Equipping or optimising fixes
  it, since catalog aircraft do carry DPS.

  **Still open, in order**:
  1. The DPS half of step 1: implement each category's own DPS/reload formula separately
     (Guns/Torpedoes, Airstrike/aircraft, AA Guns, ASW each need their own — see above)
     using the ship's LIVE Firepower/Reload rather than the wiki's baseline-100-reload
     reference numbers already stored in `dps`/`aaDps`/`aswDps`. Disclose the
     `AbsoluteCooldown=0` approximation for Guns/Torpedoes wherever the resulting number
     is shown, since it is not a verified constant.
  2. ~~The rarity-capped selector + Optimize button~~ **done (2026-08-20)**. A "Max
     rarity" `<select>` and an "Optimize" button sit on the Equipment heading, in the
     same place the Skills section puts its Max Level toggle. The cap is global and
     survives switching ships, like `skillsAtMaxLevel`.

     **The plan quoted above was wrong, and checking is what caught it.** It assumed
     Optimize could just take the top of `sortEquipmentOptions()`, which orders by rarity
     first. Measured across the catalog: **in 4 of 14 categories the highest-rarity item
     is not the strongest.** A Super Rare Twin 410mm (Type 3 Shell) out-damages every
     Ultra Rare BB gun, and for Fighters the gap is 33.03 vs 42.25. So Optimize uses its
     own `equipmentOptimizeScore()` and ignores rarity except as a filter;
     `sortEquipmentOptions()` stays as it was, for browsing only.

     **Scoring is not uniform across categories, and the difference matters.** Guns carry
     `dps.raw` (pre-armour-modifier). Torpedoes and aircraft carry no `raw` **and no
     `armorMod`**, so raw cannot be reconstructed — the mean of light/medium/heavy stands
     in. That choice is deliberate: `dps.light` (what `equipmentPrimaryStat` falls back to)
     silently assumes a light-armoured target and reorders the torpedo list, since
     torpedoes do their most damage to heavy armour. AA guns and ASW gear have a single
     figure of their own.

     **Auxiliary slots are deliberately left untouched.** They have no damage figure, and
     there is no defensible way to rank HP against Evasion against Accuracy without
     knowing what the player is optimising for. Optimize skips them rather than inventing
     a preference — `equipmentPrimaryStat`'s "first key of statBonus" fallback is
     arbitrary and must not be used to pick. **If the user ever wants auxiliaries filled,
     ask what to optimise them for; do not guess.**

     **A pre-existing bug surfaced and was fixed on the way**: the Torpedo catalog page
     also lists the two SY-1 missiles, so every plain torpedo slot was being offered them
     — and Optimize would have picked SY-1A, which outscores every real torpedo. Type code
     20 (Missiles) appears **alone** on exactly 4 slots (An Shan, Chang Chun, Fu Shun,
     Tai Yuan) and code 5 on 446, **never together**, so the two sets are disjoint. Code 20
     is now mapped to the Torpedo category and `equipmentOptionsForSlot` splits it in
     half: a missile slot gets only missiles, a torpedo slot only torpedoes. This also
     closes the "code 20 deliberately unmapped" note from the catalog-linking work.
     Mapping code 20 without the split gave those 4 slots **zero** options — caught by
     testing An Shan specifically rather than only the ship in front of me.

     Verified: Ayanami's torpedo slot offers 29 options and 0 missiles; An Shan's slot 2
     offers exactly the 2 missiles; every one of New Jersey's optimised picks is provably
     the maximum-scoring option under the cap (0 non-maximal); lowering the cap to Elite
     changes every pick and produces 0 picks above the cap; and Optimize run over all
     **861 ships fills 3371 slots with 0 unscorable items and 0 errors**. The standard
     fingerprint shows stats, costs, grid, filters, Interaction counts and the CSS sweep
     all byte-identical, with only the modal HTML growing by the new controls.
  3. HP potential panel — revisit once real equipped-gear stats (Evasion/HP/Luck
     auxiliary bonuses) are available; the "combine HP/Evasion/Luck/Armor, assume a
     level 100 enemy" approach the user asked for still needs a source for baseline
     enemy Accuracy/Luck at level 100, which hasn't been found yet either.
- **Team composition calculator**: the user's stated end goal ("le but est de pouvoir
  afficher les stats réelles dans la composition d'une équipe complète... 3 vanguard, 3
  main") — Effective Stats and Interaction were both built as groundwork for this, but the
  actual multi-ship team-builder UI has not been started. Don't build it unprompted; it's
  a big feature, wait for explicit go-ahead.
- **Barrage gif "first hover feels slow"**: investigated at length (resizing gifs made
  decode time *worse*, not better — measured, don't retry that). Added a page-load-time
  `warmUpGifDecoder()` that eagerly decodes one gif on page load, theory being a one-time
  browser codec-init cost. Last status from the user was inconclusive/not fully confirmed
  fixed — if raised again, don't re-try gif resizing, and treat prior headless-browser
  timing measurements as unreliable (got wildly inconsistent numbers for the identical
  file across runs — `--virtual-time-budget` timing is not trustworthy for this).

## Working style notes for this user

- Gives **specific concrete counter-examples** ("Izumo n'interagit pas avec Centaur") and
  expects a root-cause general fix, not a patch for that one instance — verify against the
  reported case AND check nothing legitimate broke.
- Explicitly values precision over recall for Interaction/stat features — when in doubt,
  exclude rather than risk a false positive (stated directly: prefers being conservative).
- Reads full sentences carefully and expects the same — has caught several bugs from
  matching a keyword without checking what the surrounding clause actually restricts it to
  (compound nation+role qualifiers, negative/solo conditions, weapon-category vs
  ship-category wording).
- Comfortable with iterative back-and-forth — small focused asks one at a time, each
  verified before moving on, rather than big upfront specs.
- Correspondence is in French; code/comments/commit-style content stays in English per the
  existing codebase convention.

## The source files carry no comments any more (2026-08-20)

On direct request ("je veux que tu retires tous les commentaires du code des fichiers. Si
tu en as besoin migre les dans ton claude.MD"), **every comment was removed from
`app.js`, `style.css` and `index.html`** and migrated into the appendix below.
`index.html` turned out to have none to begin with; `app.js` had 821 (65.7 KB of text,
156 blocks) and `style.css` 34. Line counts: app.js 3528 -> 2706, style.css 1772 -> 1675.

**Superseded the same day** — see "Commenting standard" below. The source files were
re-commented from scratch against the rules in `programming rules/`, keeping roughly a
third of what the strip removed. The appendix stays as the full record, but it is no
longer the only copy of the load-bearing rationales.

**How the strip was done safely.** A naive regex over raw JS would mistake a `//` inside
a string, a URL or a regex literal for a comment, and this file is dense with regex
literals. So a small character-level scanner (scratchpad, not committed, same convention
as every other one-off script here) tokenised `app.js` properly — strings, template
literals with `${}` interpolation, regex-vs-division, line and block comments — and the
strip worked from its character ranges, never from a text regex. Two preconditions were
proven first rather than assumed:
- **CSS**: every one of the 34 `/*` in `style.css` is a real comment, none sits inside a
  string or a `url()` (checked with a separate CSS scanner) — which is what makes the
  plain non-greedy `/*[sS]*?*/` used there exact.
- **JS**: no template literal in `app.js` spans a newline (verified by counting unescaped
  backticks per line: the only odd lines were inside comments) — which is what makes it
  safe to collapse the blank lines that deleting a comment block leaves behind.
Blank-line collapsing is further restricted to lines that were adjacent to a deleted
comment, so no other spacing in the files moved.

**Verification was a before/after behavioural fingerprint, not a read-through.** Captured
BEFORE touching anything and replayed after: all 888 ships' fully rendered modal HTML
hashed together (73.0 MB of markup), the catalog grid and filter panel hashed, 2B's
per-category Interaction counts, the six named guard precedents from this file
(Izumo<-Centaur, Izumo<-Tirpitz, Brest<-Bolzano META, 2B<-Avrora, 2B<-Baltimore μ,
Chapayev), `computeStats`/`computeEffectiveStats`/`computeOilCost` on seven ships, New
Jersey's five slot option counts, and a 39-selector computed-style sweep standing in for
the stylesheet (CSSOM `cssRules` is unreadable under `file://` — SecurityError — so
computed values are the available proxy). **Every value matched, and the two result
screenshots are byte-identical (same SHA-256).** If a future mechanical rewrite of these
files is ever needed, reuse this method: fingerprint first, then change, then replay.

## Commenting standard (2026-08-20) — from `programming rules/`

The user created a `programming rules/` folder (git-ignored, reference material like
`Site web/`) holding saved articles on two topics, and asked for the code to be updated
against them. Three are about comments — Stack Overflow's "Best practices for writing
code comments", Douglas Rocha's "The Art of Commenting", Alibaba Cloud's "The Art of Code
Comments" — and they converge on one rule, Jeff Atwood's: **code tells you HOW, comments
tell you WHY.**

**A comment earns its place only if it is one of these:**
1. **Intent** — the purpose of a block, at a higher level of abstraction than the code.
2. **Summary** — one or two sentences distilling a paragraph, so the file can be scanned.
3. **Something code cannot express** — data provenance, a formula's source, a measured
   figure, a decision that was made and why.
4. **Unidiomatic code** — a warning that something looks removable but is not. Stack
   Overflow's Rule 5; in this codebase that is most of `isGenuineAllyMatch`.
5. **Bug-fix context** — what broke, with the concrete failing case, so a reader can tell
   whether the fix is still needed and how to test it (Rule 8). **Every guard regex names
   the ship that made it necessary — that ship IS the regression test.**
6. **A constant's rationale** — why the value is that value, not merely what it is.
7. **TODO** for a known-incomplete implementation (Rule 9).

**A comment must NOT be:**
- a restatement of the code (`i = i + 1; // add one to i`);
- an excuse for unclear code — rename or restructure instead (Rule 2);
- an end-of-line note on an ordinary line;
- **changelog narration** — dates, user quotes, "first we tried X, then Y", verification
  counts. That is exactly what this file is for, and duplicating it in the source is how
  comments go stale. This is the single biggest difference from how the code was
  commented before 2026-08-20.

Both halves matter: the articles are equally firm that too many comments is a failure
mode and that refusing to write them is one. Roughly a third of the stripped text came
back; the rest was changelog and stayed here.

**Do not add a comment because a function looks important.** Add one when a reader who
understands JavaScript would still ask "why is this here?".

## Deployment security (2026-08-20) — also from `programming rules/`

The same folder holds MDN's Content Security Policy reference, an HTTP Observatory scan
result, and the HSTS preload submission page — the site is deployed to Cloudflare
(`wrangler.toml`, Workers static assets out of `./dist`) and had **no security headers at
all**.

The app turned out to need no code changes to accept a strict CSP: **no inline
`<script>`, no inline `style=` attribute, no `on*` handler, no `eval`/`new Function`, no
`javascript:` URL, no `fetch`/XHR/WebSocket.** The 18 `innerHTML` writes are either `""`,
a static string, or bundled skill text — **no user input reaches any of them** (the two
search fields are only ever lowercased and compared), so there is no DOM-XSS surface to
fix either. Setting `el.style` from JS is CSSOM, which CSP does not restrict, so no
`'unsafe-inline'` is needed despite the app styling elements constantly.

`_headers` (repo root) carries the result. It must be copied into `./dist` with the rest
of the app — Cloudflare consumes it there and does not serve it.

**Verified, not assumed**: a scratchpad static server served this exact app over HTTP
with these headers while the page listened for `securitypolicyviolation`. Result: **0
violations, 0 errors, 996/996 card images and every local asset (equipment icons, faction
logos, stat icons, the inline-SVG scrollbar arrows) loaded.** `file://` would have been
useless for this — it resolves `'self'` differently. Re-run that check if the app ever
gains a new kind of resource.

**Two things deliberately NOT done:**
- **HSTS `preload`** is absent, deliberately. The user enabled HSTS zone-wide in the
  Cloudflare dashboard (6 months, Apply to subdomains ON, Preload OFF, alongside Always
  Use HTTPS, Automatic HTTPS Rewrites and Minimum TLS 1.2), so `_headers` was aligned to
  the same 6-month `max-age` instead of its original 2 years - two HSTS headers on one
  host that disagree is a trap for later. **Cloudflare is the source of truth for the
  domain**; the line in `_headers` only matters if the site is ever served elsewhere.
  Preload stays off because removal from the list takes months, whereas a plain HSTS
  header simply lapses. Revisit once several subdomains have been live on HTTPS a while.

  **Scope correction worth keeping** (I got this wrong first time and it changed the
  user's decision): an HSTS header served by `azurcalculator.ilph-creation.party` covers
  that host and anything BELOW it - NOT the apex `ilph-creation.party`, nor sibling
  subdomains. Domain-wide HTTPS is a Cloudflare dashboard setting, not something this
  repo can do. The practical trap once `includeSubDomains` is on: grey-clouding a
  subdomain in Cloudflare DNS makes it inaccessible unless it serves valid HTTPS itself,
  so new services should stay orange-clouded.
  Encryption mode was left on **Automatic SSL/TLS** (running Full): it upgrades toward
  Full (Strict) on its own and will not break a newly added origin, and for this site the
  question is moot anyway since Workers static assets have no separate origin.
- **Google Fonts is still external**, so the CSP has to allow `fonts.googleapis.com`
  (stylesheet) and `fonts.gstatic.com` (font files). Those two directives are the
  documented pattern but are the one part that could NOT be network-verified here — this
  sandbox has no internet, which is also why the font-face check reads false in the test
  output. **Self-hosting Raleway would let both origins drop out of the CSP entirely**,
  remove a third-party request, and make the page work offline; it needs the font files,
  which have to be fetched on a machine with network access.

## PageSpeed findings (2026-08-20) — mostly NOT yet fixed

The user added a PageSpeed Insights run to `programming rules/`. It is the first hard
evidence of how the deployed site behaves: **https://azurcalculator.ilph-creation.party**,
mobile, Moto G Power emulation, slow 4G.

    FCP 2.6s | LCP 13.6s | TBT 120ms | CLS 0.172 | SI 2.6s

**The whole problem is images: 5,032 KiB transferred, of which 4,420 KiB is avoidable.**
- `assets/header-background.png` — **2,076 KiB**, save ~1,738 KiB. This is also the LCP
  element (`<header class="topbar">` paints it as a CSS background), which is why LCP is
  13.6s: at 1,638 kbit/s a 2 MB image alone takes ~10s.
- `assets/icon.png` — 247 KiB at 500x454, **displayed at 89x81**. Save ~239 KiB.
- Card thumbnails — many at 250-280 KiB each (`242_retrofit.png`, `106_retrofit.png`, ...);
  `assets/thumbnails/` is **87 MB across 996 files**.
All flagged for the same two reasons: no modern format (WebP/AVIF) and no resizing to
displayed dimensions.

**Done, and verified not to change rendering:**
- `&display=swap` on the Google Fonts URL and a `preconnect` to `fonts.gstatic.com`. The
  critical chain showed googleapis (144ms) then gstatic (278ms) resolving in series.
- `width`/`height` on the brand logo. It was the element PageSpeed named as "image of
  unknown size", and `.brand-logo` sizes by `height: 46px; width: auto`, so nothing
  reserved its box before load. The attributes only supply the aspect ratio; CSS still
  sizes it. Card thumbnails already avoid this via `aspect-ratio: 3/4` on the wrapper.

**NOT done — needs a tool this environment does not have.** No ImageMagick, no cwebp, no
Pillow, no ffmpeg here, so the images could not be re-encoded. This is the fix worth
almost everything else combined:
1. Resize `icon.png` to about 2x its displayed size (180x164) and re-encode.
2. Re-encode `header-background.png` as WebP at a sane width, or drop it for a CSS
   gradient - it sits under a near-opaque gradient overlay already.
3. Batch-convert `assets/thumbnails/` to WebP. Because it is a CSS background, the header
   also cannot be discovered from the initial HTML; a `<link rel="preload" as="image"
   fetchpriority="high">` would help, but only AFTER the file is small - preloading 2 MB
   just moves the same 10s earlier.

**A regression this session caused, worth undoing at deploy time:** pretty-printing
`data/*.js` (readability, done on request) costs **+72 KiB gzipped on ships.js**
(509 -> 581 KiB), and PageSpeed already lists `/data/ships.js` as the longest
critical-path request at 547 ms. The right fix is not to re-minify the repo copy - keep it
diffable - but to minify into `./dist` at deploy time. There is no build step today
(no `package.json`; `dist/` is populated by hand), so this needs one, together with
copying `_headers` in.

## Appendix: the source comments, migrated out of the code (2026-08-20)

The user asked for **every comment removed from `app.js`, `style.css` and
`index.html`**, migrating anything worth keeping here. This appendix is that
migration, done mechanically rather than by judgement: each entry is one comment
block, verbatim, under the line of code it sat above (or beside, marked
*(trailing)*). Nothing was summarised away, because this file's own cleanup notes
call the guard rationales load-bearing regression documentation - the ship names
in them are the concrete cases each regex exists for.

Pure section-divider comments (`// ---- Modal ----` and the like) carried no
information and are not reproduced. Everything else is here.

**When touching one of these functions, read its entry here first.** If a future
change makes one of these rationales wrong, update it here - this appendix is now
the only copy.

### `app.js`

**`const MAIN_RARITIES = ["Normal", "Rare", "Elite", "Super Rare", "Ultra Rare"];`**  — L13

> Priority and Decisive are the Research-ship equivalent of Super Rare / Ultra Rare —
> kept as their own chips (not merged into SR/UR) but split into a separate "Research"
> sub-group, set apart with the same "|" separator the class row uses for fleet position.

**`const ALL_SKILLS_INDEX = ships.flatMap(s => (s.skills || []).map(skill => ({ ship: s, skill })));`**  — L30

> Flattened once so the Interaction tab can scan every skill in the game without
> rebuilding this list on every modal open — every skill (base AND "+" enhanced
> versions) is included; computeInteractions merges a matched base/"+" pair into one
> entry with a toggle rather than filtering one out up front, since which of the two
> actually matches a given category can differ (e.g. a "+" skill's added clause can
> mention a fleet role the base text never does at all).

**`const HULL_TYPE_TEXT = {`**  — L38

> hullType is stored as a single word for two categories, but skill text always spells
> out the full "Ship" suffix in prose ("Repair Ship", "Munition Ship").

**`const HULL_ABBREVIATIONS = {`**  — L45

> The wiki-standard hull-type abbreviations actually used in skill prose (confirmed
> against the Damage Calculations page: "BB/BC/BBV only", "your SSs and SSVs", etc.).
> Shared between the keyword highlighter (colors them like their full name) and the
> Interaction compound-qualifier check ("Sakura Empire CVs" only applies to CVs).

**`const NATION_COLORS = {`**  — L56

> One color per nation, grounded in each nation's actual Azur Lane / source-franchise
> branding (majors: national flag/military colors; collabs: the source franchise's own
> brand color) rather than a generic palette-slot pick. All 30 values individually
> checked for >=3:1 contrast against this app's dark surface (#0b1120); this can't also
> be CVD-safe pairwise at N=30 (color theory caps reliable categorical distinction at
> ~8 hues — see the `dataviz` skill), deliberately overridden in favor of authenticity.
> 
> The 13 major/pirate nations use the user-supplied hex values verbatim EXCEPT Vichya
> Dominion, Iron Blood, and META, whose given hexes measured under 3:1 contrast on this
> dark surface (2.16/2.47/2.68) and were lightened in HSL space (same hue/saturation,
> +L only) until they cleared ~4:1 — don't "fix" these back to the literal supplied hex.

**`"Eagle Union": "#2878B5",`**  — L68

> Major WW2 nations — user-supplied hex table (2026-08-17)

**`"Iron Blood": "#d04451",`** *(trailing)*  — L72

> lightened from #9C2732 (2.47:1 -> 4.15:1), same hue/sat

**`"Vichya Dominion": "#bf566e",`** *(trailing)*  — L77

> lightened from #7F3042 (2.16:1 -> 4.28:1), same hue/sat

**`"META": "#8568aa", // lightened from #674D88 (2.68:1 -> 4.09:1), same hue/sat`**  — L81

> Siren / pirate

**`"META": "#8568aa",`** *(trailing)*  — L82

> lightened from #674D88 (2.68:1 -> 4.09:1), same hue/sat

**`"Neptunia": "#9a6fe0",`**  — L84

> Collab nations, colored after their source franchise's own branding

**`const FACTION_LOGO_CODE = {`**  — L103

> Faction logo watermark shown behind the ship name in the modal header. Nations with a
> genuinely distinct icon on the wiki's own Nations page get their own logo; every
> collab nation that doesn't have one there shares "Um" — the wiki's own generic
> collab/Universal-style icon — instead of getting no watermark, since a shared
> watermark beats none for those.
> Source files: the wiki's own per-file "File:{code} 1.png" pages (full original
> resolution, 356-656px depending on nation), copied to `assets/faction-logos/{code}.png`
> — code mapping read off the Nations page's own table (each icon's wrapping
> <a title="..."> names its real nation); Universal ("Cm") has no row on that page at
> all (it's only mentioned in prose above the table) but its own dedicated file page
> confirms "Cm" is linked from the Universal article.

**`function nationDisplayName(nationality) {`**  — L147

> ship.nationality stores "BLACK★ROCK SHOOTER (Nation)" — the "(Nation)" qualifier
> disambiguates the nation from other same-named entities in the source data, but never
> appears in actual skill prose and isn't meant to be shown to the user either (it was
> leaking into the filter panel and modal tags verbatim before this).

**`const STAT_COLOR_GROUPS = [`**  — L155

> Three things get color-coded: nations, stats, and named mechanics. Hull types, weapon
> terms, DMG/Damage, healing terms, fleet role (Vanguard/Main Fleet), and Siren are
> deliberately NOT part of this system — don't re-add one of these without an explicit
> ask, since it was a deliberate reduction, not an oversight.
> 
> One color per stat, user-supplied hex table — verbatim, all 15 already cleared >=3:1
> contrast on this app's dark surface (#0b1120) with no lightening needed (unlike 3 of
> the nation colors). Abbreviation and spelled-out form share a color (FP/Firepower
> alike); each row also picked up whichever OTHER real-text variant the corpus actually
> uses (Ammo for Ammunition, Max HP for Health, etc — checked by occurrence count, not
> guessed). "Anti-Air" (hyphenated) is the form matched here, not "Anti Air" — only the
> hyphenated spelling actually occurs in skill text.

**`const MECHANIC_COLOR_GROUPS = [`**  — L186

> A few status effects are shared game-wide vocabulary rather than one ship's own
> invention, and recur often enough to be worth learning by color: Burn (98 descriptions),
> Special Burn (41), Armor Break (40), Smokescreen (32), Flooding (20) — counted over the
> corpus, not assumed. Hues are mnemonic (fire, water, cracked armor, smoke) but are picks:
> unlike the nation and stat tables these were not supplied, and no saved wiki page
> documents what colors the game itself gives these effects, so swap any of them freely.
> Each row also lists whichever other spelling the corpus actually writes ("Burning",
> "Armor-broken"); a trailing "s" is already handled by the shared matcher.

**`function apIsAmmoType(text, index) {`**  — L203

> Ammo type and caliber, user-supplied color picks (2026-08-19: "normal -> ocre, HE ->
> rouge, AP -> bleu, SAP -> orange, High caliber -> rouge"). Unlike every other palette
> in this file, these terms MUST be matched case-sensitively — the shared regex is
> otherwise case-insensitive throughout (needed for e.g. "smokescreen" appearing
> lowercase most of the time), but "HE" collides with the pronoun "he" and "Normal"
> collides with the ordinary adjective ("returns to normal") the moment case is ignored.
> Checked against the corpus: exact-case "HE"/"SAP"/"Normal" have zero false positives
> (0 lowercase-pronoun "He", 0 "normal"-the-adjective matches survive requiring the
> capital). "AP" alone stays ambiguous even with exact case, since Action Points (a
> fleet-wide resource, "your fleet gains 10 AP") is written identically — resolved by
> `apIsAmmoType`, a context check verified against all 105 occurrences in the corpus
> (71 ammo / 34 Action Points, both counts hand-confirmed): Action Points is always
> either preceded by a number/"more" ("gains 10 AP", "10 or more AP") or followed by
> "cost"/"consumption"/"-consuming" ("AP cost", "AP-consuming skill"), neither of which
> ever precedes/follows the ammo sense. "Large-caliber"/"CA-caliber" (found alongside
> "high-caliber" while auditing the corpus) were deliberately left out — the user was
> asked and confined this to high-caliber only. Unlike the 4 abbreviations, "high-caliber"/
> "high caliber" carries no case-collision risk (checked: all 5 corpus occurrences are
> already lowercase mid-sentence, none capitalized), so it stays case-insensitive like
> every other palette — caseSensitive defaults true below and is opted out per-term.

**`const NAMED_MECHANIC_COLOR = "var(--accent)";`**  — L238

> A mechanic a single skill coins for itself — "Berserk Mode", "Frostshred", "Pearl Moon" —
> gets no palette entry of its own: it appears in one skill, so a color to memorize would
> mean nothing. They all share --accent, the color the mechanic's own section label already
> uses, which is what ties the name in the sentence to the block it heads.

**`{ className: "kw-nation", perTermColor: t => NATION_COLORS[t], underline: true, terms: [...new Set(ships.map(s => nationDisplayName(s.nationality)).filter(Boolean))] },`**  — L245

> Nations are underlined (see highlightKeywords) as well as colored, since both
> nations and stats carry many individual hues — the underline is what tells them
> apart at a glance rather than relying on memorizing 45 colors. Mechanics get a third
> treatment, a tinted chip, for the same reason: with three palettes sharing one
> sentence, hue alone can no longer say which system a colored word belongs to.
> 
> Mechanics keep the casing the wiki wrote rather than being normalized to the canonical
> form the other two use — "smokescreen" is lowercase in 72 of its 87 occurrences, and
> capitalizing them all would be the formatting visibly rewriting the text.

**`const KEYWORD_INFO = new Map();`**  — L260

> Maps lowercase term -> { color, canonical, underline }. "canonical" is the properly-
> capitalized form (Destroyer, Light Cruiser, Sakura Empire...) used for display
> regardless of how the source skill text happened to capitalize it mid-sentence.
> Abbreviations (DD, FP...) keep their own all-caps canonical form instead of being
> Title-Cased.

**`const OPERATION_SIREN_TAG_COLOR = "#E8A33D";`**  — L275

> Longest term first so e.g. "Max HP" is matched whole rather than leaving a stray "HP".
> Each term also accepts an optional trailing "s" (Destroyer/Destroyers, etc.). The
> alternative after it (group 3) matches bare numbers/percentages ("15%",
> "3213") so skill values stand out from the surrounding prose — matched in the same
> pass as the keyword terms so numbers inside an already-colored span (e.g. inside "HP")
> can't be double-wrapped. The last alternative (group 4) matches the literal
> "[Operation Siren]" mode tag some skills use to mark roguelike-only behavior —
> bolded and colored on its own, distinct from the other palettes.

**`let cachedKeywordRe = null;`**  — L289

> Named mechanics are per-skill, so they can't live in the fixed vocabulary above — they
> come in as an argument and take group 1, ahead of everything else, so that a name
> starting with a term of its own ("Standard Armor Break") is matched whole rather than
> losing its first word to the shorter global match. With no names to add, group 1 becomes
> a pattern that can never match, which keeps every other group's number stable.

**`function keywordInfoFor(matchText, fullText, matchIndex) {`**  — L301

> `fullText`/`matchIndex` are only needed by a `caseSensitive` entry's own exact-case
> check and by a `contextGuard` (currently just "AP", see AMMO_CALIBER_TERMS) — every
> other group ignores them.

**`function highlightKeywords(container, mechanics) {`**  — L315

> Walks every text node already inside `container` (so it works whether the content was
> set via textContent or as sanitized wiki HTML with existing <b> tags) and wraps each
> recurring keyword in a colored span, without disturbing surrounding markup.
> `mechanics` are the names this particular skill coins for itself (see namedMechanics).

**`(function warmUpGifDecoder() {`**  — L375

> The very first animated gif decoded on the page seems to pay a one-time browser
> setup cost (regardless of which file it is), so warm that up immediately on load —
> long before the user opens any ship and hovers a barrage icon — rather than waiting
> for a modal to open.

**`const active = {`**  — L391

> active[group] is a Set of selected values; empty Set means "no filter" for that group

**`const ROLE_ORDER = ["Vanguard", "Main", "Submarine"];`**  — L401

> Front-to-back fleet order. Hull types are grouped under their fleet position so the
> position itself doesn't need its own separate filter row.

**`const MAJOR_NATION_MIN_SHIPS = 20;`**  — L405

> Nations with few ships (mostly one-off collab factions) are tucked into a
> "Subfactions" dropdown instead of getting their own chip, to keep the header compact.

**`const FORCE_MAJOR_NATIONS = ["Kingdom of Tulipa", "Liga de Pedrería", "Tempesta"];`**  — L409

> These nations stay below the ship-count threshold but are still core factions,
> not one-off collabs, so they always get their own chip.

**`if (group === "nationality") {`**  — L427

> Filter state stays keyed on the raw nationality value ("...(Nation)" qualifier and
> all) — only the label shown to the user is cleaned up.

**`function hullShortsByRole() {`**  — L454

> Groups distinct hull-type abbreviations (short codes like "DD", "CVL") under
> their fleet position, keeping each short code's full name for the tooltip.

**`const counts = nationCounts();`**  — L589

> Nation row: major nations get a direct chip, everything else lives behind a dropdown

**`const STAT_GRID = [`**  — L783

> One single compact grid matching the game's own compact stat panel exactly — a
> 3-column layout (HP/Armor/RLD, FP/TRP/EVA, AA/AVI/Cost, ASW/·/·, reading order
> top-left to bottom-right), one value per stat with any skill delta shown inline
> ("478 +178" in one cell) rather than a separate Base/Real pair, since the in-game
> panel never shows a base stat on its own. The trailing row (Speed, Accuracy, Luck)
> isn't part of that in-game grid but renders through the same cell style for visual
> consistency. Ammunition, Oxygen, and Oil Consumption are omitted entirely — 0/888
> ships carry any numeric value for them, so every row would've shown "—" forever.
> `key: "cost"` is a marker only — Cost isn't part of the normal per-level stat
> pipeline (see computeOilCost), so buildStatsGrid special-cases it. The two `null`
> entries are blank cells (the game's panel leaves Cost's neighbor and the
> submarine-only Oxygen slot empty too). Abbreviated labels match the game's own
> compact wording; the full name is available via the `title` tooltip.

**`function pickStatKeys(point) {`**  — L893

> Ships imported by hand from individual wiki pages (no base/growth/enhance data
> available) instead carry a handful of known reference points — Base, Lv.100,
> Lv.120, Lv.125 — read straight off their wiki stat table. We linearly interpolate
> between whichever two points bracket the requested level.
> Curve points come straight from a parsed wiki table and carry extra fields
> (level, ...) beyond the stats we display — always rebuild a clean object
> restricted to the numeric stats so those don't leak into the UI. Only keys
> actually present on the point are copied, so e.g. a ship with no oxygen data
> still has no oxygen data afterwards (renders as "—", not a fake 0).

**`const HULL_COST_BY_SHORT = {`**  — L930

> STATS = enhance + base + growth * max(level-1, 1) / 1000, plus the retrofit's own
> stat bonus when a Retrofit skin is selected. Speed and Luck have growth = 0 in the
> source data, so they naturally stay constant across levels. Keys with no source data
> (oil consumption, oxygen, ammunition — not tracked for the non-custom-imported ships)
> are left unset rather than defaulted to 0.
> Sortie oil "Cost" — reintroduced from Site web/Oil Cost - Azur Lane Wiki.htm after
> having been dropped earlier as untracked data. Unlike every other stat here, Cost
> isn't level-scaled from a base/growth curve — it's computed from the wiki's own
> formula: MaxCost (hull type + rarity + a META bonus + the limit-break bonus + a small
> per-class modifier) combined with the current level. Verified against the wiki's own
> worked example ("At Limit Break level caps" table, MaxCost=7 row) before trusting it —
> the naive reading of the MathML ("MaxCost·100 + min(Level,99), all over 200") didn't
> reproduce that table's numbers; the correct grouping is
> MaxCost·(100+min(Level,99))/200, confirmed against all 5 columns of that row.
> 
> This app has no limit-break tracking at all (no UI concept of duplicate-based star
> investment — the level control doesn't imply one either, since a ship can be leveled
> anywhere below its cap independent of how many stars it has). Rather than guess a
> mid-progression state, the limit-break bonus is always the MAX one (+6 surface / +3
> submarine) — the same fixed assumption the wiki itself already mandates for PR/DR/UR/
> META ships regardless of investment, extended here to every ship for one consistent,
> comparable number. Same "fully invested" spirit as Effective Stats already assuming
> max skill level — not a guess, just the only stable value with no per-player state.

**`const EXTRA_COST_MODIFIER_BY_NAME = {`**  — L965

> "A few ships also have an extra Oil Cost modifier" (per-class, keyed here by every
> member ship's own display name from the wiki's "Ships from class" column, rather than
> by ship.class text, since a couple of these — Minato Aqua, Homura — have no shared
> class at all).

**`const MODIFIER_TERM_RE = /\b(?:DMG dealt|damage dealt|DMG|damage|crit(?:ical)?(?:\s+(?:rate|dmg|damage))?|evasion rate|hit rate|accuracy|efficiency)\b/gi;`**  — L1034

> A combat modifier is usually restricted to a specific target or weapon: Alvitr's
> "DMG Dealt +15%" only applies to Light Armor enemies. One summed number per stat hid
> that restriction, and worse, added together bonuses that never apply to the same shot
> (an unconditional +10% and a "+15% vs Light Armor" are not a +25%), so bonuses are
> grouped per (stat, qualifier) and each pill carries its own source sentence.
> 
> The qualifier is whatever surrounds the stat term inside the bonus's own captured
> phrase, once the verb, the possessive and the trailing "by X% (Y%)" are cut away:
> "Increases this ship's DMG dealt to Light Armor enemies by 5% (15%)" -> target
> "to Light Armor enemies"; "Increases this ship's Main Gun efficiency by 1% (10%)"
> -> source "Main Gun".

**`const MODIFIER_SOURCES = {`**  — L1047

> Only a weapon/source name in front of the stat term is a real qualifier — anything
> else sitting there is a possessive ("this boat's", "Tirpitz's") or another stat riding
> the same sentence ("FP and Crit Rate"). Cased canonically, since the wiki writes these
> both ways ("Main Gun efficiency" / "main gun efficiency") and pills sit side by side.

**`const MODIFIER_TARGET_RE = /^(?:to|against|with|from|for|while|during|when|vs\.?)\s/i;`**  — L1067

> A trailing qualifier only counts when it reads as a restriction ("to Sirens",
> "against Light Armor enemies", "with AP"). "dealt" — left over from "Crit DMG dealt" —
> and "by self" are just phrasing, not a condition.

**`function modifierLabel(modifier) {`**  — L1113

> "Main Gun" + weaponEfficiency reads as "Main Gun Efficiency", not "Main Gun Weapon
> Efficiency" — the generic label only stands in when no weapon is named.

**`function modifierSourceText(entry) {`**  — L1123

> The captured phrase drops whatever gated it ("Once per battle, when this barrage
> scores a total of 3 hits: ..."), which is exactly the context a pill needs to be
> trustworthy — so the tooltip quotes the whole sentence the bonus was extracted from,
> at max skill level to match the number the pill shows.

**`const SELF_LANGUAGE_RE = /\b(this ship('s)?|her own|own)\b/i;`**  — L1139

> Implements the wiki's own "CurrentScalingStat" formula (Damage Calculations page):
> (ShipBaseStat + sum of flat buffs) * (1 + sum of percent buffs) + sum of skill flat buffs.
> We have no equipment/Meowfficer/Fleet Tech data, so ShipBaseStat is just the already-leveled
> stat from computeStats/interpolateStatsCurve, and every bonus we fold in comes from the
> ship's own currently-active self-scope skill bonuses. Two-stage skill values ("10% (30%)")
> use the max (fully-leveled skill) figure, since this is meant to show best-case potential.
> Bonuses that require a fleet-composition condition (e.g. "if 3+ Sakura Empire ships")
> can't be verified without a team context, so they're counted as if met — this is a
> "full potential" estimate, not a guarantee, and the UI says so.
> 
> The build-time skill-text extraction that produced statBonuses isn't perfect: it
> occasionally (a) captures the same bonus phrase twice off one skill description, (b)
> tags a bonus "self" even when its own matched text plainly targets other ships ("...of
> your DDs by 5%"), and (c) the reverse — tags a bonus "fleet" even though its own matched
> text is self-referential ("increases this ship's EVA by 5%", e.g. Brest's first skill).
> All three are guarded against here rather than by re-running the extraction, since a
> runtime text check on the bonus's own captured phrase is enough to catch what matters.

**`function buildStatsGrid(container, gridDefs, ship, level, base, effective) {`**  — L1203

> Builds the compact 3-column grid matching the game's own stat panel — one cell per
> stat, no header row since the grid IS the layout (each cell carries its own icon +
> abbreviated label). A `null` entry in gridDefs (see STAT_GRID) renders as an empty
> cell so the blank slots the game's own panel has (Cost, and the Oxygen-for-submarines
> slot) still hold their place in the 3-column shape instead of collapsing it. Populates
> `container` directly rather than building/returning its own wrapper, since the whole
> stats section is one grid now.
> 
> A boosted stat shows "base+delta (real)" — e.g. "286+69 (355)" — rather than just the
> final real number: showing only the post-skill value with no base in sight makes it
> ambiguous which number is which, so the base figure is shown explicitly alongside the
> delta and the real total.

**`const entry = (def.text || def.custom) ? null : effective.stats[def.key];`**  — L1225

> "Cost" isn't part of the normal per-level stat pipeline at all (own formula, no
> skill-bonus delta), so it skips both the effective-stats lookup and the base block
> entirely and goes straight through computeOilCost().

**`const EQUIPMENT_TYPE_NAMES = {`**  — L1265

> Equipment slot type codes, as they appear in ship.equipment[slot].type. Read off the
> saved wiki ship pages rather than guessed: each page's Gear table names what its slots
> 1-3 accept, so cross-referencing 837 of those tables against the numeric codes in
> ships.json pins down every code that reaches a listed slot.
> 
> The auxiliary slots (4 and 5) are the gap - the wiki's table never lists them. 15 and
> 18 are still named, by the handful of ships that also carry them in a listed slot
> ("Anti-Air Guns / ASW Bombers", "Auxiliaries / Cargo"); 14 is the DD/CL/CA-only code
> the ASW page describes as anti-submarine equipment (sonar, depth charges). 17 appears
> on two ships (Köln, Köln META) with no source anywhere to name it, so it is left out
> and simply doesn't render - same graceful-degradation as a missing faction logo.
> 
> 21 never appears alone, only ever glued to 6, and the wiki labels every slot carrying
> the pair plainly "Anti-Air Guns" - so it maps to the same name and the duplicate is
> deduped away, which reproduces the wiki exactly without inventing a name for it.

**`const UNIVERSAL_AUGMENT_MODULES = new Set([`**  — L1301

> The Augmentation page's "Universal Modules" table: two modules per hull class, shared
> by every ship of that class. Anything else in a ship's augment list is her own unique
> module, which is the part worth pointing at.

**`const EQUIPMENT_SHORT_NAMES = {`**  — L1309

> The short name a slot goes by in game terms - what the slot is for, rather than the
> full list of equipment categories it accepts (which stays in the tile's tooltip).
> Guns are the one code group that cannot be named from the code alone: a BB's slot 2
> takes DD guns as her *secondary* battery, while a DD's slot 1 takes the same DD guns
> as her *main* one. So the first gun-taking slot on a ship is her Main Gun and any
> later one is a Secondary - which also lands right for submarines, whose deck gun sits
> in slot 3 behind two torpedo slots.

**`const EQUIPMENT_TYPE_CODE_CATEGORIES = {`**  — L1337

> Links a ship slot's numeric type code(s) (EQUIPMENT_TYPE_NAMES above) to the matching
> `category` value(s) in data/equipment.json, so a slot can be filtered to only the gear
> it can actually mount. Built by hand from the same two vocabularies rather than a name
> match, since the wording differs on purpose ("DD Main Guns" vs "DD Gun") - this is the
> single place that ties them together.
> Code 21 is a duplicate of 6 (see EQUIPMENT_TYPE_NAMES's own note - it never appears
> alone) so it isn't listed separately here.
>
> **(Superseded 2026-08-20 — this was wrong, and the code no longer says it. 21 is the
> Time Fuze permission, granted to BB/BC/BBV only; see the Time Fuze entry in the
> Equipment section.)** Code 18 (Cargo) and 20 (Missiles) have no
> catalog category yet: no "List of Cargo" extraction was done (Cargo isn't combat
> equipment), and Missiles were expected to live inside the Torpedo catalog page per the
> user's own note ("les missiles sont dans les torpedoes") but the catalog's Torpedo
> category was built from "List of Torpedoes" alone and hasn't been checked for missile
> entries specifically - both are left unmapped rather than guessed.

**`function equipmentOptionsForSlot(slot) {`**  — L1366

> The catalog entries a given ship slot can actually mount, across every type code the
> slot accepts (a slot can list more than one, e.g. an AA slot also usable for cargo).

**`const EQUIPMENT_RARITY_ORDER = ["Common", "Rare", "Elite", "Super Rare", "Ultra Rare"];`**  — L1377

> Equipment rarity uses its own 5-name scale (Common/Rare/Elite/Super Rare/Ultra Rare)
> distinct from a ship's 7-name one, but "Common" is the same concept as a ship's
> "Normal" and the other four names are shared verbatim - reuse RARITY_CLASS's colors
> rather than defining a second palette.

**`function equipmentPrimaryStat(item) {`**  — L1386

> The one number worth showing at a glance in the picker list - whichever raw-DPS-ish
> figure that category actually has. Auxiliary/ASW gear without a dps-shaped stat falls
> back to its first flat stat bonus, which is the closest equivalent "headline number".

**`function equipmentIconImg(item, className) {`**  — L1406

> Every catalog record has artwork at assets/equipment-icons/{id}.png, pulled out of the
> saved wiki "List of X" pages' own Icon column (581/581 matched on category+name+tier).
> The error handler swaps in the item's name so a catalog entry added later without a
> file degrades to the text tile this section used before icons existed, rather than
> leaving a broken-image box.

**`function equipmentTooltip(item) {`**  — L1426

> Name, rarity and headline stat all live in the tooltip: the tile and the picker cells
> show artwork only, the same way the game's own gear panel does, and the same "detail
> goes in the title, not on the card" rule the rest of this section already follows.

**`function sortEquipmentOptions(options) {`**  — L1433

> Best-in-slot first: highest rarity, then highest headline stat within that rarity -
> the same ordering the eventual "Optimize" button will pick the top entry from.

**`const equippedGear = {};`**  — L1446

> Per-ship, per-slot picks. In-memory only (not persisted) - same lifetime as the level
> control's currentLevel, reset on page reload, kept across modal open/close so browsing
> back to a ship doesn't lose what was picked.

**`function buildEquipmentSlot(name, tooltip, meta, gearCtx) {`**  — L1459

> A card is one slot: a square tile showing the picked equipment's icon on a
> rarity-tinted frame, its slot name underneath, then its numbers - laid out like a ship
> card in the
> catalog grid, which this consciously echoes. `gearCtx` (ship/slotKey/slot/options) is
> only passed for the 5 real gear slots - the Augment card has no picker, since there is
> no augment catalog in this app, only the ship's own eligible-module list.

**`function toggleEquipmentPicker(card, gearCtx, onPick) {`**  — L1516

> Lazily built, cached on the card itself so re-opening the same tile within one modal
> render doesn't rebuild its (possibly 165-item) options list every click.

**`const caption = document.createElement("div");`**  — L1538

> A hovered/focused cell writes its name here, so a dense grid of unlabelled icons
> is still identifiable without waiting on the native tooltip delay.

**`function clampPickerToSection(panel) {`**  — L1575

> The panel is centred on its own card, which is far wider than the card - opened from
> the first or last slot it would hang outside the modal and be clipped by .modal-info's
> overflow. Nudge it back inside the Equipment row after it is laid out; a plain margin
> shift keeps the CSS centring as the default and only corrects the edge cases.

**`requestAnimationFrame(() => { if (panel.isConnected) clampPickerToSection(panel); });`**  — L1587

> The first measurement is taken before the panel's own scrollbar settles, which
> leaves it a few px short; one correcting pass on the next frame lands it exactly.
> Accumulating onto the current margin (rather than recomputing from zero) is what
> makes the second pass a no-op once it is already inside.

**`function renderModalEquipment(ship) {`**  — L1602

> The five gear slots plus the Augment slot, in the game's own order. Nothing is
> "equipped" here yet - there is no gear catalog in this app's data - so every tile is
> an empty square and the card carries what ship.equipment actually knows: the slot's
> name, its mount count and its efficiency. Efficiency is the fully-limit-broken figure
> (the wiki writes it as a progression, "120% -> 150%"; the datamine keeps only the end
> value), the same max-investment assumption the stats grid already makes.

**`const LEVEL_PAIR_GAP = "(?:\\s|<\\/?b>)*";`**  — L1689

> The wiki writes every level-scaled skill value as "base (max)" — "increases this
> character's FP by 3.5% (8%)" means 3.5% at skill level 1 and 8% at level 10. Carrying
> both numbers through every sentence is what makes long descriptions unreadable, so
> only ever one of the two is shown: the base value by default, the max-level one when
> the "Max Level" toggle is on. Either way the parentheses themselves disappear.
> 
> Descriptions are pre-sanitized to plain text plus <b> tags, and those tags routinely
> sit between the two numbers ("<b>20%</b> <b> (40%)"). Rather than drop whatever falls
> inside a match — which would leave unbalanced markup and bold the rest of the
> paragraph — every tag inside the matched span is carried over into the replacement in
> its original order, so only the numbers and the parentheses themselves disappear.

**`const LEVEL_PAIR_NUMBER_RE = new RegExp(`**  — L1702

> "3.5% (8%)" → "3.5%" or "8%". A value can be signed, and a penalty shrinking with skill
> level makes the max the smaller number ("-40% (-20%)", Little Renown's 2nd salvo).
> Guarded on the two values carrying the same sign and unit, so the wiki's own typos
> ("for 20s (50)s", "5% (15)%", "-1.5 (6%)") are left untouched rather than mangled.

**`const LEVEL_PAIR_LV_RE = new RegExp(`**  — L1711

> "Lv.1 (Lv.10)" → "Lv.1" or "Lv.10", the level of a skill-scaled barrage. Spacing after
> "Lv." varies between pages, hence the optional space on both sides.

**`const LEVEL_PAIR_TIER_RE = new RegExp(`**  — L1718

> "All Out Assault - Fletcher Class I (II)" → "... Class I" or "... Class II", the tier
> the attack reaches at each end of the skill's level range. Some pages use the Unicode
> numerals Ⅰ/Ⅱ instead of the ASCII letters, and a handful write the pair the other way
> round ("All Out Assault (I) Ⅱ", base parenthesized instead of max) — both orders mean
> the same thing, so both collapse to a single numeral.

**`function renderLevelValues(html, atMaxLevel) {`**  — L1736

> `atMaxLevel` picks which half of each pair survives; the other half and the
> parentheses are dropped.

**`// Every split has to ignore separators inside parentheses — an aside like "(DMG is based`**  — L1753

> Wiki skill descriptions are one unbroken paragraph of prose — up to 8 sentences, with
> nested conditions and ";"-separated effect lists all running together. These turn that
> prose into blocks: a condition line followed by its actions as bullets, one block per
> sentence. Nothing is reworded and no character is dropped except the separators that
> bullets replace, so the text stays exactly what the wiki says.
> 
> This runs on the HTML string rather than the DOM, which is safe here because
> descriptions are sanitized down to balanced <b> tags with no HTML entities anywhere —
> so a ";" or ". " found in the string is always prose, never markup. It has to run after
> renderLevelValues: splitting the raw text instead would trip over the "(8%)" halves the
> reader never sees.

**`function topLevelMatches(text, separator) {`**  — L1765

> Every split has to ignore separators inside parentheses — an aside like "(DMG is based
> on the skill's level; can activate up to 2 times per battle)" carries semicolons that
> are not list separators (Moskva's "Frozen Fortress").

**`const SENTENCE_SEPARATOR = /(?<!\bLv|\bNo|\b[A-Z])\.(?:\s+(?=[A-Z0-9"“(])|(?=[A-Z[]))/gy;`**  — L1798

> Sticky flags: splitTopLevel anchors each test at the position it is inspecting.
> "…by 5. When the battle starts" is a real sentence end, so digits before the period are
> deliberately not excluded; the three exceptions that are NOT sentence ends are "Lv. 1"
> (a spacing variant of the barrage level), "No. 1" (San Diego's skill name) and a lone
> initial ("Allen M. Sumner", "William D. Porter").
> The second alternative catches a period the wiki glued straight to the next sentence
> with no space ("…Detection Gauge value by 10.As long as this ship is afloat:", Albion;
> "…by 3.5%.[Operation Siren]Every time…", Alabama). All 114 in the dataset are real
> sentence ends — no abbreviation is ever followed directly by a capital — and missing
> them let a whole sentence get swallowed into the next one's condition line.

**`const ENUMERATION_SEPARATOR = new RegExp(`**  — L1812

> The wiki numbers parallel effects inline — "gains the following effects: 1) … 2) …"
> (A2's "Devastating Cleave") — which is a list already, just written as running text.
> Only "N)" counts: "N." is always a decimal or a sentence end in this dataset (48 cases,
> no real enumeration among them) and "N:" is a threshold table ("3 to 5: …", Implacable).
> The optional trailing colon covers the wiki's own "2): Dive Bomber" slip (Béarn META).
> Tag-tolerant, because Juneau's "Martyr+" wraps every single word in its own <b>, marker
> included. The lookbehind keeps the marker to a real list number: it must open a token,
> never trail one, so a stray "…up to 10) " inside prose cannot pass for an item.

**`const SUBORDINATE_CLAUSE_RE = /^(?:and |or |but |then )?(?:when(?:ever)?\b|while\b|during\b|if\b|once\b|after\b|before\b|upon\b|every\b|each time\b|the first time\b|at the (?:start|beginning|end)\b|for (?:every|each)\b|as long as\b)/i;`**  — L1825

> A sentence opening with a run of these is stating conditions, not effects.

**`const ATTACK_NAME_COLON_RE = /all[- ]?out assault\s*(?:i{1,3}|Ⅰ|Ⅱ)?\s*(?:\([^)]*\))?\s*$/i;`**  — L1828

> "Activates All Out Assault I: Moskva once every 12 times…" — this colon ties the tier to
> the class the attack is named after, it introduces nothing. Only an exact "All Out
> Assault" + optional tier is excluded, so "All Out Assault II only: …" keeps its colon.

**`function buildClauseBlock(sentence) {`**  — L1852

> Bullets are for the skills that actually need them: two or more actions, or a condition
> piled up from two or more clauses. A plain "Every 20s: fires a barrage." reads fine as
> one line and stays one line — 22% of the dataset's descriptions produce bullets.

**`if (items.length && (items.length >= 2 || leadingConditionClauses(header).count >= 2)) {`**  — L1860

> A condition with nothing after its colon has to stay a plain line: it is the caption
> of whatever follows (a numbered list, usually), and bulleting it would emit an empty
> list ("When the battle starts, and every 20s:", Sakawa).

**`function governsSegmentList(segments) {`**  — L1876

> A ";" list only reads as a list when a single condition at the front governs all of it.
> If no segment opens with a condition the segments are independent statements (Albion's
> "Unblemished White Cliffs"), and if several bring their own condition they are parallel
> pairs, not items (Nubian's "It's Cleaning Time!"). Both cases become standalone blocks
> instead of bullets dangling under nothing.

**`function startSentence(html) {`**  — L1886

> Promoting a ";" clause to a block of its own makes it a sentence, so it gets sentence
> punctuation: the ";" it used to hang off becomes a period, and its first letter is
> capitalized. Skips any leading tag so "<b>if</b> there are…" is still caught.

**`function firstTopLevelBoundary(text) {`**  — L1893

> A numbered item routinely runs for several sentences (Béarn META's "1) Main Gun: …" spans
> three), so the list has to be carved out before sentences are split — otherwise each item
> is scattered across blocks and its "1)" is left stranded mid-paragraph. Items therefore
> hold blocks of their own rather than a string, and the sentence that introduces the list
> is lifted out to caption it.

**`let tail = "";`**  — L1914

> Only the last item has no marker after it to bound it, so it would otherwise run to the
> end of the skill and swallow whatever follows the list (A2's "Berserk Mode lasts for up
> to 40s…"). Items are parallel by nature, so the last one is cut to the granularity its
> siblings use: if none of them runs past a sentence end, neither does it.

**`const caption = blocks.length && blocks[blocks.length - 1].text ? blocks.pop().text : null;`**  — L1932

> The sentence right before the list introduces it, so it captions the bullets instead of
> sitting above them as an unrelated paragraph.

**`blocks.push({ header: caption, list: spans.map(span => buildSentenceBlocks(span.replace(/[;\s]+$/, ""))) });`**  — L1935

> Items are often chained with ";" as well as numbered; the bullet already separates them,
> so a trailing one would just dangle (Glorious META's "Rosen Mark").

**`const sentence = rawSentences[i].trim() + (i < rawSentences.length - 1 ? "." : "");`**  — L1946

> The separator swallowed the period closing every sentence but the last, so give back
> exactly those. Testing for a trailing period instead would both miss the ones hidden
> behind a closing tag ("<b>max Health.</b>", Juneau) and invent one for a description
> that genuinely ends without it ("(10s cooldown, starts on cooldown)", Atago).

**`const ULRICH_PROSAIC_HEADER = "As long as this ship is afloat, whenever ANOTHER fleet engages in one of its first five battles this sortie:";`**  — L1965

> Ulrich von Hutten's "Revolutionary's Prosaic" writes its 2-item list as two full
> sentences (periods) instead of the semicolons every other multi-item list in this
> dataset uses, so the second item ("Increase the Crit DMG Dealt...") can't be
> recognized as continuing the first item's list — it falls through to a plain,
> unbulleted paragraph instead of a second bullet under the same condition (reported:
> "il manque un -"). A general "a subjectless sentence continues the previous list"
> rule was tried and rejected: checked against the whole dataset, it produces 65
> candidates, most of which are NOT continuations (bare-imperative phrasing is just
> how this dataset writes ANY effect, conditional or not), and at least one — Vanguard's
> "Scatter, Minions of Darkness!" — would have been merged WRONGLY, since its "next"
> sentence actually opens its own distinct condition ("30s after that battle starts:")
> that a blanket rule can't tell apart from a true continuation. Matched on this one
> skill's exact header text instead, which is safe precisely because it's practically
> impossible for another skill to carry the same sentence verbatim.

**`const SKILL_MODE_TAG_RE = /(?:<\/?b>|\s)*\[(Regular play|Regular|Operation Siren only|Operation Siren|Exercise only|Non-Exercise Only)\](?:<\/?b>|\s)*/gi;`**  — L1991

> Some skills describe two alternative versions of themselves, one per game mode, marked
> with the wiki's own bracketed tags — Alabama's "Just Gettin' Fired Up" is a full Regular
> description followed by a full Operation Siren one. Run together they read as a single
> list of effects, hiding the fact that only half of it applies at a time, so each tag
> starts its own labelled section.
> 
> Only these six tags are modes. Other bracketed spans are status names that belong in the
> prose ("[Pursued]", "[Expurgating Flame]", "[Venus Concoction]") — they are told apart by
> this explicit list plus the position check below, since a status name is referenced
> mid-sentence while all 77 mode tags in the dataset sit at a sentence boundary. Reno's is
> wrapped in <b>, hence the tags consumed on either side.

**`const MECHANIC_CUE_RES = [`**  — L2009

> Some skills name a mechanic of their own — "Berserk Mode" (A2), "Frostshred" (Moskva),
> "[Pursued]" (Algérie META) — then spend several sentences describing it, which is what
> buries the rest of the skill. Those sentences get grouped under the mechanic's name.
> 
> Detection is deliberately narrow, since a wrong grouping is worse than none: the name has
> to be introduced by one of these cue verbs AND reused later, so ordinary capitalized game
> vocabulary ("Main Guns", "Max HP") can never qualify.

**`const NAMED_MECHANIC_STOPLIST = new Set(["lv", "dmg"]);`**  — L2043

> The cue verbs occasionally pick up bookkeeping instead of a name: "inflicts Lv.1 Holy
> Judgment" (Alsace) yields "Lv", and "inflicts DMG up to 6 times" (Little Prinz Eugen)
> yields "DMG". These two are the only ones in the dataset, so they are named outright
> rather than filtered by a minimum-length rule that would be arbitrary either way.

**`function namedMechanics(html) {`**  — L2049

> The names to color inside one skill's own text. Looser than what earns a section: a name
> only has to be coined and then reused, whether or not the sentences around it happen to
> form one uninterrupted run. Mode tags are stripped first so "[Operation Siren]" can't be
> read as a mechanic by the bracket cue — it has its own color already.

**`const uses = text.match(new RegExp("\\b" + escapeRegExp(name) + "\\b", "gi"));`**  — L2059

> Naming something once is just a sentence — the color has nothing to connect it to.

**`function introducesMechanic(text, name) {`**  — L2065

> Entering the mechanic and leaving it are transitions, not part of the state: each carries
> its own trigger and reads on its own, so they stay outside the section rather than opening
> and closing it (A2 — "…: enters Berserk Mode." above, "When Berserk Mode ends: …" below).
> What the label then covers is only what holds while the mechanic is active.
> Recognising the entry sentence may be looser than discovering the name in the first place:
> this only ever shrinks a section that already exists, so an extra verb here cannot invent
> one anywhere (Momo Belia Deviluke hands out Plan Execution with "gives", which is not a
> discovery cue — the name is found on a later "grants" instead).

**`function findMechanicRun(blocks) {`**  — L2088

> The blocks describing a mechanic have to form one uninterrupted run that leaves something
> outside it — a section covering the whole skill explains nothing (Moskva's "Unyielding
> Valor", where every sentence is about it). A second name inside the run means the split
> would be arbitrary, so nothing is grouped at all (Oumi's Elegant/Besotted pair).

**`let { first, last } = run;`**  — L2112

> Both eligibility tests above run on the untrimmed run on purpose: trimming only ever
> shrinks it, so a run rejected for covering the whole skill stays rejected instead of
> sneaking in through a transition sentence being moved out.

**`function withMechanicSection(blocks) {`**  — L2121

> Mode-split skills are left alone: they already carry a label, and nesting a second one
> inside would compete with it.

**`const impliesRegular = /Operation Siren/i.test(marks[0].label);`**  — L2148

> Text sitting above an Operation Siren tag with no tag of its own IS the regular
> version — the three skills that spell both tags out confirm the pairing. An explicit
> [Regular play] or [Exercise only] section means the opposite: what precedes it is a
> shared preamble (U-2501, Honoka), so it stays unlabelled.

**`function balanceBoldTags(html) {`**  — L2162

> No <b> currently spans a split point anywhere in the dataset, but a fragment that ends
> mid-bold would otherwise bold everything after it, so each one is closed off and the
> tag reopened on the next.

**`const LONE_BOLD_TOKEN_RUN_RE = /(?:<b>[^\s<>]+<\/b>\s*){2,}/g;`**  — L2203

> A source data artifact, not a bug in this app's own markup: 21 skills dataset-wide
> (Belfast's "Smokescreen: Belfast" the worst, 60 words) have long runs of
> individually-<b>-wrapped single tokens — "<b>Increases</b> <b>this</b> <b>ship's</b>
> <b>SPD</b> <b>by</b> <b>10.</b>" — almost certainly the wiki's own auto-linker turning
> into bold once tags were stripped down, one word at a time wherever it recognized a
> term. A single tag wrapping a whole phrase together ("<b>(Upon Retrofit)</b>") is the
> normal, clearly-intentional pattern used everywhere else and is left completely alone —
> this only strips a run of 2+ back-to-back single-token tags (no space inside any of
> them), which is what turns an entire sentence gold (`.skill-desc b`/`.interaction-desc
> b`) with no actual emphasis being communicated. Never changes what text is shown, only
> removes the accidental bolding.

**`function getSkillsForState(ship, isRetrofit, isAugmented, isFateSim) {`**  — L2241

> Some retrofit skills replace a base skill and say so in their own description,
> e.g. "(Replaces Burn Order)". We use that text to pick which half of the skill
> list belongs to the base ship vs. the retrofitted one.
> The wiki marks each skill's name with "(R)" if it requires retrofit, or "(Aug)" if
> it's a Unique Augment variant — a separate equipment-like system from retrofit.
> isModified/isRetrofitVersion (precomputed at build time from "(R)" + "(Replaces X)")
> tell us which skill a retrofit skill replaces, so the old one can be hidden.
> Unique Augment and Fate Simulation skills both always immediately follow the base
> skill they replace in the source data, so that adjacency (not name-matching, which
> isn't consistent across ships) is what pairs an "(Aug)"/"(FS)" skill with the one it
> swaps out. Fate Simulation is a Research-ship-only mechanic that (like Augment) only
> ever changes skills — no stats, art, or rarity change like a real Retrofit.

**`let skillsAtMaxLevel = false;`**  — L2267

> Shared by the "Skills" section header toggle and the per-skill ones. The last state the
> user picked sticks across re-renders (flipping Retrofit/Augment) and across characters,
> so the choice only has to be made once per session rather than on every skill of every
> ship opened.

**`function syncSkillsMaxLevelToggle() {`**  — L2294

> The header toggle reads as "on" only while every skill under it is, so flipping the last
> one by hand keeps the two in agreement instead of leaving the header stale. Skills with
> no level-scaled value at all carry no toggle, hence no header button either.

**`let interactionAtMaxLevel = false;`**  — L2313

> Same "Max Level" control as Skills, adapted for Interaction's pagination: most entries
> aren't in the DOM at any given time (only the current page of each category), so unlike
> skillMaxLevelToggles (one flat array built once per modal open) this reads whatever
> toggles are ACTUALLY on screen right now via a DOM query, and looks up each one's paint
> function from a WeakMap keyed on the toggle element itself — populated once per toggle
> in buildInteractionItem, pruned automatically by GC once its page is replaced, so it
> never needs manual bookkeeping across page/category changes.

**`if (isRetrofit && ((skill.isModified && skill.isRetrofitVersion) || skill.isNewOnRetrofit)) {`**  — L2355

> Highlight the skill(s) that changed with this retrofit, framed in the rarity
> color the ship just gained — covers both skills that replace an older one and
> skills that are brand new on retrofit, but never its pre-retrofit counterpart
> or unrelated Unique Augment skills.

**`const mechanics = namedMechanics(atBase);`**  — L2416

> Only the numbers differ between the two, so the mechanic names are the same either
> way and are found once rather than on every repaint.

**`const paintDescription = (atMaxLevel) => {`**  — L2420

> Description is sanitized at build time to only ever contain plain text and <b> tags,
> used here to keep the wiki's own "important point" highlighting.

**`if (atBase !== atMax) {`**  — L2427

> No toggle on skills whose text holds no level-scaled value at all (a plain
> "increases this ship's FP by 5%" reads the same either way), so the button only
> shows up where it actually changes something.

**`function showGifPreview(path) {`**  — L2454

> Shown over the character portrait (left side of the modal) rather than next to the
> hovered icon, so the barrage table's numbers on the right stay fully readable while
> previewing the animation. Anchored to the bottom of the portrait via the CSS `bottom`
> property (not `top`) so it lines up correctly regardless of the preview's own height,
> which isn't known until the image finishes loading.

**`function matchSkillForBarrage(ship, barrageSkillName) {`**  — L2478

> A barrage row's skillName can carry extra suffix text the skill itself doesn't have
> (e.g. "All Out Assault - Leander-class II"), so it's matched the same way barrage
> rows were originally paired with skills: longest normalized-prefix match.

**`function getBarragesForState(ship, isRetrofit, isAugmented, isFateSim) {`**  — L2494

> Mirrors getSkillsForState: a barrage row for a base skill is hidden once the toggle
> for whatever replaces it (Retrofit/Unique Augment/Fate Simulation) is switched on,
> and a barrage row for the replacement skill only shows once that toggle is on.

**`const cell = (text, className, clampClass) => {`**  — L2536

> Multi-line clamped cells (name/notes) need the line-clamp box on an inner wrapper —
> applying display:-webkit-box directly to a <td> breaks its table-cell layout.

**`const gifWrap = document.createElement("div");`**  — L2560

> The flex row of icons lives on an inner wrapper, not the <td> itself — display:flex
> directly on a table cell breaks its table-cell participation (it stops respecting
> vertical-align and can throw off the whole row's height), the same issue as the
> name/notes cells' line-clamp wrappers.

**`const newGifs = (b.gifs || []).filter(g => !shownGifIds.has(g.id));`**  — L2566

> Rows for the same skill (different armor/level breakdowns) share the same
> animation — show it once rather than repeating the identical thumbnail down
> every row.

**`img.src = "assets/gif-icon.png";`**  — L2574

> A single generic "play" icon for every row — the actual per-barrage animated
> gif only ever appears in the big hover preview.

**`const preloadedGifIds = new Set();`**  — L2614

> Hovering used to trigger a cold fetch+decode of the full animated gif (some run to
> 300+ frames), which visibly played in slow motion while the browser caught up. Quietly
> warming the browser's cache for every gif this ship could show — across all
> Retrofit/Augment/Fate Simulation states, not just what's visible right now — means
> it's already decoded by the time the user actually hovers.

**`if (preloadImg.decode) preloadImg.decode().catch(() => {});`**  — L2627

> .src alone only guarantees the bytes are fetched — decode() is what forces the
> browser to actually decode every animation frame ahead of time, off-screen.

**`const SKILL_MARKER_VARIANT = {`**  — L2642

> Same label/color convention already used for the ship's own Retrofit/Unique
> Augment/Fate Simulation toggles at the top of the modal — reused here for the
> Interaction tab's per-entry "+" button so it reads as the same concept everywhere,
> covering all three "+" mechanisms (a handful of "+" skills carry no marker at all —
> e.g. Drake's "Flintlock Burst (A)+" — those fall back to the generic label/color).

**`function stripHtml(html) {`**  — L2660

> Strips the wiki's "(Replaces Old Skill Name)" build note some retrofit/Aug/FS skills
> carry — it's bookkeeping about which skill this one swaps out, not battle text, but
> the replaced skill's own name can coincidentally contain a hull-type word (e.g.
> "(Replaces Pocket Battleship)"), which would otherwise register as a false interaction.

**`const ENEMY_TARGET_CUE_RE = /\b(damage dealt to|dmg dealt to|damage dealt against|dmg dealt against|damage against|dmg against|deals?\s+to|deals?\b[^.]{0,25}\bdamage to|dmg to|damage to|against enemy|against enemies|dmg taken by enemy|damage taken by enemy|enemy(?:'s|s)?\s+(?:ships?|fleet|vanguard|main fleet))\b/i;`**  — L2668

> Many "Hunter" skills read like "Increase own damage dealt to Battleships by 4%" —
> bonus damage against an ENEMY of that hull type/nation, not a fleet buff for an ALLY
> of that type. Since this calculator is ally-team-composition only (no PvP/Exercise
> matchups), a match is only counted when the local text around it doesn't carry one of
> these enemy-targeting cues. This is what excludes e.g. Centaur's "damage dealt to
> Battleships" from showing up as an interaction with Izumo (a Battleship). Covers both
> "damage dealt/dealt to" phrasing AND the bare "DMG to X" / "DMG this ship deals to X"
> shorthand the wiki also uses for the same Hunter-bonus concept.

**`const ENEMY_IMMEDIATELY_BEFORE_RE = /\b(an?\s+)?enem(?:y|ies)('s)?\s*$/i;`**  — L2677

> The word "enemy"/"enemies" (optionally with a leading article, e.g. "an enemy") right
> before ANY category match — "enemy Royal Navy CL", "enemy DDs", "enemy Submarines" —
> covers every hull-abbreviation/nation combination without enumerating each one.

**`const AGAINST_CUE_RE = /\bagainst\s*$/i;`**  — L2681

> "Hit Rate against DDs" (Warspite) is the same Hunter-bonus concept as "DMG against
> DDs" but for a different stat — rather than list every stat name, treat "against"
> immediately before any match as enemy-targeting in general, since nothing in this
> dataset ever buffs an ally "against" something (that phrasing is PvP-only).

**`const ALL_OUT_ASSAULT_CUE_RE = /all out assault/i;`**  — L2687

> Every ship's first skill is almost always named "All Out Assault", whose own text just
> names the special-attack variant after the ship's own class ("triggers All Out Assault
> - Deutschland Class"). That's a barrage's flavor name, never a fleet buff — Deutschland
> mentioning her own class here doesn't mean she buffs other Deutschland-class ships.

**`const NEGATIVE_CONDITION_CUE_RE = /\b(without|no)\s+(other\s+)?$/i;`**  — L2693

> "If sortied WITHOUT other Battleships: increases OWN damage" (Tirpitz) is a self-only
> buff gated on the ABSENCE of ships of that type — the opposite of an interaction with
> one. "fires a barrage FROM battleship Hiranuma" names a summoned unit's own type, not
> an allied ship in the fleet.

**`const SOLO_FLEET_CUE_RE = /\b(consists|comprised)\b[^.]{0,15}\bonly\b/i;`**  — L2699

> "If your Vanguard consists only of this ship..." (Bolzano META) is also a solo-fleet
> condition — it only activates when NO OTHER Vanguard ship is present, so it can't be an
> interaction with one. Checked after the match since the fleet/role word comes first
> ("your Vanguard consists only of...").

**`const SOLO_FLEET_BEFORE_RE = /\bis\s+the\s+only\s+ship\s+remaining\s+in\s*(?:your\s+|the\s+)?$/i;`**  — L2704

> "...if this ship is the only ship remaining in your Vanguard..." (Acasta) is the same
> solo-fleet condition as SOLO_FLEET_CUE_RE but phrased the other way round — "only"
> comes BEFORE the fleet/role word instead of after "consists/comprised" — so it needs
> its own check against the text immediately preceding the match.

**`const EQUIPMENT_CUE_RE = /\b(gear|aircraft|weapons?|main guns?|equipment)\b/i;`**  — L2709

> "If this ship has Royal Navy gear/aircraft equipped" or "while equipping a CL Main Gun"
> is about this ship's OWN LOADOUT choice, not about having an allied ship of that
> nation/hull in the fleet — completely unrelated to team composition. Scanned forward to
> the next sentence boundary (not just immediately after) since the equipment noun is
> often past an "or Other Nation"/comma-separated list of acceptable nations
> ("Eagle Union, Iris Libre, or Vichya Dominion aircraft equipped").

**`const FRONTMOST_POSITION_CUE_RE = /\bin the frontmost position (?:of|in)\s*(?:the|your|this ship's)?\s*$/i;`**  — L2721

> "If this ship is (not) in the frontmost position of/in the/your Vanguard: increases
> this ship's X" (Deutschland, Hermione, Alfredo Oriani, Admiral Hipper μ) is a
> self-positional check, not about which OTHER ships share the fleet — unlike
> "...applied to the frontmost ship of the Vanguard", which does target a (possibly
> different) ally and must NOT be caught by this guard. Both "of" and "in" precede the
> fleet word in real skill text ("position of your Vanguard" / "position in your
> Vanguard"), and the determiner varies ("the"/"your"/"this ship's") — all three are
> self-referential, so all are accepted here.

**`const IF_CONDITION_PREFIX_RE = /\bif\s+(?:there\s+(?:is|are)|this ship (?:is|has)(?:\s+not)?|placed)\b/i;`**  — L2731

> "If this ship is (NOT) your frontmost {Vanguard/Main Fleet} ship: <self-only effect>"
> (Dmitri Donskoi, Admiral Hipper META's first clause) is also a self-positional
> condition — but unlike FRONTMOST_POSITION_CUE_RE it doesn't use the word "position" at
> all, so it needs a separate cue. Deliberately narrow (requires the "if this ship is"
> prefix) so it does NOT catch genuine target phrasing like "...around your frontmost
> Vanguard ship" (Admiral Hipper META's second clause, Essex, Elbe) which has no such
> prefix and must stay matched.
> "placed" is the one status word the wiki also writes with an elided subject ("if
> placed in the backmost position...", Carabiniere's "Fuoco di Copertura!+") instead of
> the usual "if this ship is placed..." (her own base "Fuoco di Copertura!", same
> clause, same meaning) — checked dataset-wide, only 2 occurrences (Carabiniere,
> Seattle's "Dual Nock"), both genuinely elided "this ship is", so folded in here rather
> than given its own guard. Without it the base version of a "+" pair could get
> structurally gated (correctly excluded) while the "+" text describing the identical
> condition slipped through ungated purely because of this phrasing difference —
> inconsistent, not a case where the "+" text is actually less conditional.

**`const BROADER_FLEET_TARGET_RE = /\b(your vanguard|vanguard fleet|vanguard ships?|main fleet|your fleet|all your ships?|all ships|allied ships?|other ships?|each ship|every ship|frontmost vanguard ship|frontmost main fleet ship|frontmost ship)\b/i;`**  — L2748

> Broader fleet-wide target language — if a skill's effect clause (the part after a
> condition resolves with a colon) mentions any of these, it's a genuine ally-facing
> buff even though it was reached via an "if there is/are.../if this ship is..."
> condition (e.g. "if there are 3 ships in your Vanguard: increases your Vanguard's
> EVA..."). Its ABSENCE from the effect clause is what flags a self-only buff whose
> condition merely happened to mention the fleet/role word for headcount/position
> purposes (Brest, Admiral Hipper μ, Bremerton, Alfredo Oriani's Frontline Scoop).

**`function clauseBefore(text, index) {`**  — L2757

> Returns the text of the clause containing `index` — from the nearest preceding
> colon/sentence boundary up to `index` — so an "if...:" condition already closed by an
> earlier colon isn't mistaken for still being open (Baltimore μ's "if there is a CV,
> CVL, or Muse ship in the same fleet: increases this ship's EVA... and increases your
> Vanguard's AA..." — the second colon-bounded clause is a plain effect statement, not
> itself a condition, even though an earlier "if" appears further back in the sentence).

**`function selfOnlyConditionedEffect(text, matchIndex, matchLen) {`**  — L2769

> A match sitting inside an "if there is/are.../if this ship is..." condition, followed
> immediately by a colon whose effect clause never mentions a fleet-wide target, is a
> self-only buff that merely used the fleet/role word as a headcount or positional
> condition (Brest: "if there are 3 ships in your Vanguard: increases this ship's EVA");
> requiring the colon to sit right after the match is what keeps this from misreading
> genuine targets like "...will also apply to your Vanguard ship with the lowest HP"
> (Ganj-i-Sawai), where the match is already inside the effect clause, not the
> condition, and no colon immediately follows it.

**`const COMMA_SELF_ONLY_EFFECT_RE = /^\s*(?:\([^)]{0,80}\)|\))?\s*,\s*(?:and\s+)?(?:increases?|decreases?|restores?|grants?|gains?)\s+this ship/i;`**  — L2788

> Same self-only-condition idea as selfOnlyConditionedEffect, but for skills that use a
> comma instead of a colon to separate the condition from the effect (Acasta: "if this
> ship is the only ship remaining in your Vanguard (The ship that sinks does not have to
> be in the Vanguard), increase this ship's damage dealt..."). Acasta's clarifying aside
> repeats "Vanguard" a second time inside the parenthetical itself, so this is checked
> against EVERY match occurrence (not just the first) — allowing an optional trailing
> "(...)" aside, or just its closing ")" when the match sits inside one, before the
> comma and the self-only verb.

**`const FLEET_LEADER_SLOT_RE = /^\s*Fleet Leader\b/i;`**  — L2801

> "Vanguard Fleet Leader (First Slot)" (Bilibili's 22/33 pair) names a SLOT position —
> being sortied first — not a category of ships; the buff it gates is explicitly scoped
> to "both 22 and 33" by name, never a general Vanguard-wide effect.

**`function sentenceBefore(text, index) {`**  — L2806

> Per explicit user instruction (2026-08-18): a fleet-wide buff gated behind a
> compositional/positional/status condition that ISN'T guaranteed simply by the
> candidate ship's own nation/hull/role — needing a specific OTHER ship type present
> (Baltimore μ: "if there is a CV, CVL, or Muse ship in the same fleet"), a specific
> slot/role assignment on the buffing ship (Admiral Zenker: "if this ship is the
> Flagship" — the fleet's leader slot specifically, distinct from just being "a Main
> Fleet ship"; frontmost/backmost/center position; Collett: "if this ship has the
> highest AA amongst your Vanguard"), or a headcount threshold ("if there are 3 ships in
> your Vanguard") — no longer counts as a genuine interaction AT ALL, even when the
> effect clause genuinely targets the whole fleet (previously only excluded when the
> effect turned out to be self-only — see selfOnlyConditionedEffect above). This is a
> stricter standard than the "conditions assumed met" philosophy Effective Stats still
> uses; the user drew the line specifically at buffs that depend on something beyond the
> candidate's own category membership, not at conditions in general (a periodic timer or
> "when this ship fires her Main Guns" action-trigger still eventually fires regardless
> of team composition, so those are untouched — only "if there is/are..." and "if this
> ship is/has..." state-gates are treated as unreliable).
> 
> Scoped to the whole SENTENCE (bounded by the nearest preceding period, not just the
> nearest colon like selfOnlyConditionedEffect uses) since this game's skill text chains
> multiple colon-separated effect clauses under one earlier "if", using colons as plain
> clause separators rather than to close the condition — Baltimore μ's "if there is a
> CV, CVL, or Muse ship in the same fleet: increases this ship's EVA... and increases
> your Vanguard's AA..." has the match past a SECOND colon, but it's still governed by
> the "if" before the first.

**`const SORTIED_WITH_GATE_RE = /\bsortied with\b/i;`**  — L2836

> "(While/When/If) sortied with [a ship/equipment]..." (Arizona META: "...while sortied
> with a ship that has the 'Pearl's Tears' equipped: 50% chance to restore... to the
> ship in your Vanguard...") is the same third-party dependency as "if there is a
> CV/CVL/Muse ship" — just phrased as a partner requirement instead of a presence check.

**`const NAME_MATCH_STOPLIST = new Set(["Vanguard", "Fortune", "The 2nd"]);`**  — L2846

> A handful of ships happen to be named after generic game terms or ordinary words
> ("Vanguard" is a Royal Navy Battleship, "Fortune" a Royal Navy Destroyer, "The 2nd" an
> SSSS collab ship) — matching their name would mostly catch the word's ordinary use
> ("the Vanguard fleet", "tells a fortune", "the 2nd time"), not real references to them.

**`function otherNationImmediatelyBefore(text, matchIndex, ownNation) {`**  — L2856

> "Dragon Empery Main Fleet ships" or "Sakura Empire CVs" restrict a buff to ships that
> are BOTH that nation AND that role/hull — not to every Main Fleet ship, or every CV.
> A role/hull match immediately preceded by a DIFFERENT nation, or a nation match
> immediately followed by a DIFFERENT hull, means the compound condition excludes this
> candidate ship, so it isn't a genuine match for it.

**`const NATION_LIST_CONNECTOR_RE = "(?:ships?|vessels?|forces|fleet members|CLs?|CVs?|CVLs?|CAs?|CBs?|BBs?|BCs?|BBVs?|DDs?|DDGs?|SSs?|SSVs?)";`**  — L2866

> Same compound-restriction idea as above, but for the much more common phrasing where
> the nation and the role word aren't directly glued together — "Northern Parliament
> and Dragon Empery ships in the Vanguard Fleet" (Chang Chun), "Iron Blood ships in your
> Main Fleet" — a short run of connector words (a hull noun, "in"/"of", "the"/"your")
> sits between the nation list and the match. Captures the whole nation list ending
> right before the match, then only excludes candidates whose OWN nation isn't among
> the names actually listed — so a Dragon Empery (or Northern Parliament) candidate
> still matches Chang Chun correctly, while every other nation is excluded from it.

**`const NATION_LIST_TRIGGER_PREFIX_RE = /\b(when|if|once|whenever|or\s+an?|another|per)\s*$/i;`**  — L2875

> A nation name right before "ship(s) in your Vanguard" isn't always naming who the buff
> is FOR — "when this ship or a Sardegna Empire ship in your Vanguard falls below 30%
> max HP..." (Alfredo Oriani) names who can TRIGGER the effect, while the effect itself
> ("...for all your ships in it") is unrestricted. Only a nation list reached through a
> beneficiary preposition ("of"/"for"/"all") is an actual restriction; one reached
> through a condition/alternative word ("when"/"if"/"once"/"or a"/"another"/"per") is
> just naming a qualifying trigger, not narrowing the recipients.

**`function selfNameRanges(text, skillName) {`**  — L2903

> Where a skill's OWN name literally recurs inside its own description ("Ashen Might -
> Wichita II only: ..." inside the skill named "Ashen Might - Wichita") — that's the
> skill echoing its own title, never a reference to another ship, even when the name
> contains one (Wichita META's own skill mentions "Wichita", her un-retrofitted self).
> Returns character ranges to skip rather than deleting the text outright, since deleting
> it would also remove cue phrases other guards depend on (e.g. "All Out Assault").

**`if (text[matchIndex - 1] === "(") return false;`**  — L2927

> A hull abbreviation glued directly onto a preceding word in parentheses, e.g.
> "Kaga(BB)", disambiguates which FORM of a specific named ship is meant (Kaga has
> both a Carrier and a hidden Battleship form) — not a reference to Battleships in
> general.

**`if (category === "name" && ALL_NATION_TERMS.some(nation => nation.length > matchLen && new RegExp('^${escapeRegExp(nation)}\\b', "i").test(text.slice(matchIndex, matchIndex + 30)))) return false;`**  — L2938

> "Eagle" is itself a ship name, but also the first word of the "Eagle Union" nation —
> without this, every "Eagle Union" mention would double as a false "named ship" match.

**`if (/^\s*guns?\b/i.test(text.slice(matchIndex + matchLen, matchIndex + matchLen + 8))) return false;`**  — L2946

> "AP BB guns" names a weapon/ammo category (Battleship-caliber main guns), not a
> ship in the fleet.

**`function baseTextMentionsCategory(skill, re) {`**  — L2972

> Used when a "+" skill matched on its own and computeInteractions wants to anchor the
> entry on its base version instead (see the isPlusVariant branch below). Two different
> situations both reach here and need different answers:
> - The base text never mentions the category term at all (Chapayev's "Cavalier of the
>   Ether" is pure self-buff, no "Vanguard" anywhere) — safe to show as the default,
>   un-toggled text: it isn't claiming a match of its own, just showing what the skill
>   looks like without the "+"'s added clause.
> - The base text DOES mention the term, but only through a clause that fails its own
>   guards ("if there are 2 or more Tempesta ships afloat...this HP recovery effect will
>   also apply to your Vanguard ship with the lowest HP", Ganj-i-Sawai) — showing that as
>   the default, non-toggled text would silently reintroduce exactly the kind of
>   unreliable match structurallyGatedMatch (and friends) exist to keep out, just one
>   level removed through the base/+ pairing mechanism. Not safe to anchor on.

**`function isSafeBaseAnchor(skill, category, re, ship) {`**  — L3003

> A base skill is safe to anchor a standalone "+" match on if it either doesn't mention
> the category term at all, or mentions it AND genuinely qualifies on its own — never
> when its only mention is one that a guard has disqualified.

**`function computeInteractions(ship) {`**  — L3011

> Finds every OTHER ship whose skill text references this ship's nation, hull type,
> fleet role (Vanguard/Main), class, or name directly — the interaction surface a
> team-composition calculator would need to know about. Purely a text-pattern scan
> over each skill's plain-text description; it can't verify in-battle conditions
> (fleet composition counts, HP thresholds, etc.), so a match here means "this skill
> COULD affect this ship", not "always does".

**`const avoidAviationPrefix = !text.startsWith("Aviation ") ? "(?<!Aviation )" : "";`**  — L3026

> "Battleship" and "Submarine" are themselves valid hull types but also plain
> substrings of the separate "Aviation Battleship"/"Aviation Submarine" hull types —
> without this guard, an "Aviation Battleship" mention would wrongly count as an
> interaction for a plain Battleship.

**`const stem = ship.class.replace(/\s*Class$/i, "");`**  — L3039

> ship.class already carries the "Class" suffix ("Izumo Class"), so the pattern is
> just that stem followed by "class"/"-class"/" class" — not the stem AND the word
> "class" twice, which is what a naive `${ship.class} class` would require.

**`if (ship.displayName && ship.displayName.length >= 3 && /[a-zA-Z]/.test(ship.displayName) && !NAME_MATCH_STOPLIST.has(ship.displayName)) {`**  — L3045

> Skip very short / purely numeric display names (e.g. "22") — they'd match almost
> any damage number or percentage in unrelated skill text. Also skip names that
> collide with a reserved game term ("Vanguard" and "Fortune" are both real ship
> names too) — virtually every match would be the generic term, not the character.

**`const ownNameRanges = selfNameRanges(text, entry.skill.name);`**  — L3061

> A skill that repeats its own name inline ("Ashen Might - Wichita II only: ...")
> isn't referencing another ship even if that name contains one — e.g. Wichita
> META's own skill title contains "Wichita", her un-retrofitted self's name.

**`const isPlusVariant = entry.skill.name.endsWith("+");`**  — L3074

> A skill's "+" enhanced version (Retrofit/Unique Augment/Fate Simulation — "+"
> shows up under all three, not just Augment) usually just extends the base
> text, so both independently match the same category and would otherwise show
> as two near-duplicate rows for the same ship. Merge them into one entry with
> the base version as the anchor and the "+" text attached for an in-place
> toggle, rather than showing both (2B x Chang Chun's "Mutual Assistance" /
> "Mutual Assistance+", a Retrofit pair, was the reported case).

**`const baseSkillCandidate = isPlusVariant ? entry.ship.skills.find(sk => sk.name === pairName) : null;`**  — L3099

> The "+" text matched entirely on its own (its base version's own text has no
> ally-facing language at all, so it never independently matched anything to
> merge into — Chapayev's "Cavalier of the Ether" is pure self-buff; only the
> "+"/Aug version's added clause mentions "a ship in your Vanguard"). Still look
> up that base skill on the same ship and anchor the entry on IT instead of the
> "+" skill, exactly like the merge case above — so this renders with the same
> "base text by default, click the marker's own toggle to reveal the +/enhanced
> text" behavior as every other paired entry, rather than silently showing the
> "+" text with no way back to what the ship's skill looks like without it
> (the reported bug was that there was no way to click back to the base version).

**`const INTERACTION_PAGE_SIZE = 20;`**  — L3128

> How many Interaction entries a category page shows at once — categories like "By
> Fleet Role" regularly run into the hundreds now that computeInteractions no longer
> hard-caps results at 100, so the list is paginated instead of dumping everything (or
> silently truncating it) into one long scroll.

**`const variant = skillVariantInfo(skill.marker);`**  — L3168

> The match only came from the "+" text itself (its base version never
> independently matched, so there was nothing to merge into — e.g. Chapayev's
> "Cavalier of the Ether" is purely self-only, only "Cavalier of the Ether+"
> mentions "a ship in your Vanguard"). There's no un-augmented text to toggle
> back to here, so this is a plain badge, not a button — but it still needs to
> say Retrofit/Augment/Fate Simulation, since the shown text already includes
> that upgrade's bonus and silently showing it as a bare, unmarked skill would
> misrepresent it as a baseline effect every copy of the ship has.

**`const desc = document.createElement("div");`**  — L3186

> Same rendering pipeline as the Skills section (appendSkillDescription: bullets,
> condition/action grouping, bold "important point" spans preserved) rather than a
> flat textContent paragraph — text/enhancedText (stripHtml'd, used for matching by
> computeInteractions) are ignored here in favor of skill.description/
> enhancedSkill.description, the raw HTML those were always derived from 1:1.

**`if (baseAtBase !== baseAtMax || (enhAtBase !== null && enhAtBase !== enhAtMax)) {`**  — L3223

> One toggle covers both descriptions (paints whichever isn't currently shown too),
> so switching the Retrofit/Augment/Fate Simulation variant never lands on the wrong
> level. Only shown when at least one of the two actually has a level-scaled value —
> matches Skills' own "no toggle where it wouldn't change anything" rule.

**`syncInteractionMaxLevelToggle();`**  — L3308

> No-op on the very first call (this category's own `details` isn't attached to
> modalInteractionList yet at that point) — harmless, the loop below re-syncs once
> everything is attached. Matters for a later prev/next click, where it is attached.

**`return [{ name: "Default", type: "Default", painting: ship.painting || ship.thumbnail, icon: ship.thumbnail }];`**  — L3327

> Custom hand-imported ships have no skin list — fall back to their single known image.

**`function updateLevelControlUI(level) {`**  — L3450

> The level control is a set of "notch" buttons for the levels that actually matter
> (1 = base, 100 = normal max, 120/125 = the same retrofit/limit-break breakpoints the
> statsCurve data already uses for hand-imported ships) plus a free-entry number input,
> rather than a continuous slider that makes you hunt for an arbitrary level. Both
> controls stay in sync through one shared setLevel() so clicking a notch updates the
> field and vice versa.

**`if (modalLevelInput.value === "" || Number.isNaN(Number(modalLevelInput.value))) return;`**  — L3478

> Ignore an empty/mid-edit field instead of snapping it to 1 — otherwise clearing the
> field before typing a new number (a common way to replace "1" with "56") would force
> it back to "1" on every keystroke.

**`const skins = effectiveSkins(currentShip);`**  — L3496

> Only jump the displayed art when the user is currently looking at the
> Default/Retrofit pair — browsing an unrelated costume skin stays untouched.

### `style.css`

**`::-webkit-scrollbar {`**  — L31

> Custom scrollbar: slightly wider than the native default, flat (no hover state —
> deliberately no :hover rules below), with click-to-nudge arrow buttons at both ends.

**`.filter-subgroup-label {`**  — L190

> Sub-label for a chip cluster within an existing filter row (e.g. "Research" under
> Rarity) — smaller and without the row-label's min-width, so it reads as a subset of
> the same category rather than a second category.

**`.retrofit-checkbox,`**  — L678

> Retrofit/Unique Augment/Fate Simulation toggles share the same pill shape and only
> differ in their accent color, which also carries through to the custom checkbox dot
> below (styled via currentColor, so no separate color rule is needed per toggle).

**`.level-input::-webkit-outer-spin-button,`**  — L812

> Native number-input spinner replaced with .level-spin buttons below, drawn with the
> same arrow style as the custom scrollbar (::-webkit-scrollbar-button) for a
> consistent look — same SVG shapes/color, no :hover state on either.

**`.modal-section-title-row {`**  — L862

> Section title carrying a control on its right. The margin lines that control up with
> the per-skill toggles below it, which sit inside the skill card's own 0.6rem padding
> and 1px border rather than flush with the list's edge.

**`.stats-grid {`**  — L881

> One-value-per-stat 3-column grid matching the game's own compact stat panel exactly,
> rather than a Base/Real row list — a delta (when boosted) is shown inline in the same
> cell, same as the game does ("478 +178"), since the in-game panel never shows a
> separate base figure.

**`width: 3.8rem;`**  — L916

> Fixed width (not just content-sized) so the value that follows lines up at the same
>   spot in every row of a column — "Armor" and "AA" are very different lengths, and
>   without this the values end up staggered instead of forming a straight column.

**`width: 7.6rem;`**  — L927

> Fixed width sized for the longest realistic content ("12345+12345 (12345)": a
>   5-digit base, 5-digit delta, and 5-digit real value all at once) so every ship's
>   grid comes out the same size — without this, a ship with unusually long boosted
>   values (A2) stretches its columns wider than a ship whose stats stay short and
>   unboosted. Measured directly (getBoundingClientRect() against this exact class,
>   after document.fonts.ready) rather than estimated — 7.40rem for that string in
>   Raleway bold at this font-size, rounded up to 7.6rem for a small safety margin.

**`.max-level-toggle {`**  — L1013

> Pushed to the far right, past the skill name and its type tags. Carries the same
> outline-pill-plus-dot shape as the Retrofit/Unique Augment toggles above, since it is
> the same kind of control — the dot fills in when it's on.

**`.skill-line,`**  — L1070

> One sentence per block. A condition line is set in the brighter body color so the eye
> can find where each set of effects starts; its actions keep the muted color.

**`.skill-condition + .skill-actions {`**  — L1081

> Tighter than the gap between blocks, so a condition reads as attached to its actions
> rather than floating between two of them.

**`.skill-mode {`**  — L1087

> Game-mode sections ("Regular" vs "Operation Siren") — two alternative versions of the
> same skill, only one of which applies at a time. The label and the rail down the side of
> its block share --mode-color, set per section in JS, so the eye can tell at a glance
> where one version stops and the other starts.

**`.skill-actions-blocks {`**  — L1130

> A numbered item can carry several sentences, so its blocks stack inside the bullet.

**`.kw {`**  — L1142

> Recurring keyword highlighting (nations, hull types, fleet roles, Siren) — color is
> set inline per-word via JS, this just keeps the weight consistent everywhere it's used.

**`.kw-mech {`**  — L1148

> Named mechanics — the game's own recurring statuses (Burn, Smokescreen, Armor Break) and
> the ones a single skill coins for itself ("Berserk Mode"). The tint behind the word is
> what separates them from the other two palettes sharing the same sentence: a stat is
> colored and bare, a nation is colored and underlined, a mechanic sits on a chip. The
> tint is derived from the word's own color, so JS still only has to set `color`.
> The tint bleeds outward through a spread shadow rather than horizontal padding: padding
> would widen the inline box and leave the comma or period that follows the name floating
> a space away from it ("enters Berserk Mode .").

**`.kw-num {`**  — L1162

> Skill values (percentages, flat numbers) — made to stand out from the surrounding
> prose via brightness/weight rather than another hue, since the palette already has
> several colors in play.

**`.combat-modifier-pill.has-target {`**  — L1340

> A restriction ("to Light Armor enemies") wraps onto its own line, and the stadium
> shape reads badly around two lines of text — squared off only in that case.

**`.combat-modifier-pill[title] {`**  — L1347

> The whole pill is a tooltip target: the sentence the bonus came from, with whatever
> gated it, is too long to sit in the pill itself.

**`.modal-equipment {`**  — L1361

> One row of slot cards, mirroring the game's Gear panel. Wraps rather than scrolling,
> since six cards do not fit a narrow modal side by side.

**`.equip-tile {`**  — L1378

> The square that will hold the chosen equipment's image, sized and framed like a ship
> card's thumbnail so the slot reads as the same kind of pickable tile. Dashed while
> empty: it describes what the ship can take, not what she carries.

**`.equip-augment .equip-tile {`**  — L1393

> The augment is a separate round socket in the game, not a sixth gear box.

**`.equip-tile-filled {`**  — L1433

> A picked item's tile: rarity-tinted fill/border instead of the empty dashed frame,
> holding the gear's own artwork.

**`.equip-tile-icon-fallback,`**  — L1447

> Only reached if an icon file is missing - the pre-icons text tile, kept as the
> graceful fallback equipmentIconImg() swaps in.

**`.equip-picker {`**  — L1463

> Dropdown list of catalog options for one slot, opened by clicking its tile - anchored
> under that slot's own card rather than a single shared floating overlay, same
> "one panel per trigger" shape as the nation-chip subfaction dropdown.

**`.equip-picker-list {`**  — L1497

> A dense grid of gear artwork rather than a list of names - the options are already
> sorted best-first, so rarity-tinted cells also read as bands of decreasing rarity.

**`.equip-picker-caption {`**  — L1528

> Sticks to the panel's bottom edge so it stays readable while the grid scrolls.

**`.interaction-variant-toggle {`**  — L1679

> Per-entry toggle for a matched skill's "+" (Retrofit/Unique Augment/Fate Simulation)
> enhanced version — shown as a small pill next to the skill name rather than a
> section-wide control, so it only affects the one entry it's attached to. Labeled and
> colored per the same convention as the ship's own Retrofit/Augment/FS toggles
> (--tag-color set per-instance in JS from skillVariantInfo()).

**`.interaction-variant-badge {`**  — L1716

> Non-interactive counterpart to .interaction-variant-toggle: shown when a matched
> skill's "+" text has no base version to toggle back to (the base never independently
> matched, so it was never merged into a paired entry) — the shown text already
> includes the Retrofit/Augment/Fate Simulation bonus, so the pastille is always filled
> rather than starting hollow like the toggle's.

**`.interaction-desc-enhanced[hidden] {`**  — L1748

> .interaction-desc's own `display: flex` (needed now that it can hold multiple blocks
> like a skill-mode group) would otherwise outrank the [hidden] attribute's UA-stylesheet
> `display: none` at equal specificity — same fix already applied to .max-level-toggle.


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
regenerate `ships.js` from it (or edit both identically).

Files: `index.html` (structure), `app.js` (all logic, one file, ~1200+ lines), `style.css`.

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
   re-running it just reproduces the already-accepted tradeoff. All three color categories
   are per-entity rather than per-group, so the dataviz skill's 8-hue categorical cap
   doesn't apply to anything in this system — there's no shared group left to keep under 8.
   The one exception is the mechanic palette added 2026-08-19: at N=5 every pair IS worth
   checking and was (closest pair Special Burn/Smokescreen, a comfortable margin; the
   original Flooding blue was moved off `--accent` because the two chip colors sat 32 RGB
   units apart). Do the same for any future set small enough to make it meaningful.

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
   Guns", so it maps to the same string and the duplicate is deduped away — that reproduces
   the wiki exactly without asserting what 21 is on its own. If a future dataset adds a
   code, the unknown-code path is already the graceful one: it disappears from the list.

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

- **Equipment-aware stats** (partially started 2026-08-19 — see feature 9: the slot
  layout now renders, but nothing is equipped and no gear catalog exists): the user has
  explicitly said (2026-08-17) more advanced
  stats that factor in equipment are coming "dès que la partie intéraction et code
  couleurs sont finis" (once the Interaction and color-coding work is finished) — i.e.
  this is the acknowledged next major piece of work, not a maybe. `computeEffectiveStats`
  currently has NO equipment/Meowfficer/Fleet Tech data at all (documented in its own
  comment block in app.js) — when this is picked up, it likely means either extending
  `ships.json` with an equipment/gear dataset (doesn't exist yet — `ship.equipment` in the
  data is loadout SLOT info from the datamine, not a browsable gear item catalog) or
  building one from scratch from wiki equipment pages, neither of which exists yet. Don't
  start this speculatively — wait for the explicit go-ahead the user has signaled is
  coming, since "interaction et code couleurs" being "finished" is the user's call, not an
  inferrable code state.
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

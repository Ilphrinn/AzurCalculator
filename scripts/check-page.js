// Injected into index.html by scripts/check.js: runs the real app functions over every ship and
// writes what went wrong into the page, for the runner to read back.
const report = { ships: 0, runs: 0, errors: [], nonFinite: [], illegal: [], overCap: [], worse: [] };
window.addEventListener("error", event => report.errors.push(String(event.message)));

const isFinite4 = m => ["dps", "dpsAA", "dpsASW", "ehp"].every(key => Number.isFinite(m[key]));
// The figure each single-metric target must never lower compared with the bare built-in loadout.
const TARGET_METRIC = { firepower: "dps", torpedo: "dps", aviation: "dps", antiair: "dpsAA", asw: "dpsASW" };

// Every run is repeated against one boss of each armour, so the armour-aware Optimize path is covered too.
const BOSS_TARGETS = [null, ...["light", "medium", "heavy"].map(armor => BOSSES_DATA.find(boss => boss.armor === armor))];

for (const ship of SHIPS_DATA) {
  report.ships++;
  for (const boss of BOSS_TARGETS) {
    targetBoss = boss;
    for (const level of [1, 125]) {
      for (const retrofit of ship.hasRetrofit ? [false, true] : [false]) {
        const where = `${ship.displayName} lv${level}${retrofit ? " retrofit" : ""}${boss ? ` vs ${boss.name}` : ""}`;
        try {
          // Optimize's eHP simulation reads the modal's level and retrofit state, as the UI sets them.
          currentLevel = level;
          retrofitApplied = retrofit;
          clearEquippedGear(ship);
          const bare = computeEffectiveStats(ship, level, retrofit, false, false);
          if (!bare || !ship.equipment) continue;
          const bareMetrics = computeCombatMetrics(ship, level, bare, boss && boss.armor);
          if (!isFinite4(bareMetrics)) report.nonFinite.push(`${where}: empty loadout`);
          for (const armor of ["light", "medium", "heavy"]) {
            if (!isFinite4(computeCombatMetrics(ship, level, bare, armor))) report.nonFinite.push(`${where}: vs ${armor}`);
          }
          for (const cap of ["Ultra Rare", "Elite"]) {
            equipmentRarityCap = cap;
            for (const target of availableOptimizeTargets(ship)) {
              report.runs++;
              equipmentTarget = target;
              clearEquippedGear(ship);
              optimizeEquipment(ship, bare, level);
              const metrics = computeCombatMetrics(ship, level, computeEffectiveStats(ship, level, retrofit, false, false), boss && boss.armor);
              if (!isFinite4(metrics)) report.nonFinite.push(`${where} ${cap} ${target}`);
              for (const [slotKey, item] of Object.entries(equippedGear[ship.id] || {})) {
                if (slotKey === "augment") continue;
                if (!equipmentOptionsForSlot(ship.equipment[slotKey], ship).some(option => option.id === item.id)) {
                  report.illegal.push(`${where} ${target}: ${item.name} in slot ${slotKey}`);
                }
                if (!equipmentWithinCap(item)) report.overCap.push(`${where} ${cap} ${target}: ${item.name} (${item.rarity})`);
              }
              const metric = TARGET_METRIC[target];
              if (metric && metrics[metric] + 1e-6 < bareMetrics[metric]) {
                report.worse.push(`${where} ${cap} ${target}: ${metric} ${bareMetrics[metric].toFixed(2)} -> ${metrics[metric].toFixed(2)}`);
              }
            }
          }
        } catch (error) {
          report.errors.push(`${where}: ${error && error.stack || error}`);
        }
      }
    }
  }
  targetBoss = null;
  clearEquippedGear(ship);
  try {
    openModal(ship);
    setLevel(125);
    closeModal();
  } catch (error) {
    report.errors.push(`${ship.displayName} modal: ${error && error.stack || error}`);
  }
}

// The tabs: every item and augment opens its detail, and a Targets pick is the boss Optimize reads.
try {
  for (const view of ["depot", "augments", "targets", "port"]) showView(view);
  if (depotGridEl.childElementCount !== EQUIPMENT_DATA.length) report.errors.push(`Depot shows ${depotGridEl.childElementCount}/${EQUIPMENT_DATA.length} items`);
  if (augmentGridEl.childElementCount !== AUGMENTS_DATA.length) report.errors.push(`Augments shows ${augmentGridEl.childElementCount}/${AUGMENTS_DATA.length}`);
  if (targetRowsEl.childElementCount !== BOSSES_DATA.length) report.errors.push(`Targets shows ${targetRowsEl.childElementCount}/${BOSSES_DATA.length}`);
  for (const item of EQUIPMENT_DATA) { openItemModal(item, "equipment"); closeItemModal(); }
  for (const augment of AUGMENTS_DATA) { openItemModal(augment, "augment"); closeItemModal(); }
  targetRowsEl.querySelector("button").click();
  if (targetBoss !== BOSSES_DATA[0]) report.errors.push("Targets: the first row's button did not pick its boss");
  setTargetBoss(null);
} catch (error) {
  report.errors.push(`views: ${error && error.stack || error}`);
}

const result = document.createElement("pre");
// URI-encoded so the runner can read it back from the serialized DOM without HTML escaping.
result.textContent = `CHECK:${encodeURIComponent(JSON.stringify(report))}:END`;
document.body.appendChild(result);

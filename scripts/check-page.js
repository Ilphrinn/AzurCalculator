// Injected into index.html by scripts/check.js: runs the real app functions over every ship and
// writes what went wrong into the page, for the runner to read back.
const report = { ships: 0, runs: 0, errors: [], nonFinite: [], illegal: [], overCap: [], worse: [] };
window.addEventListener("error", event => report.errors.push(String(event.message)));

const isFinite4 = m => ["dps", "dpsAA", "dpsASW", "ehp"].every(key => Number.isFinite(m[key]));
// The figure each single-metric target must never lower compared with the bare built-in loadout,
// time-weighted like the figures Optimize ranks on.
const TARGET_METRIC = { firepower: "dps", torpedo: "dps", aviation: "dps", antiair: "dpsAA", asw: "dpsASW" };

// Every run is repeated against one boss of each armour, so the armour-aware Optimize path is covered
// too, and against a map's mob fleets, whose armour is an HP split.
const BOSS_TARGETS = [null, ...["light", "medium", "heavy"].map(armor => BOSSES_DATA.find(boss => boss.armor === armor)),
  mobTarget(MAPS_DATA.find(map => map.map === "14-4"))];

// Figures pinned at level 125 (retrofit when she has one) against the reference target, on a fixed
// loadout: a formula change that moves every figure alike passes every other check here. When a
// change is meant to move them, copy the new values from the failure.
const PINNED = [
  ["Z23", ["Twin 127mm (Type 5 Prototype)", "610mm Quintuple Torpedo Mount", "Twin 57mm Bofors (Mle 1951)", "Repair Toolkit", "Type 93 Pure Oxygen Torpedo", "Custom-made Companion Rigging - Raubtier"],
    { dps: 1624.7, ehp: 7645.3, dpsAA: 347.3, dpsASW: 66 }],
  ["Helena", ["Prototype Quadruple 152mm Main Gun Mount", "Twin 127mm (Type 5 Prototype)", "Twin 57mm Bofors (Mle 1951)", "Improved Hydraulic Rudder", "SG Radar", "Crossbow"],
    { dps: 833.5, ehp: 8767.2, dpsAA: 728.8, dpsASW: 38.9 }],
  ["Prinz Eugen", ["Triple 234mm (BL 9.2\" Mk XII Prototype)", "610mm Quadruple Torpedo Mount (Cruiser)", "Twin 57mm Bofors (Mle 1951)", "Improved Hydraulic Rudder", "Type 93 Pure Oxygen Torpedo", "Greatsword"],
    { dps: 1108.1, ehp: 12120.5, dpsAA: 448.5 }],
  ["New Jersey", ["Twin 406mm (SK C/34 Prototype)", "Twin 127mm (Type 5 Prototype)", "Twin 134mm AA (Time Fuze)", "Admiralty Fire Control Table", "Super Heavy Shell", "Bowgun"],
    { dps: 4680.3, ehp: 12323.5, dpsAA: 919.6 }],
  ["Taihou", ["Lavochkin La-9 (Carrier-based Prototype)", "Nakajima J5N Tenrai (Dive Bomber Prototype)", "Fairey Spearfish (Prototype)", "Steam Catapult", "Steam Catapult", "Majestic Phoenix"],
    { dps: 1143.6, ehp: 10217.9 }],
  ["I-19", ["Improved Submarine-mounted G7e Acoustic Homing Torpedo", "Improved Submarine-mounted G7e Acoustic Homing Torpedo", "Twin 127mm (Type 5 Prototype)", "Improved Snorkel", "Type 93 Pure Oxygen Torpedo", "Kunai"],
    { dps: 1759.3, ehp: 2717.5 }]
];
currentLevel = 125;
for (const [name, gear, expected] of PINNED) {
  const ship = SHIPS_DATA.find(s => s.displayName === name);
  retrofitApplied = Boolean(ship.hasRetrofit);
  clearEquippedGear(ship);
  gear.forEach((itemName, i) => {
    const slotKey = i < 5 ? String(i + 1) : "augment";
    const item = (slotKey === "augment" ? AUGMENTS_DATA : EQUIPMENT_DATA).find(entry => entry.name === itemName);
    if (!item) report.errors.push(`Pinned ${name}: no item "${itemName}"`);
    setEquippedGear(ship, slotKey, item);
  });
  const metrics = targetCombatMetrics(ship, 125, computeEffectiveStats(ship, 125, retrofitApplied, false, false, figureTiming()));
  for (const [key, value] of Object.entries(expected)) {
    if (!(Math.abs(metrics[key] - value) <= Math.max(value * 0.005, 0.1))) report.errors.push(`Pinned ${name} ${key}: expected ${value}, got ${metrics[key].toFixed(1)}`);
  }
  clearEquippedGear(ship);
}
retrofitApplied = false;

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
          const bare = computeEffectiveStats(ship, level, retrofit, false, false, figureTiming());
          if (!bare || !ship.equipment) continue;
          const bareMetrics = targetCombatMetrics(ship, level, bare);
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
              const metrics = targetCombatMetrics(ship, level, computeEffectiveStats(ship, level, retrofit, false, false, figureTiming()));
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

// The Optimize button gives one loadout whatever was on before: it once weighed the gear already
// equipped, so a second click, or a previous goal's picks, changed the result.
const loadoutKey = ship => JSON.stringify(Object.entries(equippedGear[ship.id] || {}).map(([slot, item]) => [slot, item.name]).sort());
currentLevel = 125;
equipmentRarityCap = "Ultra Rare";
for (const ship of SHIPS_DATA.filter(s => s.equipment)) {
  try {
    retrofitApplied = Boolean(ship.hasRetrofit);
    equipmentTarget = "auto";
    optimizeShip(ship);
    const first = loadoutKey(ship);
    equipmentTarget = "antiair";
    optimizeShip(ship);
    equipmentTarget = "auto";
    optimizeShip(ship);
    if (loadoutKey(ship) !== first) report.errors.push(`${ship.displayName}: Optimize depends on the gear already equipped`);
  } catch (error) {
    report.errors.push(`${ship.displayName} Optimize twice: ${error && error.stack || error}`);
  }
  clearEquippedGear(ship);
}
retrofitApplied = false;

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

  // A map's three fleets render with finite figures for every member, each against its own target,
  // and the Airspace Control line shows. Carriers go in the Main rows so it has planes to count.
  const byRole = (role, skip, prefer = () => true) =>
    SHIPS_DATA.filter(ship => ship.role === role && ship.equipment && prefer(ship)).slice(skip, skip + 3);
  const carrier = ship => /Carrier/.test(ship.hullType);
  setTargetBoss(mapBosses(MAPS_DATA.find(map => map.map === "14-4"))[0]);
  fleet.mob.Vanguard.splice(0, 3, ...byRole("Vanguard", 0));
  fleet.mob.Main.splice(0, 3, ...byRole("Main", 0, carrier));
  fleet.boss.Vanguard.splice(0, 3, ...byRole("Vanguard", 3));
  fleet.boss.Main.splice(0, 3, ...byRole("Main", 3, carrier));
  fleet.sub.Submarine.splice(0, 3, ...byRole("Submarine", 0));
  showView("fleet");
  let air = 0;
  for (const key of visibleFleets()) {
    for (const ship of fleetMembers(key)) {
      const metrics = withFleetTarget(key, () => fleetShipFigures(ship));
      if (!metrics || !isFinite4(metrics) || !Number.isFinite(metrics.airPower)) report.nonFinite.push(`Fleet ${key}: ${ship.displayName}`);
      else air += metrics.airPower;
    }
  }
  if (document.querySelectorAll(".fleet-slot .card").length !== 15) report.errors.push("Fleet: fifteen members did not render fifteen cards");
  if (fleetAirEl.hidden || !(air > 0)) report.errors.push(`Fleet: no Airspace Control for a map with carriers (${air})`);
  if (targetBoss !== mapBosses(MAPS_DATA.find(map => map.map === "14-4"))[0]) report.errors.push("Fleet: a figure left the Mob target in place");
  for (const key of visibleFleets()) {
    const figures = new Map(fleetMembers(key).map(ship => [ship, withFleetTarget(key, () => fleetShipFigures(ship))]));
    const { totals } = withFleetTarget(key, () => fleetSustain(key, figures));
    if (![totals.heal, totals.shield].every(Number.isFinite)) report.nonFinite.push(`Fleet ${key}: heals and shields`);
  }

  // The fleet optimizer, with and without a map: every slot holds a ship of its row, none twice,
  // finite scores, and alternatives drawn from ships in no fleet.
  for (const map of [MAPS_DATA.find(m => m.map === "14-4"), null]) {
    setTargetBoss(map ? mapBosses(map)[0] : null);
    for (const key of map ? ["boss", "mob"] : ["boss"]) {
      const cache = fleetFigureCache(key);
      withFleetTarget(key, () => {
        for (const ship of SHIPS_DATA) {
          if (!cache.has(ship) && (key !== "mob" || ship.role !== "Submarine")) cache.set(ship, fleetShipFigures(ship, false));
        }
      });
    }
    const keys = visibleFleets();
    const { plan, alternatives } = composeFleets(keys, map);
    const where = map ? map.map : "no map";
    const picked = keys.flatMap(key => FLEET_ROWS[key].flatMap(row => plan[key][row].map(ship => ({ key, row, ship }))));
    for (const { key, row, ship } of picked) {
      if (!ship || ship.role !== row) report.errors.push(`Optimize fleets (${where}): ${key} ${row} holds ${ship ? ship.displayName : "nothing"}`);
    }
    if (new Set(picked.map(p => p.ship)).size !== picked.length) report.errors.push(`Optimize fleets (${where}): a ship is placed twice`);
    for (const key of keys) {
      const score = optimizeScore(key, plan[key], fleetFigureCache(key === "mob" ? "mob" : "boss"));
      if (!(score > 0 && Number.isFinite(score))) report.nonFinite.push(`Optimize fleets (${where}): ${key} score ${score}`);
    }
    for (const [slot, list] of alternatives) {
      if (list.length !== OPTIMIZE_ALTERNATIVES || list.some(alt => picked.some(p => p.ship === alt.ship) || !Number.isFinite(alt.change))) {
        report.errors.push(`Optimize fleets (${where}): alternatives for ${slot}`);
      }
    }
  }
  setTargetBoss(null);

  // The card marks in data/specialties.js must match what the engine computes now.
  const marks = computeShipSpecialties();
  const stale = SHIPS_DATA.filter(ship => JSON.stringify(marks[ship.id] || []) !== JSON.stringify((typeof SPECIALTIES_DATA === "undefined" ? {} : SPECIALTIES_DATA)[ship.id] || []));
  if (stale.length) report.errors.push(`data/specialties.js is stale for ${stale.length} ships (${stale.slice(0, 5).map(s => s.displayName).join(", ")}...): run node scripts/import-specialties.js`);

  // Every ship's heals and shields count to a finite number of casts, or to none when untimeable.
  for (const ship of SHIPS_DATA.filter(s => s.equipment)) {
    retrofitApplied = Boolean(ship.hasRetrofit);
    const cycles = weaponCycles(ship, computeEffectiveStats(ship, 125, retrofitApplied, false, false));
    if (Object.values(cycles).some(c => typeof c === "number" && !(c > 0))) report.nonFinite.push(`Cycles: ${ship.displayName} ${JSON.stringify(cycles)}`);
    for (const skill of getSkillsForState(ship, retrofitApplied, false, false)) {
      for (const entry of (skillTiming(ship, skill, true) || {}).sustain || []) {
        const count = sustainCount(entry, 120, cycles);
        if (count !== null && !(count >= 0 && Number.isFinite(count))) report.nonFinite.push(`Sustain: ${ship.displayName} ${skill.name} ${count}`);
      }
    }
  }
  retrofitApplied = false;
  for (const rows of Object.values(fleet)) for (const list of Object.values(rows)) list.fill(null);
  setTargetBoss(null);
  showView("port");

  // The Port metric sorts rank ships without equipping them.
  for (const ship of SHIPS_DATA.filter(s => s.equipment).slice(0, 30)) {
    clearEquippedGear(ship);
    const metrics = fleetShipFigures(ship, false);
    if (!metrics || !isFinite4(metrics)) report.nonFinite.push(`Port sort: ${ship.displayName}`);
    if (Object.keys(equippedGear[ship.id] || {}).length) report.errors.push(`Port sort left gear on ${ship.displayName}`);
  }
  // Picking each sort through the menu runs its real handler; a throw lands in the error listener.
  for (const option of sortEl.options) {
    sortEl.value = option.value;
    sortEl.dispatchEvent(new Event("change"));
  }
} catch (error) {
  report.errors.push(`views: ${error && error.stack || error}`);
}

const result = document.createElement("pre");
// URI-encoded so the runner can read it back from the serialized DOM without HTML escaping.
result.textContent = `CHECK:${encodeURIComponent(JSON.stringify(report))}:END`;
document.body.appendChild(result);

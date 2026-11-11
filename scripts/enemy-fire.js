// What an enemy fleet fires at the player, by the client's damage attribute (battleformulas.lua
// CreateContextCalculateDamage): torpedo-attribute damage is what injureRatioByBulletTorpedo (the
// Anti-Torpedo Bulge) cuts. Shared by scripts/import-bosses.js and scripts/import-maps.js.

const GAME_DATA = "https://raw.githubusercontent.com/AzurLaneTools/AzurLaneData/main/EN";
const FIRE_SOURCES = {
  weapons: `${GAME_DATA}/sharecfgdata/weapon_property.json`,
  barrages: `${GAME_DATA}/sharecfgdata/barrage_template.json`
};

// WeaponDamageAttr 1 cannon, 2 torpedo, 4 air, with the enemy stat each scales on; 3 (anti-air) and
// 5 (anti-sub) never hit a surface ship.
const ATTRIBUTE_STAT = { 1: "cannon", 2: "torpedo", 4: "air" };
// EquipmentType 18 (HAMMER_HEAD): a Bombing Ship's ram, one hit when it reaches a ship rather than
// a rate, and often shot before it does, so it is left out.
const RAM_WEAPON = 18;

function weaponRow(weapons, id) {
  let row = weapons[id];
  if (!row) return null;
  const chain = [row];
  while (row.base && weapons[row.base] && chain.length < 10) {
    row = weapons[row.base];
    chain.push(row);
  }
  return Object.assign({}, ...chain.reverse());
}

// Damage per second of one enemy at a level, by attribute: per bullet damage x corrected% x
// (1 + stat x attack_attribute_ratio / 10000), bullets (primal_repeat + 1) x (senior_repeat + 1)
// per barrage, every reload_max / 150 x sqrt(200 / (RLD + 100)) seconds (wiki, Damage Calculations).
function fireRates(stats, level, { weapons, barrages }) {
  const statAt = key => (stats[key] || 0) + (level - 1) * (stats[`${key}_growth`] || 0) / 1000;
  const rates = { cannon: 0, torpedo: 0, air: 0 };
  const reload = statAt("reload");
  for (const id of stats.equipment_list || []) {
    const weapon = weaponRow(weapons, id);
    const kind = weapon && ATTRIBUTE_STAT[weapon.attack_attribute];
    if (!kind || weapon.type === RAM_WEAPON || !(weapon.reload_max > 0)) continue;
    const bullets = barrageBullets(weapon, barrages);
    const perBullet = weapon.damage * (weapon.corrected || 0) / 100 * (1 + statAt(kind) * (weapon.attack_attribute_ratio || 0) / 10000);
    const cycle = weapon.reload_max / 150 * Math.sqrt(200 / (reload + 100));
    rates[kind] += perBullet * bullets / cycle;
  }
  return rates;
}

function barrageBullets(weapon, barrages) {
  return (weapon.barrage_ID || []).reduce((sum, barrageId) => {
    const barrage = barrages[barrageId];
    return sum + (barrage ? (barrage.primal_repeat + 1) * (barrage.senior_repeat + 1) : 0);
  }, 0);
}

// Everything a wave's air raids (`airFighter`: totalNumber planes with the airPower stat) can drop,
// every plane releasing each air-attribute weapon once: an upper bound, since AA downs some first.
function planeOrdnance(airFighters, { weapons, barrages }) {
  let total = 0;
  for (const raid of airFighters) {
    for (const id of raid.weaponID || []) {
      const weapon = weaponRow(weapons, id);
      if (!weapon || weapon.attack_attribute !== 4) continue;
      const perBullet = weapon.damage * (weapon.corrected || 0) / 100 * (1 + ((raid.attr || {}).airPower || 0) * (weapon.attack_attribute_ratio || 0) / 10000);
      total += raid.totalNumber * perBullet * (barrageBullets(weapon, barrages) || 1);
    }
  }
  return total;
}

module.exports = { FIRE_SOURCES, fireRates, planeOrdnance };

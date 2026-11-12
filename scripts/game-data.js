// Fetching and reading the game's own tables (AzurLaneData), shared by the import scripts.

const GAME_DATA = "https://raw.githubusercontent.com/AzurLaneTools/AzurLaneData/main/EN";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
}

// Waves and their spawns come as arrays or as objects keyed "1", "2"...
const list = value => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];

// A table row with its `base` chain merged in (most rows only override a few fields).
function withBase(table, id) {
  let row = table[id];
  if (!row) return row;
  const chain = [row];
  while (row.base && table[row.base] && chain.length < 10) {
    row = table[row.base];
    chain.push(row);
  }
  return Object.assign({}, ...chain.reverse());
}

// An enemy row only overrides its `base` row, which carries the name, hull, armour and nation.
const enemyRow = (enemies, id) => enemies[id] && { ...enemies[enemies[id].base], ...enemies[id] };

// injureRatioByAir from a list of buff ids (client: aircraft damage x (1 + injureRatioByAir)).
const airCutOf = (buffs, ids) => (ids || []).reduce((sum, id) => sum + list((buffs[`buff_${id}`] || {}).effect_list)
  .filter(e => e.type === "BattleBuffAddAttr" && (e.arg_list || {}).attr === "injureRatioByAir")
  .reduce((s2, e) => s2 + e.arg_list.number, 0), 0);

module.exports = { GAME_DATA, getJson, list, withBase, enemyRow, airCutOf };

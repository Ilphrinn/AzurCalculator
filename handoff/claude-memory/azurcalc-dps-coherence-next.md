---
name: azurcalc-dps-coherence-next
description: "Pending DPS-coherence work after 2026-10-29 (BB secondary guns vs boss, CV vs BB balance, Chihaya aircraft, 29 skipped barrage skills)"
metadata:
  node_type: memory
  type: project
  originSessionId: 58bfa1a2-3e58-486a-8cea-e63e76522ec0
  modified: 2026-10-29T13:53:40.494Z
---

State on 2026-10-29: timed/per-salvo skill barrages and their game crit are in DPS (commits 3faf4a6, 24256ff, live). User's goal: "des stats assez cohérentes".

User's answer (file `todo` at repo root, untracked, theirs):
- BB secondary guns (range 60) should NOT count against a boss: "c'est normal qu'il ne compte pas". Today slot 2 outweighs the main gun (QE 2341 vs 997). Next step: exclude or cut them when a boss is targeted.
- They expect CVs to generally out-damage BBs (BBs/CVs differ in utility, not always). Check the CV vs BB ranking after the secondary-gun fix.
- Figures must come from best gear first, then the computation (already so: Optimize Recommended, UR cap, lv125).

Also open: Chihaya Kisaragi's own aircraft only 425 DPS (looks low); 29 multi-schedule barrage skills skipped (Lion, Mecklenburg, Ulrich von Hutten, Andrea Doria META...), see "Skill barrages in DPS" in docs/NOTES.md.

**Why:** session ran out of weekly tokens before starting this.
**How to apply:** start with the secondary-gun range fix, re-run `npm run check` and `node scripts/import-specialties.js`, then compare CV/BB tops. Related: [[azurcalc-product-direction]], [[azurcalc-commit-and-deploy]].

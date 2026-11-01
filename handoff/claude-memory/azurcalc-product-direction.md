---
name: azurcalc-product-direction
description: "What the user wants AzurCalc to become (tier-list-like insight computed from game data, boss-targeted optimisation) and the line on third-party sites"
metadata:
  node_type: memory
  type: project
  originSessionId: 25417fdf-d5e7-4f52-a37e-1264c6b2fd70
  modified: 2026-10-28T11:15:44.409Z
---

Stated 2026-10-28: the user wants AzurCalc to offer what tier-list sites (Regal) show - each ship's utility, potential uptime, and a chosen boss to optimise gear/ships against, with pleasant easy navigation - but NOT "X is better than Y" rankings. They want the data, not the other site's opinions.

**Why:** they found Regal (azur-lane-regal.suchiguma.com) far richer than AzurCalc; Regal's numbers are its own simulations and ratings (robots.txt use=reference), so the agreed path is to compute equivalents from game datamine (mrlar.dev JSON, Fernando2603 repo), never copy Regal.

**How to apply:** propose features as "computed from game data" equivalents; push back if a request amounts to copying a site's own work. First steps done: DPS per armour + Target boss menu (see CLAUDE.md "Open work"). Related: [[azurcalc-working-style]]

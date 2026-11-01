---
name: azurcalc-commit-and-deploy
description: "How AzurCalc commits and goes live: per-command git identity, push to main = Cloudflare deploy in ~1-5 min"
metadata:
  node_type: memory
  type: project
  originSessionId: 87aa6870-4fdd-4c7b-89fc-fa03aa42b0f2
  modified: 2026-10-28T16:09:59.279Z
---

This machine has no global git identity. Commits reuse the identity of the repo's own history,
per command, without touching git config:
`git -c user.name=Ilphrinn -c user.email=gitlab.hurled132@passmail.net commit ...`

Pushing to `origin main` (GitHub Ilphrinn/AzurCalculator) is the deployment: Cloudflare Workers
Builds runs `node scripts/build.js` from `wrangler.toml` and serves `dist/`, live in ~1-5 minutes.
Verify by comparing `app.js?v=<hash>` in the live https://azurcalculator.ilph-creation.party/ HTML
with the one in the local `dist/index.html` built from the same commit.

**Why:** the user asked to "commit everything" and "mettre en ligne" repeatedly (2026-10-28); the
first commit failed on a missing identity, and no wrangler CLI is installed locally.
**How to apply:** commit with the `-c` flags above, push to main when the user asks to put it
online, then confirm the live hash instead of assuming. Related: [[azurcalc-product-direction]].

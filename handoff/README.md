# Reprise sur un autre PC — état au 2026-11-01

## Où en est le code

- Branche `main`, à jour avec `origin/main` (GitHub `Ilphrinn/AzurCalculator`). Rien de non poussé
  côté code. Dernier commit : `24256ff Give skill barrages the crit rate the game grants their bullets`,
  en ligne sur https://azurcalculator.ilph-creation.party.
- `npm run check` passait au dernier commit.
- Le contexte complet est dans le dépôt : [CLAUDE.md](../CLAUDE.md) (section « Open work ») et
  [docs/NOTES.md](../docs/NOTES.md) (6000 lignes, chercher la section, ne pas tout lire). Dernière
  section écrite : « Skill barrages in DPS (2026-10-29) ».

## Prochaine tâche (non commencée)

Objectif de l'utilisateur : « des stats assez cohérentes ». Réponse laissée dans le fichier `todo`
à la racine (non suivi par git, recopié ici) :

> C'est normal qu'il ne compte pas, je pense que normalement les CV sont plus fort que les cuirassé,
> mais ils ont moins d'utilitaire (pas toujours vrai)
> si tu peux le mieux pour avoir ces valeurs c'est de dabord chercher le meilleur équipement, puis
> faire le calcul.

Ce que ça donne, dans l'ordre :

1. **Canons secondaires des cuirassés contre un boss.** Portée 60 : ils ne doivent pas compter
   quand un boss est ciblé. Aujourd'hui le slot 2 pèse plus que le canon principal (Queen
   Elizabeth : 2341 contre 997). Les exclure ou les réduire quand un boss est choisi.
2. **Relancer** `npm run check` puis `node scripts/import-specialties.js` (le check échoue tant que
   `data/specialties.js` est périmé).
3. **Comparer les tops CV et BB.** Attendu : les porte-avions devant les cuirassés en général (ils
   diffèrent par l'utilitaire, pas toujours). Les chiffres partent déjà du meilleur équipement
   (Optimize « Recommended », plafond UR, niveau 125), comme demandé.

Autres points ouverts :

- Chihaya Kisaragi : ses propres avions ne font que 425 DPS (contre 3147 pour l'airstrike de sa
  compétence), suspect.
- 29 compétences à barrages multi-calendriers ignorées (Lion, Mecklenburg, Ulrich von Hutten,
  Andrea Doria META, Champagne, Kiev...). Voir « Skill barrages in DPS » dans les notes.
- Le reste de la feuille de route (utilité par navire, uptime dans Optimize/Fleet...) est dans
  CLAUDE.md, « Open work ».

## Installer le nouveau poste

```sh
git clone https://github.com/Ilphrinn/AzurCalculator.git "Azur Calculator"
cd "Azur Calculator"
npm ci              # Node 24 utilisé ici (v24.18.0)
npm run build       # écrit dist/
npm run check       # Chromium headless ; sous Fedora avec Chromium Flatpak :
# CHROME="flatpak run io.github.ungoogled_software.ungoogled_chromium" npm run check
```

L'app tourne aussi en ouvrant `index.html` directement (`file://`), sans serveur.

Optionnel, seulement pour régénérer `data/focus.js` après ajout d'illustrations :
`python3 -m venv .venv && .venv/bin/pip install "opencv-python-headless<5" numpy`.

## Ce que git ne transporte pas

| Quoi | Où sur ce PC | Nécessaire ? |
|---|---|---|
| `Site web/` (pages du wiki sauvegardées, 3,6 Go) | racine du projet, git-ignoré | Seulement pour re-sourcer des données de navires ou relire les formules du wiki (Combat, Damage Calculations, ASW). Le wiki bloque tout accès automatique : copier le dossier à la main (disque, rsync). |
| `programming rules/` (14 Mo, pages de référence) | racine du projet, git-ignoré | Non, le contenu utile est résumé dans docs/NOTES.md. |
| Mémoire de Claude Code | `~/.claude/projects/-home-perso-Documents-DEV-Azur-Calculator/memory/` | Oui, copiée dans [claude-memory/](claude-memory/). |
| Consignes globales Claude (français, ton Céphalon Cy) | `~/.claude/CLAUDE.md` | Oui, copiées dans [claude-global-CLAUDE.md](claude-global-CLAUDE.md). |
| `.claude/settings.local.json` | projet, git-ignoré | Non, permissions périmées de l'ancien poste Windows. |
| Identifiants GitHub (pour pousser) | trousseau / gh | Se reconnecter sur le nouveau poste. |

### Restaurer la mémoire et les consignes de Claude

Le dossier mémoire est nommé d'après le chemin absolu du projet (`/` et espaces remplacés par `-`).
Exemple pour `/home/<user>/Documents/DEV/Azur Calculator` :

```sh
MEM=~/.claude/projects/-home-<user>-Documents-DEV-Azur-Calculator/memory
mkdir -p "$MEM" && cp handoff/claude-memory/*.md "$MEM"/
cp handoff/claude-global-CLAUDE.md ~/.claude/CLAUDE.md   # écrase l'existant : vérifier avant
```

Si le chemin diffère, lancer Claude Code une fois dans le projet : il crée le dossier
`~/.claude/projects/<clé>/`, il suffit d'y déposer `memory/`.

## Commit et mise en ligne

- Pas d'identité git globale ici : chaque commit passe
  `git -c user.name=Ilphrinn -c user.email=gitlab.hurled132@passmail.net commit ...`
  (ou configurer l'identité sur le nouveau poste).
- Pousser sur `main` = déployer (Cloudflare Workers Builds lance `node scripts/build.js`, en ligne en
  1 à 5 min). Vérifier en comparant `app.js?v=<hash>` du site en ligne avec `dist/index.html` local.

## Une fois repris

Ce dossier `handoff/` est un instantané : le supprimer (ou le mettre à jour) une fois la mémoire
restaurée, pour qu'il ne contredise pas CLAUDE.md plus tard.

# Loqua

> Coach vocal d'anglais **privacy-first**. Parlez, faites-vous corriger, retenez — sans que votre voix ne quitte jamais votre appareil.

Loqua écoute votre anglais parlé, le transcrit **localement**, en corrige les fautes et transforme vos erreurs récurrentes en cartes de révision espacée. Le tout est conçu autour d'un principe non négociable : **l'audio ne sort jamais de la machine**. Seul du texte peut, éventuellement et avec votre accord explicite, être envoyé à un modèle cloud sans rétention (ZDR).

---

## Pourquoi Loqua ?

Les assistants génériques (ChatGPT & co.) corrigent bien une phrase, mais oublient tout à la phrase suivante. Loqua part d'un pari différent :

- **La correction async a de la valeur si elle vous fait progresser dans le temps.** Vos fautes d'hier reviennent vous chercher aujourd'hui, via un moteur de répétition espacée (SRS). C'est le vrai différenciateur.
- **La confidentialité est un droit, pas une option.** Apprendre une langue, c'est se tromper à voix haute. Cela ne devrait jamais alimenter un serveur tiers. Chez Loqua, la reconnaissance vocale, la synthèse et la comparaison de prononciation tournent **à 100 % sur votre appareil**.
- **Le serveur est aveugle.** Le backend est volontairement minuscule : il ne lit jamais vos données, ne stocke aucun audio, et ne journalise aucun contenu.

### Les invariants (jamais violés)

1. **L'audio ne quitte jamais l'appareil** — STT, TTS et scoring sont locaux, toujours.
2. **Seul du texte peut sortir**, vers un LLM cloud-ZDR, **uniquement sur opt-in explicite**, par un point de sortie unique et audité (`egressGuard`).
3. **Coût serveur ~0** — aucune orchestration ni traitement d'audio côté serveur ; il ne lit jamais de données utilisateur.
4. **Fallback jamais silencieux** — toute bascule local → cloud est consentie _et_ visible dans l'UI.
5. **Effacement RGPD by design** — une donnée dérivée (carte SRS…) est une copie de valeur, jamais une référence effaçable vers la source.

---

## Ce que fait Loqua aujourd'hui

| Boucle          | Description                                                                                                                                          | Statut                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Corriger**    | Enregistrer → transcription locale (Whisper) → correction structurée (« naturel », en-US) → **diff cliquable** avec catégorie d'erreur + explication | ✅ Web                 |
| **Retenir**     | Chaque faute devient une carte SRS (SM-2) ; le deck du jour vous rappelle vos erreurs ; streak & XP                                                  | ✅ Web                 |
| **Prononcer**   | Écoute de la version corrigée (TTS local), tap-sur-mot (IPA, syllabes, boucle, vitesse), enregistre-toi & compare (A/B + waveform)                   | ✅ Web                 |
| **100 % local** | Desktop Tauri : STT, LLM et TTS natifs, réseau débranché                                                                                             | 🚧 En cours (Sprint 4) |

> **Note** : le scoring de prononciation **chiffré** a été volontairement écarté (un spike a montré qu'aucun score fiable n'était atteignable sans modèle supervisé). Loqua propose une comparaison A/B honnête (`ear-compare`), pas un score arbitraire.

---

## Architecture

Loqua est un monorepo **pnpm + Turborepo** organisé en architecture **hexagonale** stricte : toute la logique métier vit dans un `core` en TypeScript pur, et la flèche de dépendance pointe **toujours** vers lui.

```
        ┌─────────────────────────────────────────────┐
        │   UI par plateforme (FSD) — jetable          │
        │   apps/web (Next.js)   apps/desktop (Tauri)  │
        └───────────────────────┬─────────────────────┘
                                 │ use-cases
        ┌───────────────────────▼─────────────────────┐
        │                CORE (TS pur)                  │
        │  5 bounded contexts · pipeline · PORTS ·      │
        │  event bus · egressGuard                      │
        └─┬──────┬──────┬──────┬──────┬────────────────┘
       STT     LLM    TTS   Scoring Storage  (ports)
          │      │      │      │      │
        ┌─▼──────▼──────▼──────▼──────▼──┐
        │  ADAPTERS                       │
        │  adapters-web (WASM/WebGPU)     │
        │  adapters-tauri (sidecars Rust) │
        └────────────────┬────────────────┘
                         │ (opt-in, TEXTE uniquement)
                ┌────────▼────────┐
                │  services/api    │  proxy LLM ZDR (aveugle)
                └──────────────────┘
```

### Le monorepo

| Paquet                    | Rôle                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`           | **Cœur métier en TS pur.** 5 bounded contexts (`correction`, `pronunciation`, `srs`, `gamification`, `identity`), machine à états du pipeline, bus d'événements, `egressGuard`, ports. **Zéro dépendance runtime**, aucun accès DOM / Node / réseau. |
| `packages/adapters-web`   | Implémente les ports pour le navigateur : `transformers.js` (Whisper), `kokoro.js` (TTS), SQLite-WASM + OPFS, proxy `fetch`.                                                                                                                         |
| `packages/adapters-tauri` | Implémente les ports via `invoke()` vers des sidecars Rust natifs, SQLite natif.                                                                                                                                                                     |
| `packages/ui-web`         | Composants React DOM partagés entre web et desktop.                                                                                                                                                                                                  |
| `apps/web`                | Application **Next.js** (App Router + architecture FSD).                                                                                                                                                                                             |
| `apps/desktop`            | Application **Tauri 2** — réutilise le frontend web, seuls les adapters injectés changent.                                                                                                                                                           |
| `services/api`            | Backend **fin** (Hono / Cloudflare Workers) : proxy LLM ZDR, texte seul.                                                                                                                                                                             |
| `tooling/eval`            | Harness d'évaluation de l'IA (golden set, LLM-juge, non-régression).                                                                                                                                                                                 |

### Deux régimes de test, jamais mélangés

- **Déterministe** (SRS, streak, machine à états, `egressGuard`, value objects) → **TDD Vitest**.
- **Qualité de l'IA** (correction, scoring) → **eval harness uniquement** (assertions sémantiques, LLM-juge). Jamais d'`expect(...).toBe(...)` sur une sortie de LLM.

Une règle `dependency-cruiser` casse le build si le `core` importe le moindre adapter, app ou framework.

---

## Démarrage rapide

### Prérequis

- **Node.js ≥ 22** et **pnpm 11** (via `corepack enable pnpm`)
- Un navigateur avec **WebGPU** de préférence (repli WASM automatique sinon)
- Pour la correction cloud : une clé **Anthropic** (voir ci-dessous). _Sans clé, la boucle STT + prononciation + SRS fonctionne ; seule la correction LLM cloud est indisponible._

### Installation

```bash
corepack enable pnpm
pnpm install
```

### Lancer l'application web

Loqua utilise un proxy LLM local pour ne jamais exposer la clé API côté client. Deux terminaux :

```bash
# Terminal 1 — le backend fin (proxy LLM ZDR)
pnpm --filter @loqua/api dev        # wrangler dev

# Terminal 2 — l'app web
pnpm --filter @loqua/web dev        # next dev  → http://localhost:3000
```

La clé API se place dans un fichier **non commité** :

```bash
# services/api/.dev.vars
ANTHROPIC_API_KEY=sk-ant-...
```

> Modèle par défaut : `claude-sonnet-5` (option économique : `claude-haiku-4-5`). Aucun compte Cloudflare n'est requis pour le dev local.

Au premier usage du micro, Loqua demande votre **consentement biométrique** (RGPD art. 9). Les modèles (Whisper, Kokoro…) se téléchargent à la première utilisation et sont mis en cache (OPFS) — rien n'est embarqué dans le bundle.

### Lancer le desktop (Tauri) — en cours

```bash
pnpm --filter @loqua/desktop dev
```

---

## Commandes utiles

```bash
pnpm build          # lint de dépendances + build de tous les paquets
pnpm test           # toute la suite de tests (Vitest)
pnpm lint:deps      # vérifie la règle de dépendance hexagonale
pnpm eval           # exécute le harness d'évaluation de la correction IA
```

Par paquet :

```bash
pnpm --filter @loqua/core test      # tests unitaires du cœur métier
pnpm --filter @loqua/web dev        # dev server web
pnpm --filter @loqua/api dev        # proxy LLM local
```

---

## Feuille de route

Le développement suit un plan de sprints strict (voir [`specs/SPRINTS.md`](specs/SPRINTS.md)).

- **Sprint 0** — Spikes de dé-risquage · ✅
- **Sprint 1** — Fondations (core, ports, event bus, storage) · ✅
- **Sprint 2** — MVP : la boucle de correction (enregistrer → diff) · ✅
- **Sprint 3** — SRS + rétention (le fossé) · ✅
- **Sprint 4** — Desktop : le 100 % local devient réel · 🚧
- **Sprint 5** — Prononciation (TTS, tap-sur-mot, ear-compare) · ✅ _web ; natif desktop différé_

**Hors périmètre actuel** : scoring chiffré, mobile (RN), sync E2E, auth/billing SaaS, correction multi-niveaux, UK/US.

---

## Documentation

La source de vérité du projet vit dans `specs/`, dans cet ordre de priorité :

1. [`specs/ARCHITECTURE.md`](specs/ARCHITECTURE.md) — décisions d'architecture fermes (invariants, ports, contrats).
2. [`specs/SPRINTS.md`](specs/SPRINTS.md) — plan d'exécution lot par lot.
3. [`specs/PRD.md`](specs/PRD.md) — vision produit · [`specs/SPIKES.md`](specs/SPIKES.md) — verdicts de faisabilité.
4. [`.claude/rules/`](.claude/rules/) — règles opérationnelles détaillées.

---

## Stack technique

**TypeScript** (strict, partout) · **Next.js** (App Router, FSD) · **Tauri 2** + **Rust** · **Hono** / **Cloudflare Workers** · **transformers.js** (Whisper) · **kokoro.js** (TTS) · **SQLite-WASM + OPFS** / SQLite natif · **Vitest** · **Zod** (validation aux frontières) · **pnpm + Turborepo** · **dependency-cruiser**.

---

_Projet privé — code et identifiants en anglais, interface en français._

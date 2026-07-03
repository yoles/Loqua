# Loqua — Plan de sprints (guide d'exécution)

> **Rôle :** le sommaire opérationnel pour réaliser le projet **en une traite**, lot par lot. Chaque lot = un livrable + ses tests + **un commit**. Dérivé de [`ARCHITECTURE.md`](ARCHITECTURE.md) §18-19 (qui reste la source de vérité technique — en cas de doute, c'est elle qui tranche).
> **Ordre impératif :** on ne commence pas un sprint tant que le précédent n'est pas « Done ». À l'intérieur d'un sprint, l'ordre des lots est aussi l'ordre d'exécution.

---

## Règles transverses (valables sur tous les lots)

1. **Un lot = un commit** (message court, en français, style `feat:`/`chore:`/`test:`/`docs:` — **jamais de mention de Claude/Claude Code**, pas de Co-Authored-By).
2. **Port avant adapter** : toute brique commence par son interface dans `core/ports` (§20).
3. **Le `core` n'importe personne** — dependency-cruiser doit casser le build sinon.
4. **Pas de `Date.now()`/`Math.random()` dans le core** → `ClockPort` / source injectée.
5. **Toute sortie LLM validée par Zod** avant d'entrer dans le core ; JSON malformé géré explicitement.
6. **Un seul point de sortie réseau pour le contenu** : `egressGuard`. Aucun `fetch` de contenu ailleurs.
7. **Tests par régime** (§16) : TDD + tests comportementaux Vitest sur le déterministe · eval harness sur l'IA. Un lot sans son test n'est pas « Done ».
8. **Conflit avec un invariant (§1)** → s'arrêter et remonter, ne pas contourner.
9. **⚠️ / CHECKPOINT = arrêt obligatoire** : le run s'arrête et attend l'utilisateur (validation humaine ou ressource manquante). Tout le reste s'enchaîne sans demander.
10. **Secrets** : les clés vivent dans `services/api/.dev.vars` (gitignoré, comme tout `.env*`). **Jamais** de secret committé ni mis en dur dans le code.

---

## Sprint 0 — Spikes de dé-risquage ✅ FAIT

| # | Spike | Verdict |
|---|---|---|
| 0.1 | Inférence navigateur (STT/TTS/LLM) | **GO partiel** — web = lite, 100 % local = desktop ([SPIKES §5](SPIKES.md)) |
| 0.2 | Scoring GOP local | **NO-GO** non-supervisé — `ear-compare` durable ([SPIKES §7](SPIKES.md)) |
| 0.3 | Tauri + whisper.cpp natif | **GO** — pattern adapters validé, RTF 0,151× ([SPIKES §6](SPIKES.md)) |

---

## Sprint 1 — Fondations (Étape 1) · *rien de visible à l'écran, c'est voulu* — ✅ FAIT (2026-07-03)

> **Écarts/décisions notés en fin de sprint :**
> - `apps/web` créé en **stub** (typecheck strict) — Next.js sera installé au lot 2.6 avec l'UI, conformément à « installer dans le package concerné, quand nécessaire ».
> - Tests d'intégration du StoragePort sur **`node:sqlite`** (vraie base) via la couture `SqliteExecutor` ; le binding **sqlite-wasm/OPFS** (mince) sera validé en app au lot 2.7. Règle dep-cruiser ajoutée : le code prod d'`adapters-web` ne touche jamais `node:*`.
> - Interprétation actée de la règle paquets en run planifié : les paquets **nommés dans ARCHITECTURE §17/SPRINTS sont pré-approuvés** ; tout paquet hors liste = arrêt et demande.
> - **Docker/compose : non pertinent à ce stade** (dev natif Next/Tauri/modèles locaux ; Tauri exige le GUI hôte). À reconsidérer uniquement pour le déploiement de `services/api`.
> - Garde-fou prouvé : import interdit dans `core` → build cassé (`core-n-importe-personne`), retiré après preuve.

| Lot | Livrable | Done quand |
|---|---|---|
| **1.1 Scaffold monorepo** | pnpm (via `corepack enable pnpm`, épingler `packageManager`) + Turborepo ; packages `core`, `adapters-web`, `ui-web`, `apps/web`, `services/api`, `tooling/eval` (structure = ARCHITECTURE §5 ; `adapters-tauri` sera créé au Sprint 4) ; TS strict partout (`core` : `lib: ["ES2022"]`, zéro lib DOM/Node) ; Vitest branché. | `pnpm install && pnpm build && pnpm test` passent (tests vides OK). |
| **1.2 Garde-fou d'archi** | dependency-cruiser : règle « `core` n'importe aucun package externe ni aucune app », branchée dans le build. | Un import interdit ajouté à la main dans `core` **casse** `pnpm lint:deps`. Retirer l'import après la preuve. |
| **1.3 Le langage du domaine** | Value objects des 5 contexts (§7-9) : `Word`, `Phoneme`, `IPA`, `Correction`, `CorrectionCategory`, `UnscoredComparison`, `Card`, `Streak`… Immuables, TDD. | Tests unitaires verts ; aucun VO ne dépend d'un framework. |
| **1.4 Les contrats (ports)** | Interfaces §9 : `TranscriptionPort`, `CorrectionPort`, `SpeechSynthesisPort`, `PronunciationScoringPort` (→ `UnscoredComparison` par défaut), `StoragePort`, `ModelRuntimePort`, `ClockPort`. Signatures TS = copie conforme de §9. | Compile ; revue croisée signature ↔ §9. |
| **1.5 Event bus** | Bus d'événements typé du core (pub/sub synchrone simple) pour la comm inter-contexts (`ErrorDetected`, etc.). TDD. | Tests verts (émission, abonnement, ordre). |
| **1.6 Première implémentation réelle** | `StoragePort` + adapter `@sqlite.org/sqlite-wasm` sur OPFS (web) + migrations + `eraseAll()` (invariant effacement §13). | Test d'intégration : write/read/erase via le port ; le core ne connaît pas SQLite. |
| **1.7 Squelette eval** | `/tooling/eval` : structure golden-set + runner + format d'assertion sémantique (vide de contenu pour l'instant, §16). | Le runner tourne sur un cas bidon. |

**Done Sprint 1 :** build+tests verts, garde-fou prouvé, un port implémenté de bout en bout.

---

## Sprint 2 — MVP : la boucle de correction (Étape 2) · *le produit existe à la fin* — ✅ FAIT, checkpoint 2.8 validé (2026-07-03)

> **Écarts/décisions notés :**
> - **2.4 Done partiel** : implémenté et testé fournisseur **mocké** (10 tests) ; l'appel réel Claude (« une phrase fautive → JSON valide ») se valide **au checkpoint 2.8** avec la clé — un seul arrêt au lieu de deux.
> - **2.5** : golden set 60 énoncés + CLI `pnpm eval` opérationnels ; la **baseline réelle** sera produite au checkpoint (clé + `wrangler dev` requis).
> - **sqlite-wasm sous Turbopack** : son worker OPFS interne ne survit pas au bundling → la dist est **servie en statique** (`public/sqlite-wasm/`, copiée par `scripts/copy-sqlite-wasm.mjs`, gitignorée) et importée **nativement au runtime** ; l'adapter reçoit `sqlite3InitModule` en paramètre (types only). Sous-export `@loqua/adapters-web/sqlite`.
> - **Audio non persisté** dans le MVP (les blobs micro restent en mémoire de session) — le stockage fichiers OPFS des clips arrive avec la practice (Sprint 5) ; le diff/l'historique n'en ont pas besoin.
> - **Tests UI** : la logique d'affichage est extraite en view-model **pur** testé en Node (pas de jsdom/testing-library à ce stade) ; les scénarios navigateur réels (micro, OPFS, WebGPU) se valident au checkpoint.
> - Le runner du pipeline (effets/retry) vit dans `core/pipeline/runner.ts`, testé avec ports factices (7 tests).
> - **Checkpoint 2.8 (2026-07-03)** : 3 bugs STT trouvés/corrigés au micro réel — (1) passe d'optimisation ORT `TransposeDQWeightsForMatMulNBits` cassée sur l'export `whisper-base.en` → `graphOptimizationLevel: 'disabled'` ; (2) `language` rejeté par le modèle mono-langue `.en` → omis ; (3) timestamps par mot impossibles (export sans cross-attentions) → **retirés du MVP, `words` vide ; timings mot à mot à re-résoudre au Sprint 5** (export avec attentions ou autre modèle). Note : `@huggingface/transformers` dépend en dur d'un build nightly d'`onnxruntime-web` (toutes versions) — bug amont possible, surveiller.
> - **Baseline eval réelle commitée** : 43/60, juge 4,00/5, 0 sortie Zod invalide. Points faibles : syntax 25 %, idiom 38 % — candidats d'itération prompt post-Sprint 3 (jamais sans re-passer l'eval).
> - Comportement validé : sans opt-in cloud, `egressGuard` refuse (`no-consent`) avec message UI + proposition d'opt-in — conforme invariants #2/#5 (le web n'a pas de LLM local ; le 100 % local arrive au Sprint 4).

`Enregistrer → STT local → correction 1 niveau (« naturel », en-US) → diff cliquable`, persistance locale. Rien d'autre (§18).

| Lot | Livrable | Done quand |
|---|---|---|
| **2.1 Machine à états du pipeline** | Reducer TS pur dans le core (§6) : `IDLE → RECORDING → TRANSCRIBING → CORRECTING → READY` + erreurs/annulation. TDD exhaustif. | Toutes les transitions testées, y compris les invalides. |
| **2.2 `egressGuard`** | La fonction unique qui autorise (ou non) la sortie de **texte** : consentement + opt-in + capacité adapter (§15). L'audio n'est **jamais** autorisé. TDD + scénarios BDD. | Tests verts, dont « audio → refus inconditionnel ». |
| **2.3 STT local (web)** | Adapter `TranscriptionPort` : `@huggingface/transformers` (Whisper), WebGPU si dispo → fallback WASM (acquis Spike #1). Download modèle à la 1ʳᵉ utilisation via `ModelRuntimePort` (§11 : progressif, checksum). | Un WAV de test est transcrit dans le navigateur ; l'audio ne quitte pas la machine. |
| **2.4 Backend fin + correction cloud-ZDR** | `services/api` (Hono) : endpoint proxy LLM **ZDR, texte seul**. Adapter `CorrectionPort` web qui passe par `egressGuard`, sortie validée Zod (schéma §9), gestion JSON malformé. **Décidé (2026-07-03) : Anthropic Claude API**, modèle `claude-sonnet-5` (option éco : `claude-haiku-4-5`). Clé `ANTHROPIC_API_KEY` lue depuis `services/api/.dev.vars` (dev local : `wrangler dev`, pas de compte Cloudflare requis). ⚠️ **Si la clé est absente : s'arrêter et la demander** (seul arrêt légitime de ce sprint hors checkpoint). | Une phrase fautive → JSON de corrections catégorisées + explications valide. |
| **2.5 Eval de la correction** | Golden set 50-100 énoncés « dev » (standup, code review, incident) + assertions sémantiques + LLM-juge (§16). Obligatoire **avant** d'itérer sur le prompt. | `pnpm eval` sort un score ; baseline enregistrée. |
| **2.6 UI : enregistrer → diff** | Next.js (App Router) + FSD : page d'enregistrement micro (consentement §15), états du pipeline visibles, **vue diff original↔corrigé cliquable** (chaque correction ouvre catégorie + explication). | Boucle complète au clavier/micro en local ; diff lisible et cliquable. |
| **2.7 Persistance des sessions** | Sessions + corrections sauvées via `StoragePort` ; historique listable ; composition root de l'app web assemble tous les adapters (DI, §20). | Refresh navigateur → l'historique est là. `eraseAll()` accessible dans l'UI (réglages). |

| **2.8 🛑 CHECKPOINT MVP** | Fin du run automatique pour ce sprint : l'utilisateur teste la boucle complète **au micro réel** (enregistrer → diff), vérifie la qualité de correction et l'UX. | L'utilisateur valide explicitement → le run reprend au Sprint 3. |

**Done Sprint 2 = MVP :** la question du PRD (« la correction async apporte-t-elle une valeur que ChatGPT ne donne pas ? ») est testable en vrai, sur ta machine.

---

## Sprint 3 — Le fossé : SRS + rétention (Étape 3) — ✅ FAIT (2026-07-03)

> **Écarts/décisions notés :**
> - **3.1 — SM-2 retenu** (variante Anki, 4 grades `again/hard/good/easy`), pas FSRS : le core interdit toute dépendance runtime (FSRS = 17 poids à réimplémenter/valider à la main) et le langage ubiquitaire du contexte (`Ease`, `Interval`, `Lapse`) est celui de SM-2. FSRS reste substituable derrière la même interface (`Scheduling`/`applyReview`).
> - **3.2 — dédup par contenu** : id de carte dérivé (FNV-1a de type|original|fixed) — une erreur récurrente retombe sur la MÊME carte sans remettre son scheduling à zéro.
> - **3.3 — `spokenMs` ≈ durée du clip** (pas de VAD dans le MVP ; l'enregistrement est démarré/arrêté manuellement). À raffiner si un VAD arrive (Sprint 5+).
> - **3.4 — composition root refactoré en Provider React** (une seule instance partagée entre widgets) ; review/gamification rafraîchis sur événements après `settled()` des policies.
> - **Fix persistance (post-3.4, corrige un legs du 2.7)** : l'adapter sqlite-wasm main-thread ne pouvait JAMAIS monter OPFS (`createSyncAccessHandle`/`Atomics.wait` = worker-only par spec navigateur) → repli mémoire permanent. SQLite vit désormais dans un **Worker dédié** (`apps/web/public/sqlite-worker.mjs`), VFS **OPFS SAHPool** (le VFS `opfs` classique échoue silencieusement ici, vérifié en live), protocole postMessage validé Zod, `SqliteExecutor` async. Limite connue : le pool SAH est exclusif — un 2ᵉ onglet retombe en mémoire (visible, invariant #5).

| Lot | Livrable | Done quand |
|---|---|---|
| **3.1 Moteur SRS** | Context SRS dans le core : algorithme FSRS (ou SM-2 si FSRS trop lourd — trancher au moment venu et le noter), `ClockPort` injecté, **100 % testé**. | Suite TDD complète : intervalles, oublis, réinsertion. |
| **3.2 Erreurs → cartes** | Event `ErrorDetected` (émis en 2.4) → création de `Card` (copie de valeur : survit à la suppression de la session, §13). | Test d'intégration event bus → SRS ; suppression de session ne casse pas les cartes. |
| **3.3 Streak + XP** | Context gamification : règle du streak en **tests comportementaux Vitest** (un cas par règle : fuseau, bascule de jour, ≥ 1 min parlée — pas de format Gherkin/`.feature`), XP par session/mot. | Tests comportementaux verts. |
| **3.4 UI review** | Écran deck du jour (cartes dues) + widget streak/XP sur l'accueil. | Une session de review complète fonctionne offline. |

**Done Sprint 3 :** tes fautes d'hier reviennent te chercher aujourd'hui. C'est le différenciateur.

---

## Sprint 4 — Desktop : le 100 % local devient réel (Étape 4)

| Lot | Livrable | Done quand |
|---|---|---|
| **4.1 Coquille Tauri** | `/apps/desktop` (Tauri 2) réutilisant le frontend web tel quel (acquis Spike #3). SQLite natif (SQLCipher) derrière le même `StoragePort`. | L'app desktop affiche l'UI du Sprint 2-3 avec persistance native. |
| **4.2 STT natif** | `/adapters-tauri` : `TranscriptionPort` → whisper.cpp (whisper-rs), audio passé **par chemin de fichier**, IPC validé (§15). | Transcription native dans l'app ; RTF ≈ 0,15× confirmé. |
| **4.3 LLM local** | Adapter `CorrectionPort` → llama.cpp en sidecar. **Décidé (2026-07-03) : Qwen3-8B quantifié Q4** (GGUF Q4_K_M, ~5 Go — machine cible : RTX 3050 8 Go, offload partiel accepté). Passer l'eval 2.5 : si la qualité locale est trop en retrait du cloud, le **documenter** et garder le choix local/cloud visible. | La correction tourne sans réseau ; score eval enregistré et comparé au cloud. |
| **4.4 Composition root desktop** | DI desktop : tout local par défaut (invariant : cloud = opt-in explicite même ici). | **Débrancher le réseau → la boucle complète fonctionne.** C'est le test du positionnement. |

| **4.5 🛑 CHECKPOINT 100 % local** | Fin du run automatique pour ce sprint : l'utilisateur teste l'app desktop **réseau débranché** (boucle complète offline) et compare la qualité de correction local vs cloud (eval 4.3). | L'utilisateur valide explicitement → le run reprend au Sprint 5. |

**Done Sprint 4 :** la promesse du PRD (« la voix ne quitte pas la machine, et même le texte peut ne pas sortir ») est démontrable.

---

## Sprint 5 — Prononciation (Étape 5)

| Lot | Livrable | Done quand |
|---|---|---|
| **5.1 TTS local** | `SpeechSynthesisPort` : kokoro.js (web) + Kokoro natif (desktop). La version corrigée est lue à voix haute. | Latence ≤ 2 s/phrase (acquis Spike #1). |
| **5.2 Tap-sur-mot** | Panneau mot : lecture isolée, mode boucle (N s réglable), vitesse 0,5×/0,75×/1×, IPA + syllabes (PRD §5). | Le flux « je bute sur *interesting* → je boucle dessus » marche. |
| **5.3 Enregistre-toi & compare** | `ear-compare` via `PronunciationScoringPort` → `UnscoredComparison` : lecture A/B référence/toi, waveform simple. **Pas de score chiffré** (Spike #2 NO-GO) — ne pas en afficher un. | Comparaison A/B fluide ; mots pratiqués alimentent le SRS. |

**Done Sprint 5 :** l'itération 3 du PRD est livrée. Le produit couvre toute la boucle §4 du PRD (sauf scoring chiffré, écarté).

---

## Hors périmètre de ce plan (ne pas commencer sans décision)

- **Scoring chiffré** (piste supervisée GOPT) — rouvrable uniquement via un spike dédié (§12).
- **Mobile RN, sync E2E, auth/billing SaaS, 3 niveaux de correction, UK/US, shadowing, clonage de voix** (§18).
- L'app est **mono-utilisateur local** pour l'instant : pas d'auth dans les Sprints 1-5 (le backend fin du lot 2.4 n'expose que le proxy ZDR).

## Jalons de vérification globale (fin de chaque sprint)

1. `pnpm build && pnpm test && pnpm lint:deps` verts.
2. Relire les invariants §1 d'ARCHITECTURE.md — aucun violé.
3. Mettre à jour ce fichier : cocher le sprint, noter les écarts/décisions prises (on ne dévie pas en silence).

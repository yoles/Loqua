# Loqua — Spikes de dé-risquage (protocoles & critères go/no-go)

> **Rôle :** détaille l'Étape 0 de `ARCHITECTURE.md` §19. Ces 3 prototypes **jetables** répondent aux 3 vraies questions techniques du projet **avant** d'écrire le `core` définitif.
> **Règle d'or :** un spike se termine par une **décision** (GO / NO-GO / PIVOT), pas par « ça marche à peu près ». Chaque seuil ci-dessous est chiffré exprès. Le code des spikes n'est pas destiné à être réutilisé — on optimise pour apprendre vite, pas pour bien coder.
> **Date :** 2026-07-02

---

## 0. Matériel de référence (les seuils en dépendent)

Les métriques n'ont de sens que rapportées à une machine. On définit 3 tiers. **Mesurer sur les 3 si possible ; le tier « Low » est le juge de paix** (c'est lui qui décide qui on exclut).

| Tier | Exemple | Rôle dans la décision |
|---|---|---|
| **High** | Desktop récent, GPU dédié / Mac M3+ | Plafond de qualité (foyer du 100 % local) |
| **Mid** | Laptop 2022-2023, GPU intégré / Mac M1 base, 16 Go RAM | **La cible réaliste.** Les seuils GO se jugent ici. |
| **Low** | Laptop d'entrée 2020, 8 Go RAM, pas de WebGPU fiable | Le plancher : définit qui bascule en Option B |

> Note : la machine de dev de l'utilisateur = référence Mid au minimum. Renseigner sa config exacte avant de lancer.

**Convention de mesure :** 3 exécutions, on garde la **médiane**. Cold = premier chargement (modèle non caché). Warm = modèle déjà en cache/mémoire.

---

## 1. Spike #1 — Inférence locale dans le navigateur (le plus critique)

### Question à trancher
Le navigateur peut-il faire tourner **STT + TTS** en local à une qualité/latence acceptables — et, bonus, un **LLM 1-3B** ?

> **Pourquoi c'est LA question existentielle du web :** l'invariant #1 interdit à l'audio de sortir. Donc si Whisper ne tourne pas correctement dans le navigateur, **le web ne peut pas exister en privacy-first** (il faudrait un STT cloud = audio qui sort = invariant violé). Le sort du LLM local est secondaire (l'Option B cloud-ZDR est déjà le défaut) ; **le sort du STT/TTS est bloquant.**

### Hypothèses testées
- H1 (bloquante) : `whisper-base`/`small` transcrit en local à vitesse ≥ temps réel sur Mid.
- H2 (bloquante) : Kokoro synthétise une phrase en local en < 2 s sur Mid.
- H3 (non bloquante) : un LLM 1-3B (WebLLM) produit une correction utilisable en < 15 s sur Mid.

### Ce qu'on construit (jetable)
Une page web unique (pas de framework) qui :
1. enregistre ~30 s d'audio (ou charge un WAV de test),
2. transcrit via `@huggingface/transformers` (Whisper ONNX, backend WebGPU + fallback WASM),
3. synthétise une phrase via `kokoro.js`,
4. corrige le transcript via `@mlc-ai/web-llm` (Qwen2.5-1.5B ou Phi-3-mini, quant. q4),
5. logge toutes les métriques (perf API `performance.now`, `performance.memory` / estimation).

### Protocole
- Jeu de test : 5 clips de 30 s d'anglais parlé par des non-natifs (accent FR), avec fautes typiques dev. Prévoir une transcription humaine de référence.
- Mesurer Cold **et** Warm, sur chaque tier dispo.
- Vérifier la détection WebGPU (`navigator.gpu`) et le comportement du fallback WASM.

### Métriques & seuils

| Métrique | GO (Mid) | Zone grise | NO-GO (Mid) |
|---|---|---|---|
| **STT — RTF** (temps transcription / durée audio) | ≤ 0,5× (30 s en ≤ 15 s) | 0,5–1,0× | > 1,0× |
| **STT — WER** vs référence humaine | ≤ 15 % | 15–25 % | > 25 % |
| **STT — cold start** (chargement modèle) | ≤ 10 s | 10–25 s | > 25 s |
| **TTS — latence phrase** | ≤ 2 s | 2–4 s | > 4 s |
| **RAM crête** (onglet) | ≤ 3 Go | 3–4 Go | crash / > 4 Go |
| **Download total** (STT+TTS mini) | ≤ 400 Mo | 400 Mo–1 Go | > 1 Go |
| **LLM — latence correction** (~200 tok out) *(non bloquant)* | ≤ 15 s | 15–30 s | > 30 s |
| **LLM — tokens/s** *(non bloquant)* | ≥ 15 | 8–15 | < 8 |

### Arbre de décision
- **GO complet** — H1+H2 GO **et** H3 GO sur Mid → le web peut proposer le **100 % local optionnel** (bonne machine). L'`egressGuard` propose le cloud comme *upgrade*, pas comme nécessité.
- **GO partiel (résultat le plus probable, et acceptable)** — H1+H2 GO, H3 en zone grise/NO-GO → **le web reste Option B pour le LLM** (cloud-ZDR opt-in). C'est déjà le défaut de l'architecture. **Aucune révision nécessaire.**
- **NO-GO bloquant** — H1 ou H2 en NO-GO sur Mid → **problème structurel du web privacy-first.** Actions possibles à documenter : (a) restreindre le web au tier High + message clair ; (b) accepter un STT cloud-ZDR *avec consentement audio explicite* — **décision lourde qui touche l'invariant #1, à remonter à l'utilisateur, pas à trancher seul** ; (c) recentrer le privacy-first sur le desktop et faire du web une simple vitrine.

### Ce que ça informe dans ARCHITECTURE.md
- La forme du `TranscriptionPort` (batch confirmé ; streaming seulement si RTF très bon).
- Le `qualityTier` par défaut du web (`local-basic` vs `cloud-native`).
- La stratégie de download progressif (§11) — dimensionnée par le poids mesuré.

### Time-box
**3 jours.** Livrable : tableau de métriques rempli (3 tiers) + une reco d'une page (GO/NO-GO/PIVOT).

---

## 2. Spike #2 — Scoring de prononciation GOP local (le pari R&D)

### Question à trancher
Un scoring **phonème par phonème** en local (sans Azure) atteint-il une **fiabilité utile**, ou reste-t-on longtemps sur `ear-compare` ?

### Hypothèse testée
Un pipeline `wav2vec2 (phonème) → alignement forcé → GOP` produit des scores **corrélés au jugement humain** au niveau mot/phonème.

### Ce qu'on construit (jetable)
Un script (Python autorisé ici — c'est de la R&D, pas du produit) qui :
1. charge un modèle phonème CTC (ex. `wav2vec2-lv-60-espeak-cv-ft` ou équivalent),
2. calcule le **Goodness of Pronunciation** par phonème (log-posterior sur l'alignement forcé du texte cible),
3. agrège en score mot/phrase,
4. compare aux annotations humaines du corpus.

### Protocole
- **Corpus : SpeechOcean762** (annoté par des experts, scores accuracy/fluency au niveau phonème/mot/phrase — c'est la référence académique).
- Échantillon : ≥ 200 énoncés, incluant des locuteurs non-natifs.
- Métrique reine : **corrélation de Pearson (PCC)** entre score GOP calculé et score humain. Repère : les systèmes publiés type Azure/GOP-BERT tournent autour de **PCC 0,6-0,7** au niveau phrase.
- Mesurer aussi la latence de scoring d'un mot (cible desktop) et la taille du modèle.

### Métriques & seuils

| Métrique | GO | Zone grise | NO-GO |
|---|---|---|---|
| **PCC score/humain** (niveau mot) | ≥ 0,55 | 0,40–0,55 | < 0,40 |
| **PCC** (niveau phonème) | ≥ 0,45 | 0,30–0,45 | < 0,30 |
| **Détection binaire** « son raté » (F1) | ≥ 0,70 | 0,55–0,70 | < 0,55 |
| **Latence scoring 1 mot** (desktop High) | ≤ 2 s | 2–5 s | > 5 s |
| **Taille modèle** (desktop viable) | ≤ 1 Go | 1–2 Go | > 2 Go |

### Arbre de décision
- **GO** — PCC mot ≥ 0,55 → **le GOP local est viable.** Planifier la V2 scoring (§12), desktop d'abord. `PronunciationScoringPort` renverra du `ScoreResult` réel.
- **PIVOT** — zone grise → ne pas promettre le scoring phonème « façon ELSA ». Étudier un **proxy plus simple et honnête** : détection binaire « son proche / son raté » (si F1 ≥ 0,70), ou comparaison DTW/MFCC vs référence. Livrer ça comme feedback qualitatif, pas comme score chiffré trompeur.
- **NO-GO** — PCC < 0,40 **et** F1 < 0,55 → **rester sur `ear-compare` durablement.** Le scoring quantitatif n'est pas un différenciateur atteignable seul à court terme. Le documenter franchement dans le PRD (ne pas survendre).

### Ce que ça informe dans ARCHITECTURE.md
- Si `PronunciationScoringPort` renvoie majoritairement `ScoreResult` (GO) ou reste sur `UnscoredComparison` longtemps (NO-GO).
- La feuille de route §12 (V2 planifiée vs repoussée).
- Le discours produit sur la « brique clé » (promesse ferme vs objectif).

### Time-box
**4 jours** (le plus incertain). Livrable : tableau PCC/F1 + verdict GO/PIVOT/NO-GO + recommandation sur la formulation produit.

---

## 3. Spike #3 — Tauri + sidecar natif (validation du pattern, pas de la perf)

### Question à trancher
Le pattern **« même frontend React, adapters substitués »** tient-il ? Le desktop peut-il piloter `whisper.cpp` natif via IPC sans polluer le `core` ?

### Hypothèses testées
- H1 : le frontend web tourne tel quel dans une fenêtre Tauri.
- H2 : un adapter Tauri (`invoke()` → commande Rust → `whisper.cpp`) satisfait le **même `TranscriptionPort`** que l'adapter web, sans changer une ligne du `core`.
- H3 : passer l'audio au sidecar est praticable (via **chemin de fichier**, pas via sérialisation d'octets dans l'IPC).

### Ce qu'on construit (jetable)
Un projet Tauri 2 minimal :
1. wrappe une page React triviale (bouton « transcrire »),
2. une commande Rust `transcribe(path)` qui appelle `whisper.cpp` (binaire ou lib) sur un WAV local,
3. renvoie `{text, words[]}` au front via IPC,
4. un mini `TranscriptionPort` + 2 adapters (web WASM factice + tauri) montrant la substitution par le composition root.

### Protocole
- Même WAV de test que le Spike #1 → comparer la vitesse natif vs WASM.
- Vérifier que l'audio transite par **chemin de fichier** (l'octet ne traverse pas l'IPC JSON).
- Vérifier qu'aucun code du « core » factice ne connaît Tauri.

### Métriques & seuils

| Métrique | GO | NO-GO |
|---|---|---|
| **Frontend React dans Tauri** | tourne sans adaptation majeure | nécessite un fork du front |
| **Substitution d'adapter** | `core` inchangé, DI au composition root | logique conditionnelle plateforme dans le core |
| **whisper.cpp natif — RTF** | ≤ 0,3× (nettement < WASM) | ≥ WASM (aucun gain) |
| **IPC audio** | par chemin de fichier, fluide | blocage/latence sur gros fichiers |
| **Sécurité IPC** | entrées validées, pas d'exécution arbitraire | surface non maîtrisée |

### Arbre de décision
- **GO** (attendu) — pattern validé → l'Étape 4 (desktop 100 % local) est débloquée telle que décrite. On généralisera aux sidecars `llama.cpp` / Kokoro.
- **NO-GO** (peu probable) — front incompatible ou IPC ingérable → réévaluer le véhicule desktop (Electron ? app native ?) **avant** d'investir dans `/adapters-tauri`. Remonter à l'utilisateur.

### Ce que ça informe dans ARCHITECTURE.md
- Confirme (ou non) `/apps/desktop` + `/adapters-tauri` (§4, §5).
- Fige la convention de passage de l'audio aux sidecars (chemin de fichier).
- Confirme le durcissement IPC (§15).

### Time-box
**2 jours.** Livrable : repo de démo + note GO/NO-GO + convention IPC retenue.

---

## 4. Séquencement & interprétation d'ensemble

```
Jour 1 ────────────────────────────────────────────────► 
  Spike #1 (web STT/TTS/LLM)   ── 3j ──┐
  Spike #2 (GOP scoring)       ── 4j ──┤  (en parallèle, R&D indépendante)
                                        │
  Spike #3 (Tauri sidecar)     ── 2j ──┘  (indépendant, lancer quand une main est libre)
```

- **#1 et #2 en parallèle** (compétences/environnements différents : web/JS vs ML/Python). **#3** quand une ressource se libère.
- **#1 est prioritaire** : il gate l'existence même du web privacy-first.
- Aucun des trois ne dépend des autres pour démarrer.

### Matrice de décision globale (ce qu'on fait selon les résultats)

| #1 (web local) | #2 (scoring) | #3 (Tauri) | Conséquence |
|---|---|---|---|
| GO partiel | GO/PIVOT | GO | **Cas nominal** — on démarre l'Étape 1 sans révision. Web = Option B, scoring planifié. |
| GO complet | GO | GO | Idéal — web propose aussi le 100 % local ; scoring V2 confirmé. |
| NO-GO bloquant | — | GO | **Révision majeure** : privacy-first recentré desktop, web = vitrine. Remonter à l'utilisateur. |
| — | NO-GO | — | Scoring reste `ear-compare` ; ajuster PRD/roadmap et discours produit. |
| — | — | NO-GO | Réévaluer le véhicule desktop avant `/adapters-tauri`. |

### Règle finale
Tant que **#1 (au moins H1+H2)** et **#2** n'ont pas rendu leur verdict, **on n'écrit pas le `core` définitif** (les résultats fixent la forme des ports Transcription et Scoring). L'Étape 1 de `ARCHITECTURE.md` §19 démarre une fois #1 tranché.

Si un spike révèle un mur, on **met à jour `ARCHITECTURE.md` explicitement** (décision tracée), on ne dévie pas en silence.

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

---

## 5. Résultats — Spike #1 (2026-07-03) · verdict **GO partiel**

> Le harness ayant servi à ces mesures est jetable et **non versionné** (reste local). Seul ce verdict fait foi.

### Machine testée
RTX 3050 8 Go · 12 threads · 32 Go RAM · Ubuntu (X11) · **Chromium 149**. Tier réel : High (représentatif Mid+).

**Friction majeure :** WebGPU *hardware* n'était **pas accessible par défaut**. Il a fallu activer les flags (`chrome://flags` → `enable-unsafe-webgpu` + `enable-vulkan`) **puis** lancer avec `--disable-gpu-sandbox` pour que Dawn utilise le GPU NVIDIA (sinon `requestAdapter()` → `null`, ou repli SwiftShader/CPU). De plus : **fp16 non exposé** (`shader-f16` absent) et **q8 cassé** sur WebGPU (RTF 7×, sortie en charabia) → **seul fp32 fonctionne** sur ce combo.

### Mesures clés (WebGPU, RTX 3050, fp32 sauf indication)

| Run | STT RTF | STT WER | TTS | cold start | download |
|---|---|---|---|---|---|
| base.en fp32 (enregistrement perso) | 0,13× | 20,5 %* | 2,5 s | 22,9 s | 619 Mo |
| small.en fp32 (enregistrement perso) | 0,15× | 31,8 %* | 1,1 s | 25,5 s | 1296 Mo |
| **small.en fp32 (clip JFK, réf. connue)** | **0,21×** | **0,0 %** | 1,1 s | 4,9 s (chaud) | — |
| base.en q8 (WebGPU) | 7,6× ❌ | 754 % ❌ | 12 s ❌ | — | 172 Mo |
| base.en q8 (WASM, sans GPU) | 0,29× | 22,7 % | 10-20 s | 3,8 s | 172 Mo |

\* WER perso élevé et incohérent (base < small) = **artefact de mesure** (référence non verbatim + accent + échantillon unique de 26 s). Le clip **JFK à 0,0 %** prouve que **le modèle STT n'est pas en cause**.

LLM local navigateur (Qwen2.5-1.5B q4f16, WebLLM) : **échec** — `Invalid ShaderModule / index_kernel` sur ce Dawn/Chromium. Non bloquant (H3).

### Verdict
- ✅ **H1 (STT) — GO.** Vitesse RTF 0,13-0,21× (≪ 0,5×) **et** qualité 0 % WER sur audio propre. La qualité réelle dépendra de la prise (micro/accent), pas du modèle.
- ✅ **H2 (TTS) — GO.** 1,1 s/phrase.
- ✅ RAM heap OK (~1,7 Go ; VRAM non mesurée mais 8 Go ont suffi).
- ❌ **Download / cold start — NO-GO sur ce combo Linux/NVIDIA/Chromium** (fp32 forcé → 0,6-1,3 Go). **Spécifique** (fp16 divise par 2 sur Mac/Windows) et **mitigeable** (download progressif, coût de 1ʳᵉ visite).
- ❌ **LLM navigateur-local — échec ici** (shader). **Non bloquant** : LLM en cloud-ZDR opt-in par défaut.

### Enseignement transverse (le plus important)
**Le « web 100 % local » sous Linux/NVIDIA est impraticable pour le grand public** (flags + `--disable-gpu-sandbox` requis, fp16 absent, q8 cassé, LLM navigateur en échec). → **Confirme la décision d'archi** : 100 % local desktop = **Tauri** (Vulkan natif, `whisper.cpp`/`llama.cpp` natifs, sans flags ni sandbox) ; **web = vitrine + lite** (STT WASM à 0,29× — utilisable — + LLM cloud-ZDR), propre nativement sur **Mac/Windows**.

→ **Prochaine étape logique : Spike #3 (Tauri).**

---

## 6. Résultats — Spike #3 (2026-07-03) · verdict **GO**

> Harness jetable **non versionné** (`spikes/spike-3-tauri/`, gitignoré). Seul ce verdict fait foi.

### Setup
Même machine (RTX 3050, 12 threads, Ubuntu X11, Rust 1.96). Tauri 2 (React-TS) via `create-tauri-app`. STT natif = `whisper-rs` (compile `whisper.cpp`). Modèle `ggml-base.en.bin`, clip JFK 16 kHz.

**Friction : quasi nulle.** Une seule install manquante (`sudo apt install cmake`) — toutes les libs desktop (webkit2gtk-4.1, gtk3, libsoup3) étaient déjà là. Coût unique : le 1ᵉʳ build compile whisper.cpp (~minutes). **Aucun flag, aucun `--disable-gpu-sandbox`, aucune quantification cassée** — contraste total avec le Spike #1.

### Résultat
| Hypothèse | Verdict |
|---|---|
| **H1** — frontend React dans Tauri | ✅ fenêtre desktop rendue |
| **H2** — adapter substitué, `core` agnostique | ✅ `core.ts` n'importe pas Tauri ; web↔tauri = seul l'adapter change (composition root). Preuve visuelle : navigateur → adapter « web (stub) », fenêtre Tauri → adapter « tauri (whisper.cpp natif) » |
| **H3** — audio par chemin de fichier | ✅ `wav_path` (string) passé à l'IPC, pas d'octets |
| **RTF** | ✅ **0,151×** — 11 s transcrites en 1660 ms, **whisper.cpp natif CPU** |
| Qualité | ✅ transcript JFK au mot près |

### Verdict : **GO**
whisper.cpp natif CPU atteint **0,151×** — équivalent au WebGPU navigateur (0,13-0,21×) **mais sans aucune des frictions du #1**. Le pattern « même frontend + `core` agnostique + adapters substitués » est **validé**.

### Enseignement
**Tauri est le véhicule robuste du 100 % local desktop**, comme le postulait l'archi. Là où le navigateur exige flags/sandbox/precision-hacks (Spike #1), Tauri parle au natif directement. Bonus non testé : feature CUDA de `whisper-rs` → la RTX 3050 accélérerait encore. Décision d'archi (100 % local = desktop/Tauri ; web = vitrine/lite) **confirmée sur les deux bouts** (#1 + #3).

### Reste
- **Spike #2 (scoring GOP)** — fait le 2026-07-03, voir §7 ci-dessous.
- Le pipeline complet local desktop (STT natif → LLM local llama.cpp → TTS Kokoro natif) reste à assembler, mais les briques STT sont prouvées (natif #3 + WASM #1).

---

## 7. Résultats — Spike #2 (2026-07-03) · verdict **NO-GO** (scoring chiffré non-supervisé)

> Harness jetable **non versionné** (`spikes/spike-2-gop-scoring/`, gitignoré). Seul ce verdict fait foi.

### Setup
Même machine, **torch/torchaudio CPU** (le mismatch CUDA `libcudart.so.13` a fait abandonner le GPU — sans conséquence, les énoncés sont courts). Modèle phonème `facebook/wav2vec2-lv-60-espeak-cv-ft` (vocab 392, sortie IPA eSpeak). Corpus **SpeechOcean762** (test), **N = 100 énoncés / 488 mots**. Alignement forcé CTC (Viterbi) **réimplémenté en NumPy** (torchaudio inutilisable). Texte de référence phonémisé via `phonemizer`/espeak-ng.

### Mesures (GOP non-supervisé)

| Métrique | Mesuré | Seuil | Verdict |
|---|---|---|---|
| **PCC mot** (GOP vs accuracy humaine) | **0,25** | ≥ 0,55 GO · < 0,40 NO-GO | ❌ NO-GO |
| **PCC phrase** | 0,42 | repère Azure ≈ 0,6-0,7 | zone grise |
| **Détection binaire « mot raté » (F1)** | **0,29** | ≥ 0,70 | ❌ très en dessous |
| Latence / énoncé (RTF, CPU) | 0,093× · médiane 308 ms | ≤ 2 s/mot | ✅ (mais hors sujet) |

**Contrôle méthodo important :** testé les **deux formulations** de GOP — moyenne brute du log-posterior de la cible, **et** GOP normalisé Witt & Young (cible − meilleur concurrent par frame). Résultat **identique** (PCC 0,253 dans les deux cas). Le plafond bas **n'est donc pas un artefact de formule** : c'est le plafond réel du GOP non-supervisé. C'est cohérent avec la littérature — les scores publiés à PCC 0,6+ (Azure, GOPT) proviennent de **modèles entraînés en supervisé** (régression sur les features GOP → scores humains), pas du GOP brut.

### Verdict : **NO-GO** sur le scoring chiffré non-supervisé
On ne peut afficher **ni un score de prononciation fiable, ni même un drapeau binaire « mot mal prononcé » honnête** avec le GOP brut. La latence excellente (0,093× CPU) ne rachète rien : le signal n'est pas corrélé au jugement humain. Ce résultat **ne renverse pas l'architecture — il la confirme** : la position « V1 = `ear-compare`, scoring = R&D non résolu » est désormais chiffrée.

### Enseignement & porte de sortie
- **Court terme :** rester sur `ear-compare` (comparaison qualitative à l'oreille / diff textuelle). Ne **pas** promettre de score chiffré « façon ELSA » — ce serait survendre.
- **Piste R&D (hors MVP, non promise) :** un scorer **supervisé façon GOPT** (petit transformer entraîné sur SpeechOcean762 à partir des features GOP + alignement) pourrait viser PIVOT/GO. C'est un **vrai chantier ML d'entraînement**, à ouvrir seulement si le scoring devient un objectif produit prioritaire.
- Implication ports (§ ARCHITECTURE) : `PronunciationScoringPort` reste sur `UnscoredComparison` ; pas de `ScoreResult` chiffré tant que la piste supervisée n'a pas été validée par un spike dédié.

### Bilan des 3 spikes
STT/TTS local **prouvés** (desktop #3 GO, web/WASM #1 GO partiel) · scoring chiffré **écarté à court terme** (#2 NO-GO). Le MVP verrouillé (Enregistrer → STT local → correction 1 niveau → diff cliquable, `ear-compare`) est **entièrement dé-risqué** ; aucune de ses briques ne dépend du scoring GOP.

# Architecture Loqua — Direction de référence

> **Nature :** document d'architecture **ferme**. Ce sont des décisions arrêtées, pas des options.
> **Destinataire :** l'agent d'implémentation (Claude Fable 5) et tout contributeur. Ce document est la source de vérité ; en cas de doute, il prime sur l'intuition.
> **Sources :** `PRD.md` (v2), `ANALYSE_CRITIQUE_PRD.md`, `ARCHITECTURE_brouillon.md`.
> **Date :** 2026-07-02

---

## 0. Comment utiliser ce document (pour l'agent d'implémentation)

- Les **invariants (§1)** ne se violent jamais. Si une tâche semble l'exiger, s'arrêter et signaler le conflit.
- Les **signatures de ports (§9)** sont des contrats. On peut les enrichir, jamais les contourner (pas de `fetch` hors adapter, pas de logique métier hors `core`).
- Respecter la **règle de dépendance (§6)** : la flèche pointe toujours vers `core`. Un lint la fait respecter.
- Suivre le **plan de livraison (§19)** dans l'ordre : les **spikes d'abord**. On n'écrit pas le `core` définitif avant que les 3 spikes aient tranché la faisabilité.
- Régime de test **dédoublé (§17)** : TDD/BDD sur le déterministe, eval harness sur l'IA. Ne jamais écrire un `expect(...).toBe(...)` sur une sortie de LLM.

---

## 1. Invariants (non négociables)

1. **L'audio ne quitte jamais l'appareil.** STT, TTS, scoring sont locaux, toujours.
2. **Seul du texte peut sortir**, vers un LLM cloud-ZDR, **uniquement en opt-in explicite**. Un **unique point de sortie** dans le `core` autorise ou refuse tout `fetch` sortant de contenu.
3. **Coût marginal serveur ~0.** Aucune orchestration ni traitement d'audio côté serveur. Le serveur ne lit jamais de données utilisateur (blobs chiffrés opaques).
4. **Partager la logique, pas l'UI.** Le `core` est en TypeScript pur : zéro React, zéro DOM, zéro API navigateur/Node, zéro `fetch`.
5. **Fallback jamais silencieux.** Toute bascule local→cloud est consentie et visible dans l'UI.
6. **Effacement RGPD by design.** Toute donnée dérivée (ex. carte SRS) stocke une **copie de valeur**, jamais une référence à la donnée source effaçable.

---

## 2. Décisions arrêtées

| # | Décision | Choix |
|---|---|---|
| 1 | Topologie runtime | **Option B** — client local + backend fin. Construite pour que le **100 % local (A) soit un sous-cas** (débrancher le proxy LLM). |
| 2 | Plateformes | **Web (vitrine + lite)** & **Desktop Tauri (foyer du 100 % local)** en parallèle. Mobile (RN/Expo) plus tard. |
| 3 | Stack client | **Next.js (web) + Tauri (desktop) d'abord.** Même frontend React, adapters substitués. |
| 4 | Machine à états | **Maison** (reducer TS pur dans le `core`). Migration XState possible plus tard, derrière la même frontière. |
| 5 | Persistance | **SQLite partout** (SQLite-WASM + OPFS sur web ; SQLite/SQLCipher natif desktop/mobile) derrière `StoragePort`. |
| 6 | Scoring | **`ear-compare` tôt** (aucun modèle). **GOP local en spike parallèle**, hors chemin critique du MVP. |
| 7 | Sync SaaS | **Local-only maintenant.** Invariants d'effacement/copie-de-valeur figés dès aujourd'hui. Sync E2E = feature ultérieure. |
| — | LLM correction | **Cloud-ZDR opt-in par défaut (Option B)**, adapter **local dispo sur desktop** (Tauri, gros modèles). Choisi par plateforme + consentement. |

---

## 3. Vue d'ensemble du système

```
        ┌───────────────────────────────────────────────┐
        │   UI par plateforme (FSD)  — jetable, non partagée
        │   /apps/web (Next.js)   /apps/desktop (Tauri)   │
        └───────────────────────┬───────────────────────┘
                                 │ use-cases
        ┌───────────────────────▼───────────────────────┐
        │                  CORE (TS pur)                  │
        │  5 bounded contexts · use-cases · PORTS ·       │
        │  pipeline state machine · event bus · eval fixtures
        └─┬────────┬────────┬────────┬────────┬──────────┘
          │ ports  │        │        │        │
      ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ┌───▼───┐ ┌──▼─────┐ ┌──────────┐
      │ STT  │ │ LLM  │ │ TTS  │ │Scoring│ │Storage │ │ModelRuntime│
      └───┬──┘ └───┬──┘ └───┬──┘ └───┬───┘ └──┬─────┘ └────┬─────┘
          │        │        │        │        │            │
      ╔═══▼════════▼════════▼════════▼════════▼════════════▼═══╗
      ║  ADAPTERS  — /adapters-web (WASM/WebGPU) · /adapters-tauri (Rust sidecars)  ║
      ╚═══════════════════════════════════════════════════════╝
                                 │ (Option B, opt-in, TEXTE uniquement)
                        ┌────────▼────────┐
                        │ /services/api    │  auth · entitlement · proxy LLM ZDR · sync blobs
                        └──────────────────┘
```

---

## 4. Stratégie plateformes & runtimes

| Plateforme | Runtime des modèles | LLM correction par défaut | Rôle |
|---|---|---|---|
| **Web** | `transformers.js` (ONNX + WebGPU), `kokoro.js`, WebLLM | **Cloud-ZDR opt-in** (WebLLM possible si bonne machine) | Vitrine, essai rapide, entrée "lite" |
| **Desktop (Tauri)** | Sidecars natifs Rust : `whisper.cpp`, `llama.cpp`, Kokoro, wav2vec2 | **Local** (jusqu'à 14-27B) — 100 % local possible | Foyer du 100 % local, scoring GOP |
| **Mobile (plus tard)** | WhisperKit, `llama.rn`, Piper | Cloud-ZDR opt-in | Grand public |

**Principe :** web et desktop **partagent le frontend React et le `core`**. Seuls les adapters injectés diffèrent (composition root par app). Le mobile réécrit l'UI en RN mais réutilise le `core` à 100 %.

---

## 5. Structure du monorepo

**Outil : Turborepo.** Gestionnaire de paquets : pnpm workspaces.

```
/packages
  /core                 # TS pur. AUCUNE dépendance runtime (ni React, DOM, Node, fetch).
    /contexts
      /correction        # entities, use-cases, events, taxonomie d'erreurs
      /pronunciation     # word practice, scoring model, minimal pairs
      /srs               # algo répétition espacée, cartes, planning
      /gamification      # xp, streak, level, badges (event-driven)
      /identity          # account, entitlement, consent
    /pipeline            # machine à états de la Session (orchestration)
    /ports               # interfaces (contrats) — voir §9
    /events              # bus d'événements de domaine + définitions
    /shared              # value objects transverses (Variant, Phoneme, Ids…)
  /adapters-web          # transformers.js, WebLLM, kokoro.js, sqlite-wasm+OPFS, fetch proxy
  /adapters-tauri        # invoke() vers sidecars Rust ; SQLite natif
  /adapters-native       # (plus tard) WhisperKit, llama.rn, SQLCipher
  /ui-web                # composants React DOM partagés web↔desktop (PAS avec RN)
/apps
  /web                   # Next.js + FSD (app/pages/widgets/features/entities/shared)
  /desktop               # Tauri — réutilise /apps/web comme frontend + sidecars Rust
  /mobile                # (plus tard) Expo + React Native
/services
  /api                   # backend FIN (Hono sur Cloudflare Workers) : auth, entitlement, proxy, sync
/tooling
  /eval                  # harness d'éval IA (golden sets, LLM-juge, non-régression)
```

### Règle de dépendance (imposée par `dependency-cruiser` en CI)
- `core` n'importe **jamais** un adapter, une app, un framework, ni une API de plateforme.
- Les adapters implémentent les ports de `core/ports`.
- Les apps sont le **composition root** : elles instancient les adapters et les injectent dans les use-cases du `core`.
- **Zéro logique métier hors `core`.** Un `if` métier dans un adapter ou une app = bug d'architecture à corriger.

---

## 6. Le cœur métier : bounded contexts & langage ubiquitaire

Cinq contextes, langages distincts. Ne pas les fusionner.

### Correction
- **Langage :** `Utterance`, `Variant` (en-US | en-GB), `CorrectionLevel` (natural pour le MVP), `Correction`, `ErrorType`, `Explanation`, `CorrectedUtterance`.
- **Agrégat racine :** `Session` (contient l'audio local ref, le transcript, la correction). Invariant : une `Correction` n'existe que dans une `Session`.

### Pronunciation Training
- **Langage :** `Word`, `Phoneme`, `IPA`, `Syllable`, `PracticeAttempt`, `ScoreResult | UnscoredComparison`, `MinimalPair` (V2).
- **Agrégat racine :** `PracticeAttempt`.

### SRS
- **Langage :** `Card`, `ReviewItem`, `Ease`, `Interval`, `NextReview`, `Lapse`, `ReviewGrade`.
- **Agrégat racine :** `Card`. **Invariant #6 : la `Card` stocke une copie de valeur** de l'item (mot ou faute), jamais un pointeur vers la `Session`.
- Algorithme : SM-2 (ou FSRS) — **déterministe, 100 % testable, zéro I/O**.

### Gamification
- **Langage :** `XP`, `Streak`, `Level`, `Rank`, `Badge`, `Challenge`.
- **Piloté par événements** (ne lit pas directement les autres contextes).
- **Règle du Streak à spécifier au test près :** fuseau = fuseau local de l'appareil ; le jour bascule à minuit local ; « ≥ 60 s de parole *détectée* » (pas micro ouvert) ; cumul autorisé sur la journée. À couvrir par scénarios Gherkin (§17).

### Identity & Billing
- **Langage :** `Account`, `Subscription`, `Entitlement`, `Consent` (dont consentement biométrique RGPD art. 9).
- Contexte support. L'`Entitlement` ne nécessite aucune donnée utilisateur.

---

## 7. Événements de domaine & communication inter-contextes

**Bus d'événements in-process** dans `core/events` : synchrone, typé, testable. Pas d'ACL formels pour l'instant (sur-ingénierie).

Événements minimaux (le producteur publie, les consommateurs s'abonnent) :

| Événement | Producteur | Consommateurs |
|---|---|---|
| `SessionCompleted` | Correction | Gamification (XP), SRS |
| `ErrorDetected {type, value}` | Correction | SRS (crée une `Card` — copie de valeur) |
| `PronunciationValidated {word}` | Pronunciation | Gamification, SRS |
| `SoundMissed {phoneme}` | Pronunciation | SRS |
| `CardReviewed {grade}` | SRS | Gamification |
| `ConsentChanged` | Identity | Point de sortie de données (§16) |

Règle : un événement transporte des **copies de valeur immuables**, jamais des entités mutables d'un autre contexte.

---

## 8. Ports — vue d'ensemble

| Port | Rôle | Adapters (web / tauri / native) |
|---|---|---|
| `TranscriptionPort` | audio → texte + timestamps mots | whisper WASM / whisper.cpp / WhisperKit |
| `CorrectionPort` | texte → correction structurée | WebLLM ou cloud-ZDR / llama.cpp ou cloud / cloud |
| `SpeechSynthesisPort` | texte → audio | kokoro.js (fallback WebSpeech) / Kokoro natif / Piper |
| `PronunciationScoringPort` | audio + mot → score | ear-compare / GOP wav2vec2 / GOP |
| `StoragePort` | persistance | sqlite-wasm+OPFS / SQLite / SQLCipher |
| `ModelRuntimePort` | cycle de vie des modèles | download/cache OPFS / filesystem / filesystem |
| `SyncPort` (plus tard) | push/pull blobs chiffrés | HTTP api |
| `ClockPort` | temps (streak, SRS) — **injecté**, jamais `Date.now()` direct | système |

---

## 9. Contrats des ports (TypeScript — source de vérité)

```ts
// ---------- shared ----------
export type Variant = 'en-US' | 'en-GB';
export type QualityTier = 'local-basic' | 'local-strong' | 'cloud-native';

export interface RuntimeCapability {
  available: boolean;          // l'adapter peut-il tourner ici et maintenant ?
  qualityTier: QualityTier;
  requiresConsentToSendText?: boolean; // true pour l'adapter cloud
}

export interface AudioClip {
  id: string;                  // hash du contenu → mémoïsation/idempotence
  format: 'wav' | 'webm' | 'pcm';
  sampleRate: number;
  data: ArrayBuffer;           // reste LOCAL — ne franchit jamais un adapter réseau
  durationMs: number;
}

// ---------- STT ----------
export interface WordTiming { text: string; startMs: number; endMs: number; confidence?: number; }
export interface TranscriptionResult { text: string; words: WordTiming[]; language: string; }

export interface TranscriptionPort {
  capability(): RuntimeCapability;
  transcribe(audio: AudioClip, opts?: { language?: string }): Promise<TranscriptionResult>;
}

// ---------- Correction (LLM) ----------
export type ErrorType =
  | 'grammar' | 'syntax' | 'vocabulary' | 'idiom' | 'register' | 'word-order' | 'article' | 'tense';

export interface Correction {
  original: string;
  fixed: string;
  type: ErrorType;
  explanation: string;                       // 1 phrase
  span?: { startWord: number; endWord: number };
}
export interface CorrectionResult {
  variant: Variant;
  correctedText: string;
  corrections: Correction[];
  qualityTier: QualityTier;                  // le core le connaît et le restitue à l'UI
}
export interface CorrectionPort {
  capability(): RuntimeCapability;
  correct(input: { text: string; variant: Variant }): Promise<CorrectionResult>;
  // NB: 'level' (minimal/naturel/natif) est hors MVP — 'naturel' seulement.
}

// ---------- TTS ----------
export interface SpeechSynthesisPort {
  capability(): RuntimeCapability;
  synthesize(input: { text: string; variant: Variant; rate?: number }): Promise<AudioClip>;
}

// ---------- Scoring ----------
export interface PhonemeScore { phoneme: string; score: number; }  // 0..100
export interface ScoreResult {
  kind: 'scored';
  overall: number;                 // 0..100
  phonemes: PhonemeScore[];
  worstSyllableIndex?: number;
}
export interface UnscoredComparison {
  kind: 'unscored';                // ear-compare V1 : pas de score, juste l'audio à comparer
  referenceClipId: string;
  userClipId: string;
}
export interface PronunciationScoringPort {
  capability(): RuntimeCapability;
  score(input: { audio: AudioClip; targetWord: string; ipa?: string }):
    Promise<ScoreResult | UnscoredComparison>;
}

// ---------- Storage ----------
export interface StoragePort {
  read<T>(collection: string, id: string): Promise<T | null>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  query<T>(collection: string, filter: Record<string, unknown>): Promise<T[]>;
  delete(collection: string, id: string): Promise<void>;
  eraseAll(): Promise<void>;       // droit à l'effacement (invariant #6)
}

// ---------- Model runtime ----------
export interface ModelDescriptor { id: string; task: 'stt'|'tts'|'llm'|'scoring'; sizeBytes: number; checksum: string; }
export interface ModelRuntimePort {
  list(): ModelDescriptor[];
  isReady(modelId: string): Promise<boolean>;
  download(modelId: string, onProgress: (ratio: number) => void): Promise<void>;
  evict(modelId: string): Promise<void>;
}

// ---------- Clock (déterminisme des tests) ----------
export interface ClockPort { now(): number; timezone(): string; }
```

**Règle du `qualityTier` :** aucun consommateur ne suppose une qualité. Le `core` sait quel tier a produit la correction et l'expose à l'UI (« correction en mode local — activer la correction avancée ? »).

---

## 10. Machine à états du pipeline (orchestration)

Vit dans `core/pipeline`. **Reducer pur** `(state, event) => state`. Aucun I/O dans le reducer ; les effets sont exécutés par un runner qui appelle les ports.

```
IDLE
 └─(RecordStarted)→ RECORDING
     └─(RecordStopped)→ TRANSCRIBING ──(TranscribeOk)→ TRANSCRIBED
          │                              └─(TranscribeErr)→ FAILED_STT (retry|abort)
          └─(userEdit?)                  
     TRANSCRIBED ──(CorrectStarted)→ CORRECTING
          ├─(CorrectOk)→ CORRECTED
          └─(CorrectErr)→ FAILED_LLM (retry | dégrader vers adapter local | proposer opt-in cloud)
     CORRECTED → READY                     (diff affiché — cœur du MVP)
       └─(SynthesizeRequested)→ SYNTHESIZING → PLAYABLE   (TTS, itération 2)
     READY/PLAYABLE → (WordTapped)→ PRACTICING → SCORING → SCORED   (pronunciation)
```

**Règles obligatoires :**
- **Idempotence :** `TranscriptionResult` est mémoïsé sur `AudioClip.id` (hash) → jamais re-transcrire le même audio. Idem correction sur (hash transcript + variant).
- **Politique d'échec par transition** explicite (retry N fois / dégrader / demander à l'utilisateur). Pas de silencieux.
- **Reprise :** l'audio et l'état courant sont persistés (`StoragePort`) ; à la réouverture, le runner reprend à la dernière transition validée.
- **Le TTS et la practice sont hors chemin MVP** : la machine s'arrête utilement à `READY` (diff affiché).

---

## 11. Runtime des modèles & distribution

- **Ne jamais bundler** les modèles dans le binaire. **Téléchargement à la première utilisation** depuis un CDN, cache OPFS (web) / filesystem (desktop).
- **Download progressif :** un modèle **mini** d'abord (app utilisable vite), upgrade en fond. La première impression en dépend.
- `ModelRegistry` (données : id, tâche, taille, checksum, url) + `ModelRuntimePort` (download/load/evict/progress). Vérifier le checksum avant activation.
- **Gouvernance du fallback (privacy) :** si un adapter local échoue (OOM, WebGPU absent), la bascule vers l'adapter cloud passe par le **point de sortie unique (§16)** → refusée sans consentement, sinon signalée dans l'UI.

---

## 12. Scoring — feuille de route

1. **V1 (MVP+) — `ear-compare`** : adapter qui renvoie `UnscoredComparison`. L'UI joue référence + enregistrement, affiche éventuellement waveform/pitch (DSP local simple). Zéro modèle, zéro risque ML.
2. **V2 — GOP local** : `wav2vec2` (reconnaissance phonème) + alignement forcé + Goodness of Pronunciation → `ScoreResult`. **Desktop d'abord.** Corpus : SpeechOcean762. **Traité comme un spike R&D (§19), budget dédié.**
3. **V3** — paires minimales, calibrage. Seulement quand V2 est fiable.

Les consommateurs (SRS, gamification) gèrent `UnscoredComparison` **dès maintenant** pour ne pas payer l'ajout du scoring partout plus tard.

---

## 13. Persistance (SQLite partout)

- **StoragePort** abstrait la base. Implémentations :
  - Web : `sqlite-wasm` (officiel SQLite) sur **OPFS** (persistant, hors quota fragile d'IndexedDB).
  - Desktop/Mobile : SQLite natif, **SQLCipher** pour chiffrer au repos.
- Audio & modèles : fichiers en OPFS (web) / filesystem (desktop), référencés par id — **jamais** de blob audio dans un flux réseau.
- **Effacement (invariant #6) :** `eraseAll()` supprime base + fichiers locaux. Les `Card` SRS survivent à la suppression d'une `Session` car elles stockent des copies de valeur.

---

## 14. Sync & backend (différé, mais cadré maintenant)

- **Maintenant : local-only.** Pas de `SyncPort` implémenté.
- **Figé dès aujourd'hui pour ne pas se piéger :** copies de valeur (invariant #6), schéma pensé pour un `updatedAt` + `deletedAt` (soft-delete) par enregistrement → prêt pour un futur sync.
- **Backend `/services/api` (Hono / Cloudflare Workers), surface minuscule :**
  - `auth` (compte/login), `entitlement` (abonnement actif, sans donnée user).
  - `proxy LLM ZDR` : reçoit du **texte**, garde la clé API, région UE, **ne logge pas le contenu**.
  - `sync` (plus tard) : stocke/sert des **blobs chiffrés** opaques ; honore `deletedAt`.
- Chiffrement E2E : clé dérivée d'un secret utilisateur, **jamais** sur le serveur.

---

## 15. Gouvernance de la vie privée

- **Point de sortie unique :** une seule fonction du `core` (`egressGuard`) décide si du texte peut partir (consentement + opt-in Option B + capacité de l'adapter). Aucun adapter ne fait de `fetch` de contenu sans passer par elle.
- **Consentement biométrique** (audio, même local) modélisé dans Identity/`Consent`, requis avant première utilisation du micro.
- **Observabilité privacy-preserving :** métriques anonymes/locales ; aucune télémétrie de contenu ; masquage systématique si Sentry-like.
- **Durcissement Tauri :** valider toutes les entrées de l'IPC vers les sidecars Rust.

---

## 16. Architecture de la qualité (tests & eval)

**Deux régimes, jamais mélangés.**

| Cible | Régime | Outillage |
|---|---|---|
| SRS, gamification, streak, machine à états, taxonomie, `egressGuard` | **TDD + BDD (Gherkin)** | Vitest ; `core` testé en Node pur ; `ClockPort` injecté (pas de `Date.now`) |
| Sortie JSON de correction | **Contrat strict** | Zod (schéma = §9) ; test de validité + gestion du malformé (les LLM en produisent) |
| Qualité de correction (LLM) | **Eval harness** | `/tooling/eval` : golden set 50-100 énoncés dev + refs, assertions **sémantiques**, LLM-juge, non-régression |
| Scoring (GOP) | **Eval harness** | Corrélation vs corpus annoté (SpeechOcean762) |

**Règle :** `/tooling/eval` existe **dès le premier prompt de correction**. Tout changement de modèle local/prompt passe l'eval avant merge.

---

## 17. Stack technique (choix concrets)

- **Monorepo :** pnpm + Turborepo. Lint dépendances : `dependency-cruiser`.
- **Langage :** TypeScript strict partout. `core` : `"lib": ["ES2022"]`, aucune lib DOM/Node.
- **Web :** Next.js (App Router) + FSD. Inférence : `@huggingface/transformers` (transformers.js, WebGPU), `WebLLM` (@mlc-ai/web-llm), `kokoro.js`. Persistance : `@sqlite.org/sqlite-wasm` + OPFS.
- **Desktop :** Tauri 2. Sidecars Rust : `whisper.cpp`, `llama.cpp`, Kokoro, wav2vec2 — pilotés via `invoke()`. SQLite natif.
- **Backend :** Hono sur Cloudflare Workers ; Postgres via Supabase (auth/entitlement/blobs).
- **Tests :** Vitest (unitaire/BDD) ; harness eval maison.
- **UI :** React ; composants partagés web↔desktop dans `/ui-web` (jamais partagés avec RN).

---

## 18. Périmètre MVP (rappel, verrouillé)

**MVP = la boucle de correction, rien de plus :**
`Enregistrer → STT local → Correction (1 seul niveau « naturel », en-US) → Vue diff cliquable`.

- **Dans le MVP :** enregistrement, STT local, correction structurée (JSON validé), diff original↔corrigé cliquable, persistance locale SQLite.
- **Itération 2 (juste après) :** SRS (le fossé — déterministe, local, gratuit), streak + XP.
- **Itération 3 :** TTS local + tap-sur-mot + boucle/vitesse, `ear-compare`.
- **Hors MVP explicitement :** 3 niveaux de correction, UK/US simultanés, scoring phonème, mobile, shadowing, clonage de voix, sync.

---

## 19. Plan de livraison (ordre impératif)

### Étape 0 — Spikes de dé-risquage (AVANT le core définitif)
Ils informent la forme finale des ports (streaming vs batch, faisabilité local).
1. **Spike WebGPU/WASM** : Whisper + Kokoro + LLM 1-3B dans le navigateur sur machine réaliste. Mesurer latence, RAM, cold start, taille download. → confirme la viabilité du "web local" ou le cantonne à l'Option B cloud. — ✅ **Fait (2026-07-03) : GO partiel** (STT/TTS OK à 0,13-0,21× RTF, 0 % WER sur audio propre ; mais WebGPU-navigateur impraticable sous Linux/NVIDIA → web = lite, 100 % local = Tauri ; LLM navigateur non fiable → cloud-ZDR par défaut). Détail dans [`SPIKES.md`](SPIKES.md) §5.
2. **Spike scoring GOP** : wav2vec2 + alignement + score phonème sur échantillons. → confirme si le GOP local est atteignable.
3. **Spike Tauri + sidecar** : `whisper.cpp` piloté depuis le frontend web via IPC. → valide le pattern "même UI, adapters substitués".

### Étape 1 — Fondations
- Monorepo (pnpm/Turborepo), lint de dépendances, TS strict.
- `core` : ports (§9), value objects, event bus, `ClockPort`.
- `StoragePort` + adapter SQLite-WASM/OPFS (web).
- `/tooling/eval` amorcé.

### Étape 2 — MVP boucle de correction
- Machine à états du pipeline (jusqu'à `READY`).
- `TranscriptionPort` (adapter web) + `CorrectionPort` (adapter cloud-ZDR opt-in via `/services/api`, + `egressGuard`).
- UI : enregistrement → diff cliquable (Next.js + FSD).
- Eval harness sur la correction opérationnel.

### Étape 3 — Le fossé (SRS + rétention)
- Contexte SRS (SM-2/FSRS, 100 % testé), events `ErrorDetected`→`Card`.
- Gamification : streak + XP (scénarios Gherkin sur le streak).

### Étape 4 — Desktop 100 % local
- `/apps/desktop` (Tauri) réutilisant le frontend web.
- `/adapters-tauri` : whisper.cpp, llama.cpp (LLM **local**), Kokoro. → l'Option A (100 % local) devient réelle sur desktop.

### Étape 5 — Prononciation
- TTS local + tap-sur-mot + boucle/vitesse + `ear-compare`.
- GOP local (issu du spike #2) quand prêt, desktop d'abord.

---

## 20. Conventions pour l'agent d'implémentation

- **Toujours** définir/étendre un port dans `core/ports` avant d'écrire un adapter.
- **Injection de dépendances** par le composition root de l'app ; le `core` ne construit jamais un adapter.
- **Pas de `Date.now()` / `Math.random()`** dans le `core` → passer par `ClockPort` / une source injectée (déterminisme des tests).
- **Toute sortie de LLM** est validée par Zod avant d'entrer dans le `core`. Gérer explicitement le JSON malformé.
- **Un `fetch` de contenu** ne peut exister que dans un adapter cloud, derrière `egressGuard`.
- **Commits/PR** : chaque lot livrable de §19 = une PR avec ses tests (TDD/BDD) ou son entrée d'eval.
- **En cas de conflit** entre une tâche et un invariant (§1) : s'arrêter et remonter le conflit, ne pas contourner.

---

> **Ce document est la direction ferme.** Les 3 spikes de l'étape 0 peuvent, s'ils révèlent un mur technique (ex. GOP local inatteignable, WebGPU trop lent), justifier de réviser une décision — auquel cas on met à jour ce document explicitement, on ne dévie pas en silence.

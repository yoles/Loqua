# Résultats d'éval — correction

Traçabilité (règle §16) : baselines commitées, coût/latence notés à chaque run.
Deux tiers comparés sur le **même** golden set (60 cas « dev »).

- `baseline.json` — tier **cloud** (`cloud-native`, Claude Sonnet via proxy ZDR)
- `baseline-local.json` — tier **local** (`local-strong`, Qwen3-8B Q4_K_M via sidecar llama.cpp, CPU)

Rejouer : `pnpm --filter @loqua/eval eval` (cloud) · local :
`EVAL_SUBJECT=local LOQUA_EVAL_CORRECT=<bin eval-correct> LOQUA_APP_DATA=<dir app> pnpm --filter @loqua/eval eval`

## Comparaison local vs cloud (lot 4.3)

|                                   | Local (Qwen3-8B Q4)          | Cloud (Sonnet) |
| --------------------------------- | ---------------------------- | -------------- |
| Cas passés                        | **23 / 60**                  | **43 / 60**    |
| Sorties invalides (JSON malformé) | 6                            | 0              |
| Aucun JSON produit                | 2                            | 0              |
| Latence moyenne                   | ~22,6 s/cas (CPU Ryzen 5600) | ~2,5 s/cas     |

Taux de détection par type d'erreur :

| Type       | Local | Cloud |
| ---------- | ----- | ----- |
| tense      | 57 %  | 86 %  |
| grammar    | 66 %  | 88 %  |
| vocabulary | 27 %  | 64 %  |
| idiom      | 0 %   | 38 %  |
| syntax     | 0 %   | 25 %  |
| word-order | 25 %  | 100 % |
| article    | 33 %  | 83 %  |

## Conclusion (décision lot 4.3)

Le local est **nettement en retrait** du cloud : moitié moins de cas passés, nul
sur `idiom`/`syntax`, et **13 % de sorties inexploitables** (JSON malformé ou
absent) que l'app remonte proprement en `CorrectionError` → FAILED_LLM. Il est
aussi ~10× plus lent (CPU).

Conformément au SPRINTS 4.3, le choix local/cloud reste **visible** (`qualityTier`
restitué à l'UI) : le desktop garde le 100 % local par défaut (positionnement
privacy-first), le cloud-ZDR reste opt-in pour qui privilégie la qualité.

Pistes d'amélioration du local (hors périmètre 4.3, à mesurer via l'éval avant merge) :

- Durcir le prompt pour fiabiliser le JSON (guillemets sur les valeurs d'enum,
  « output only JSON ») — cible directe des 8/60 sorties inexploitables.
- Offload GPU (RTX 3050) pour la latence.
- Grammaire contrainte (GBNF) côté sidecar pour garantir un JSON valide by design.

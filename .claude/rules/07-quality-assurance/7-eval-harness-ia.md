---
description: APPLIQUER le régime d'évaluation IA WHEN toucher un prompt, changer de modèle LLM/STT, ou travailler dans tooling/eval — JAMAIS de test unitaire sur une sortie d'IA
portée: tooling/eval/**, prompts, choix de modèles
---

Règle d'or (ARCHITECTURE §16) :
- Ne JAMAIS écrire `expect(...).toBe(...)` sur une sortie de LLM
- La FORME (schéma Zod) se teste en TDD ; la QUALITÉ se mesure ici
- `/tooling/eval` existe dès le PREMIER prompt de correction — pas après

Golden set :
- 50-100 énoncés « dev » (standup, code review, incident) avec références attendues
- Chaque énoncé : texte fautif + erreurs attendues (type, span) + correction de référence
- Enrichir le golden set à chaque faux positif/négatif rencontré en usage réel

Assertions sémantiques (pas d'égalité stricte) :
- « L'erreur de temps verbal est détectée » — pas « le message vaut X »
- LLM-juge pour la qualité des explications et du texte corrigé
- Sortie invalide Zod = échec comptabilisé (le malformé fait partie de la mesure)

Non-régression :
- Baseline enregistrée (score par catégorie d'erreur)
- Tout changement de prompt/modèle exécute l'eval AVANT merge ; régression = pas de merge
- Comparer les tiers (`local-basic` vs `cloud-native`) sur le même golden set

Scoring prononciation (si la piste supervisée rouvre) :
- Corrélation vs corpus annoté (SpeechOcean762), jamais de seuil arbitraire inventé

Hygiène :
- Le harness peut appeler le réseau (LLM-juge) — c'est le SEUL endroit de test où c'est permis
- Résultats d'eval commités (traçabilité) ; coût/latence notés à chaque run

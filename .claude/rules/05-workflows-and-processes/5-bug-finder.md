---
description: APPLIQUER ce protocole d'investigation WHEN l'utilisateur signale un bug
portée: débogage
---

Protocole :

- Reformuler le problème avec ses propres mots
- Tracer le chemin d'exécution entre fichiers (diagramme mermaid si multi-fichiers)
- Examiner les fichiers pertinents (commencer par le `core` : la logique métier y vit)
- Vérifier d'abord les frontières : validation Zod, mapping adapter, injection au composition root
- Lister le top 3 des causes probables (niveau de confiance) avec, pour chacune, la correction envisagée
- Attendre la validation de l'utilisateur avant de modifier le code

Spécifique Loqua :

- Bug de logique métier trouvé dans un adapter/app = double bug : corriger ET rapatrier la logique dans `core`
- Reproduire d'abord par un test qui échoue (le fix le fait passer)
- Comportement non déterministe suspect → chercher un `Date.now()`/`Math.random()` non injecté
- « Mauvaise correction LLM » n'est PAS un bug de code → cas à ajouter au golden set de l'eval

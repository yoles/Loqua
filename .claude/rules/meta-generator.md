---
description: APPLIQUER ce protocole WHEN créer ou modifier une règle dans .claude/rules
portée: .claude/rules/**
---

Avant d'écrire :

- Vérifier si une règle existante couvre déjà le sujet → la mettre à jour plutôt qu'en créer une
- Vérifier la cohérence avec `specs/ARCHITECTURE.md` (source de vérité) — une règle ne contredit jamais un invariant §1

Format de fichier :

- Nom : `#-nom-de-regle[@version][-specificite].md` dans le bon dossier numéroté (00-architecture … 09-other)
- Frontmatter : `description` (une ligne « APPLIQUER X WHEN Y ») + `portée` (chemins/globs concernés)
- Contenu : groupes « Nom : » (pas de titres MD) + puces ultra-courtes (3-10 mots), impératives
- Backticks pour les références de code ; pas de fluff, pas de justification longue
- Exemples de code seulement si la règle est ambiguë sans eux
- Langue : français ; termes techniques et identifiants en anglais

Après écriture (OBLIGATOIRE) :

- Mettre à jour `INDEX.md` : ajouter/ajuster la ligne dans « Par tâche »
- Une règle absente de l'INDEX n'existe pas (elle ne sera jamais lue)
- Si la règle découle d'une décision nouvelle, vérifier qu'ARCHITECTURE.md la reflète aussi

Suppression :

- Une règle devenue fausse se SUPPRIME (et se retire de l'INDEX), elle ne se garde pas « au cas où »

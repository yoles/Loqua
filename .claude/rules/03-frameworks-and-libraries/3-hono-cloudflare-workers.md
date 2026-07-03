---
description: APPLIQUER les règles du backend fin (Hono / Cloudflare Workers) WHEN travailler dans services/api
portée: services/api/**
---

Surface (minuscule, ARCHITECTURE §14 — ne rien ajouter d'autre) :
- `auth` : compte/login (Supabase)
- `entitlement` : abonnement actif — sans AUCUNE donnée utilisateur
- `proxy LLM ZDR` : reçoit du TEXTE, garde la clé API, région UE
- `sync` (plus tard) : blobs chiffrés opaques, honore `deletedAt`

Interdits absolus :
- Le serveur ne lit JAMAIS de données utilisateur (invariant #3)
- Aucun audio n'arrive au serveur, sous aucune forme
- Ne JAMAIS logger le contenu des requêtes proxy (ni transcript, ni correction)
- Aucune orchestration ni traitement métier côté serveur — coût marginal ~0
- Aucune logique métier : la validation métier vit dans `core`, le serveur valide juste la forme

Proxy LLM ZDR :
- Fournisseur avec Zero Data Retention contractuel, endpoints région UE
- Clé API en secret Worker (jamais dans le code, jamais côté client)
- Entrée validée (taille max, texte seul) ; sortie relayée telle quelle (le client valide avec Zod)
- Rate limiting par compte via entitlement

Hono :
- Handlers fins : parse → valide forme → délègue → répond
- Erreurs HTTP typées et cohérentes ; logs en anglais, codes d'erreur, zéro contenu
- Tests d'intégration sur les endpoints avec fournisseur LLM mocké

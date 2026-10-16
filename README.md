# AI Department · Audit de visibilité IA (GEO)

Application web qui automatise l'atelier « Mon audit de visibilité IA » (Paperjam Club × Takaneo) : elle pose les questions de vos clients à ChatGPT, à l'aperçu IA de Google, à Perplexity, à Gemini et à Claude, puis produit un bilan avec un score, les concurrents cités, les sources, les erreurs et 3 actions.

## Parcours

1. L'utilisateur saisit l'adresse de son site et son e-mail.
2. L'app lit le site, pré-remplit le profil (entreprise, métier, ville, service…) et vérifie la santé technique (robots IA, schema.org, FAQ, llms.txt…).
3. L'utilisateur corrige le profil et relit les 13 questions (10 du corpus du workshop, 3 libres).
4. L'app pose chaque question à chaque moteur, plus les questions 1 et 2 en anglais et en allemand : 85 requêtes.
5. Chaque réponse est analysée (cité ou non, position, concurrents, sources, infos fausses), puis le bilan s'affiche, exportable en PDF.

## Mode démo et clés d'API

Sans clé, chaque moteur répond en **mode démo** (réponses simulées, signalées dans l'interface). Chaque clé ajoutée branche le moteur réel correspondant :

| Variable | Moteur |
| --- | --- |
| `OPENAI_API_KEY` | ChatGPT (API Responses + recherche web) |
| `SERPAPI_API_KEY` | Aperçu IA de Google, via SerpApi (pas d'API officielle Google) |
| `PERPLEXITY_API_KEY` | Perplexity Sonar |
| `GEMINI_API_KEY` | Gemini avec recherche Google |
| `ANTHROPIC_API_KEY` | Claude (moteur interrogé) **et** analyse des réponses, pré-remplissage, traduction et actions |

Sans `ANTHROPIC_API_KEY`, l'analyse se fait par règles : la détection du nom et des concurrents fonctionne, mais pas la vérification de l'exactitude.

Les moteurs sont interrogés par leurs API, sans historique ni personnalisation (l'équivalent de la navigation privée). L'utilisateur final n'a besoin d'aucun compte.

Voir `.env.example` pour toutes les variables (modèles, limite par jour, Supabase).

## Lancer en local

```bash
npm install
cp .env.example .env.local   # ajoutez vos clés, ou laissez vide pour le mode démo
npm run dev                  # http://localhost:3000
npm test                     # tests unitaires
```

## Déployer

Le plus simple est Vercel : importez le dépôt, ajoutez les variables d'environnement (au minimum `AUDIT_SECRET`, une longue chaîne aléatoire) et déployez. Chaque requête à un moteur est un appel court, donc les limites de durée des fonctions ne posent pas de problème.

Pour conserver les e-mails et appliquer la limite d'un audit par jour et par e-mail sur plusieurs serveurs, créez la table de `supabase/schema.sql` dans un projet Supabase et renseignez `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Sans Supabase, les audits sont gardés en mémoire du serveur (suffisant pour tester). La limite par jour ne s'applique que si au moins un moteur réel est branché.

## Architecture

- `src/lib/corpus.ts` : les 13 questions et le plan de requêtes.
- `src/lib/engines/` : un fichier par moteur, plus `demo.ts`.
- `src/lib/site.ts` : lecture du site et contrôles techniques (avec protection contre les adresses internes).
- `src/lib/analyze.ts` : grille du workshop par réponse (IA ou règles).
- `src/lib/score.ts` : score sur 100 et agrégats du bilan.
- `src/lib/actions.ts` : les 3 actions prioritaires.
- `src/app/api/*` : `profile` → `audit` → `ask` (une requête par appel) → `finish`. Le plan d'audit voyage dans un jeton signé : le serveur reste sans état.

## Limites connues

- Les réponses des IA varient d'un jour à l'autre ; l'API d'un moteur n'est pas strictement son interface grand public.
- L'aperçu IA de Google ne s'affiche pas pour toutes les recherches : ces cases sont marquées « pas de réponse IA ».
- L'exactitude est jugée par rapport à la page d'accueil du site uniquement.

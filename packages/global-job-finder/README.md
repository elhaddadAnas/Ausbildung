# Global Job Finder AI

Application SaaS indépendante pour rechercher, analyser et suivre des offres
d’emploi dans le monde entier.

## Fonctionnalités

- recherche mondiale par métier, ville, pays, catégorie et télétravail ;
- recherche Maroc prioritaire et raccourcis directs Indeed, LinkedIn, ReKrute et Emploi.ma ;
- sources Remote OK et Arbeitnow sans clé, avec attribution et liens directs ;
- intégration Adzuna facultative pour les recherches par pays ;
- intégration Jooble facultative pour agréger des offres de nombreux sites, notamment au Maroc ;
- filtre des postes hors Maroc qui mentionnent explicitement visa, mobilité ou candidatures internationales ;
- profil, analyse de CV et score de compatibilité ;
- génération de messages professionnels dans la langue configurée ;
- suivi des candidatures et messagerie SMTP/IMAP ;
- bot activable/désactivable, exécuté toutes les cinq minutes ;
- isolation des utilisateurs, CV privés et secrets SMTP chiffrés.

## Démarrage local

Prérequis : Node.js 20.16 ou plus récent.

```bash
cp .env.example .env
npm install
npm run db:push
npm run dev
```

L’application est disponible sur `http://localhost:3001` lorsque `PORT=3001`
est utilisé, ou sur le port Next.js par défaut sinon.

## Base de données isolée

En local, ce package utilise sa propre base SQLite :
`prisma/global-job-finder.db`. Son chemin est défini par le fichier `.env` du
package avec `DATABASE_URL="file:./global-job-finder.db"`.

Cette base est indépendante de `../../prisma/dev.db`, qui reste réservée à
l’application Ausbildung. Docker conserve également les données Job Finder
dans son propre volume `sqlite_data`.

## Sources d’offres

Remote OK et Arbeitnow fonctionnent sans authentification. Arbeitnow expose
notamment les postes qui offrent un parrainage de visa. Les résultats conservent
toujours le lien et l’attribution au fournisseur.

Pour agréger davantage de sites, en particulier les offres marocaines, créez une
clé via l’API officielle Jooble puis configurez :

```env
JOOBLE_API_KEY="..."
```

Indeed et LinkedIn ne fournissent pas une API publique de recherche librement
agrégeable. L’application ne les scrape pas : elle construit des liens de
recherche directs vers leurs sites, ainsi que vers ReKrute et Emploi.ma.

Pour activer la recherche par pays et ville via Adzuna :

```env
ADZUNA_APP_ID="..."
ADZUNA_APP_KEY="..."
```

Adzuna ne couvre pas le Maroc dans son API Jobs classique ; Jooble et les liens
directs Maroc prennent le relais pour ce pays.

Les agrégateurs publics fournissent généralement une URL de candidature et non
une adresse e-mail de recruteur. L’application ne devine et ne collecte jamais
une adresse. L’envoi SMTP automatique ne s’exécute que lorsqu’une source
configurée fournit explicitement un e-mail vérifié ; sinon l’offre redirige vers
le formulaire officiel.

## Variables importantes

- `JWT_SECRET` : secret de session aléatoire d’au moins 32 caractères ;
- `SMTP_ENCRYPTION_KEY` : clé distincte pour chiffrer les mots de passe SMTP ;
- `OPENAI_API_KEY` : facultative, le mode local reste disponible sans clé ;
- `APPLICATION_LANGUAGE` : langue des candidatures, `English` par défaut ;
- `NEXT_PUBLIC_APP_URL` : URL HTTPS publique en production.

## Docker

```bash
docker compose up --build
```

Le package utilise le port hôte `3001`, ce qui permet de l’exécuter en parallèle
avec l’application Ausbildung sur le port `3000`.

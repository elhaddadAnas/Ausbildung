# Économie des abonnements

Estimation vérifiée le 30 juillet 2026 pour le modèle réellement utilisé par
l’application : `gpt-4o-mini`.

Tarifs OpenAI par million de jetons :

- Entrée : 0,15 USD
- Sortie : 0,60 USD

Source officielle :
https://developers.openai.com/api/docs/models/gpt-4o-mini

## Coût d’une candidature

Une candidature envoyée utilise normalement deux appels :

1. analyse du profil par rapport à l’offre ;
2. génération d’une lettre/e-mail personnalisé.

Hypothèse moyenne observée à partir des limites et prompts de l’application :

- 3 500 jetons d’entrée ;
- 500 jetons de sortie.

Calcul :

```text
(3 500 × 0,15 / 1 000 000) + (500 × 0,60 / 1 000 000)
= 0,000825 USD
```

Le coût OpenAI moyen estimé est donc inférieur à 0,001 USD par candidature.
L’enveloppe conservatrice utilisée par le produit est de 0,006 USD par
candidature afin d’absorber les offres longues, les analyses sans envoi et les
nouvelles tentatives réseau.

Le coût réel est maintenant enregistré après chaque réponse OpenAI dans la
table `AiUsage`, avec les jetons d’entrée, les jetons de sortie et le coût
estimé.

## Formules proposées

| Formule | Prix mensuel | Candidatures | Crédits IA | Auto-candidature |
| --- | ---: | ---: | ---: | --- |
| Découverte | 0 € | 5 | 50 | Non |
| Plus | 9,99 € | 60 | 1 000 | Oui |
| Pro | 19,99 € | 250 | 5 000 | Oui |

Packs de crédits complémentaires, disponibles sans changement de formule :

| Pack | Crédits IA | Prix unique |
| --- | ---: | ---: |
| Essentiel | 100 | 2,99 € |
| Boost | 500 | 8,99 € |
| Intensif | 1 000 | 14,99 € |

Les crédits achetés sont conservés dans un solde séparé du quota mensuel. Ils
n’expirent pas lors du renouvellement mensuel et sont consommés uniquement
lorsque le quota inclus dans la formule ne suffit plus.

Consommation des crédits :

- analyse de match : 1 crédit ;
- lettre personnalisée : 2 crédits ;
- analyse de CV : 6 crédits ;
- analyse d’une réponse reçue : 1 crédit.

Une candidature réussie consomme normalement 3 crédits. L’auto-candidature
peut consommer des crédits supplémentaires lorsqu’elle analyse des offres qui
ne dépassent pas le score minimum.

## Marge à prévoir

OpenAI n’est pas le principal coût de ce service. Le prix doit également
couvrir :

- serveur, base de données, stockage des CV et sauvegardes ;
- Redis et tâches automatiques ;
- recherche et enrichissement des offres ;
- e-mails, synchronisation IMAP et délivrabilité SMTP ;
- sécurité, maintenance, support et frais du prestataire de paiement ;
- analyses de match qui ne produisent finalement aucune candidature.

Pour la planification financière, réserver environ 0,10 USD de consommation IA
par utilisateur Découverte, 2 USD par utilisateur Plus et 10 USD par
utilisateur Pro et par mois constitue une marge technique prudente. Ces
budgets doivent être recalibrés après un mois de données réelles provenant de
`AiUsage`.

## Activation et paiement

Les demandes de formule payante et les achats de crédits sont enregistrés avec
un statut en attente. Un administrateur peut activer une formule ou créditer le
solde depuis la console après vérification du virement. Cette base empêche
l’octroi gratuit d’une formule ou de crédits.

L’encaissement automatique nécessite encore le choix d’un prestataire
(Stripe, PayPal ou autre), ses clés API, les webhooks de paiement et les règles
de TVA/facturation applicables.

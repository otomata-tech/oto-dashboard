---
title: Facturation & tunnel de souscription
type: reference
description: >-
  `/org/billing` — catalogue, tunnel en un écran (identité de facturation → montant
  HT/TVA/TTC → consentement d'achat → paiement), retour du checkout et attente
  d'ouverture. Les trois pièges qui ont coûté de l'argent : `pending_mandate` lu
  comme un échec, un tunnel qui découvre ses préalables un par un, et une alerte
  qui réclame un geste que l'écran n'offre nulle part.
---

# Facturation — l'écran `/org/billing` (ADR 0043)

Un abonnement par organisation, PSP **Mollie**, miroir local `org_subscriptions` comme
source de vérité. Le dashboard n'y détient rien : il lit `me.billing.*`, `me.legal.*` et
envoie le payeur finir sur la page de checkout **hébergée**.

Le modèle serveur, les deux tables et l'incident du 25/08/2026 vivent dans
**`oto-backend/docs/billing.md`** — c'est le document à ouvrir avant de toucher à cet
écran. Ce qui suit est ce que l'écran en fait.

## L'ordre du tunnel n'est pas cosmétique

**Identité → montant annoncé → consentement → paiement.** On accepte des CGV *pour un
montant*, et le montant n'existe qu'une fois le pays connu : c'est lui qui décide du
régime de TVA, donc de ce qui sera réellement débité. Faire consentir d'abord et chiffrer
ensuite ferait accepter un prix qui n'a pas encore été annoncé.

`BillingView` porte le catalogue, l'état d'abonnement et le retour du paiement ; le tunnel
lui-même vit dans `components/console/billing/` :

| composant | ce qu'il porte |
|---|---|
| `BillingCheckout.vue` | l'orchestration d'un palier choisi : charge l'identité + le statut légal, peint les blocs, appelle `subscribe`, traite le refus |
| `BillingIdentityForm.vue` | la fiche (raison sociale, pays ISO, n° de TVA facultatif, adresse) — POSTÉE ENTIÈRE, le serveur remplace et ne fusionne pas. ⚠️ Monté AUSSI par `BillingView` pour un abonné (voir plus bas) |
| `BillingPriceCard.vue` | HT / TVA / TTC et le régime — le montant annoncé AVANT le consentement |
| `BillingLegalConsent.vue` | les documents servis par la réponse + UNE case |
| `BillingPending.vue` | l'attente d'ouverture au retour du paiement |
| `lib/billingTunnel.ts` | la partie pure : décomposition du montant, lecture des refus, libellés, cadence de sonde |

## ⚠️ Une alerte qui réclame un geste doit porter le geste

`BillingIdentityForm` est monté **deux fois**, sur le même composant et la même API :

- dans `BillingCheckout`, premier écran du tunnel — *avant* la souscription ;
- dans `BillingView`, carte « Identité de facturation » — pour une org **déjà abonnée**
  (`#billing-identity`, servie à tout membre, écriture réservée à l'org_admin).

Le second manquait, et le trou n'était pas cosmétique : le tunnel **disparaît** dès qu'on
est abonné, alors que l'alerte `vat_blocked` (« la prochaine échéance ne peut pas être
calculée ») ne s'affiche, elle, **que** dans cet état. Du 25/08 au 02/09/2026, le seul
abonné payant de la plateforme a donc lu une consigne dont l'écran n'offrait aucune
exécution — et son prélèvement du 25/09 aurait échoué en silence, le service continuant
gratuitement.

Ce que le cas laisse comme règle, au-delà de lui :

- **Une alerte qui nomme un geste porte son levier**, dans la même phrase. Sinon elle
  n'informe pas : elle accuse.
- **Le levier n'est proposé qu'à qui peut s'en servir.** L'écriture est `org_admin` côté
  serveur ; à un membre, l'alerte nomme qui peut corriger au lieu d'offrir un bouton qui
  refuserait au clic (règle transverse « jamais de levier inerte »).
- **Un écran d'état et un tunnel ne partagent pas leur cycle de vie.** Tout formulaire posé
  dans un tunnel doit se demander où il vit *après* — le préalable qu'il satisfait, lui, ne
  disparaît pas avec la souscription : une adresse change, un numéro de TVA arrive.
- Le formulaire n'est **pas recopié**. Deux formulaires pour la même fiche divergeraient, et
  celle-ci décide du montant réellement débité.

⚠️ **Un abonnement OFFERT (`comp`) n'affiche pas cette carte** : rien n'y sera jamais
prélevé, le serveur n'y pose d'ailleurs jamais de `vat_blocked` — un formulaire de
facturation sous « offert par Otomata » annoncerait une échéance qui n'existe pas.

⚠️ **Les centimes se montrent quand il y en a.** `euros()` forçait `minimumFractionDigits: 0`
pour éviter le « 19,00 € » d'un prix de catalogue rond ; il tronquait du même geste le TTC
réellement prélevé — 2280 centimes rendus « 22,8 € », et les lignes de l'historique avec.
Le nombre de décimales suit désormais le montant (0 s'il tombe juste, 2 sinon).

Restent, à ce jour, **deux alertes de cet écran sans levier** — parce qu'aucune surface
serveur ne les ouvre, pas par oubli du front : `past_due` (« un nouvel essai est en cours »)
n'a **aucun moyen de changer de carte** — il n'existe pas de route de changement de moyen de
paiement, alors que `billing_payments.kind` connaît déjà `method_change` ; et
`canceled_at` (« résiliation programmée ») n'a **aucun moyen de revenir en arrière** —
`cancel` n'a pas d'inverse. Les deux sont des lots oto-backend.

## ⚠️ `pending_mandate` est une ATTENTE, jamais un échec

Le moyen de paiement réutilisable ne naît pas avec l'encaissement : chez le PSP il apparaît
une à cinq minutes plus tard. Le 25/08/2026, l'écran a annoncé un échec **1,4 s** après un
encaissement réussi ; le payeur a recliqué et a été débité deux fois (38 € pour un
abonnement à 19 €). Trois règles en découlent, tenues par le code :

1. **Toutes les branches d'avancement de `confirm` sont des 200**, discriminées par
   `status`. Un paiement réussi ne produit jamais de code d'erreur — donc jamais de copie
   négative. `pending_mandate` se dit « votre moyen de paiement est en cours de
   validation », pas « mandat manquant » et surtout pas « paiement non abouti ».
2. **Aucun bouton de paiement n'est atteignable pendant l'attente.** L'écran d'attente
   remplace tout le reste, catalogue compris — ce n'est pas une bannière au-dessus d'un
   bouton encore cliquable.
3. **`payment_pending` (409 de `subscribe`) affiche le `detail` du serveur**, qui nomme le
   paiement en vol, son âge et quoi faire. Le bouton ne revient pas de lui-même.

La sonde suit le `retry_after` conseillé, plafonnée à la fenêtre de reprise du serveur
(30 min). Passé ce délai on cesse d'interroger **sans annoncer d'échec** : l'argent est
pris et l'ouverture se fait côté serveur (`billing_runner`), on l'écrit au payeur.

Au retour du checkout, l'URL porte `?billing=return&payment_ref=tr_…` — le navigateur DIT
quel paiement il vient de conclure, au lieu de laisser le serveur prendre « le plus
récent ». Les deux paramètres sont nettoyés au `replaceState`.

## ⚠️ Les préalables se peignent TOUS D'UN COUP

`subscribe` refuse en 409 tant qu'un préalable manque, et les nomme **tous** dans
`details.blockers`. **Lire `blockers`, jamais le code de tête seul** : celui-ci ne nomme
que le PREMIER manque dans l'ordre du tunnel, donc un écran qui s'y fie fait remplir un
formulaire pour opposer une case à cocher au clic suivant — exactement ce que le serveur
évite en les rendant ensemble.

L'écran se peint aussi **à froid** (`GET /api/me/billing/identity` + `GET /api/me/legal`) :
il n'a pas besoin d'un refus pour savoir quoi demander. Le 409 ne sert que du cas « on a
essayé et il manquait quelque chose ».

Deux détails qui se paient cher si on les rate :

- **Les libellés, versions et adresses des documents viennent de la réponse**, jamais du
  front : un tenant tiers a ses propres documents, et une version bouge entre deux
  déploiements. Le nombre de documents non plus n'est pas écrit en dur.
- **`accepted_version` non nul** = accepté, mais sur une version antérieure. On le dit
  (« vous aviez accepté la version X ») au lieu de présenter une case vierge : « je l'ai
  déjà coché » est la première objection quand une version bouge.

Le consentement part en `POST /api/me/legal/accept {"context": "purchase"}`, dont la
réponse est le statut **rafraîchi** : s'il reste quelque chose, un document a bougé entre
l'affichage et le clic — on repeint au lieu de rejouer.

## ⚠️ `billingTunnel.vatAmount` est un MIROIR du serveur

Même régime que `lib/keyStack.ts` : aucune erreur n'y casse l'écran, **elle fait annoncer
au payeur un montant autre que celui qui sera débité**, ce qui se découvre sur la page du
PSP. Le calcul existe parce qu'aucune surface ne rend le TTC d'un palier *avant* la
souscription — l'identité sert le taux (`vat_rate_bps`) et le régime, le catalogue sert le
HT, et c'est le front qui les rapproche. Il recopie l'arrondi de `billing_vat.vat_amount`
(au centime, moitié vers le haut) et il est testé sur les prix réels du catalogue. Le jour
où le backend sert un TTC par palier, ce calcul disparaît.

Le **régime**, lui, n'est jamais calculé côté front : `fr_ttc` / `reverse_charge` /
`export` sont servis. `lib/countries.ts` ne recopie que les *codes* acceptés (miroir de
`billing_vat.ISO_COUNTRIES` / `EU_COUNTRIES`) — les libellés viennent d'`Intl.DisplayNames`,
le navigateur en sait plus que nous. L'appartenance à l'Union n'y sert qu'à **expliquer**
au payeur pourquoi un numéro de TVA lui est demandé, jamais à décider du régime.

⚠️ **`vat_consumer_unsupported`** (client de l'Union hors France sans numéro de TVA) n'est
pas un bug : le guichet OSS n'est pas en place, la souscription en ligne est fermée à ce
cas. L'écran l'annonce et n'ouvre pas de paiement.

## Ce que ces écrans consomment

| appel | ce qu'il sert |
|---|---|
| `GET /api/me/billing` | état d'abonnement + catalogue quand l'org n'a rien ; depuis #486 il porte aussi `amount_ttc`/`vat_scheme` de la **prochaine** échéance |
| `GET`/`PUT /api/me/billing/identity` | la fiche, `missing` (les champs requis absents, dans l'ordre du formulaire), `vat_scheme`, `vat_rate_bps`, `vat_blocked` |
| `GET /api/me/legal`, `POST /api/me/legal/accept` | les documents et le reste-à-accepter du contexte `purchase` |
| `POST /api/me/billing/subscribe` | ouvre le checkout ; 409 avec `details.blockers` tant qu'un préalable manque |
| `POST /api/me/billing/confirm` | l'avancement au retour et en re-sonde ; accepte `payment_ref` |
| `GET /api/me/billing/payments` | le journal des tentatives |

`api()` lève un **`ApiError`** qui conserve `error`, `detail` et `details` — l'enveloppe
les portait, on les jetait. Son `message` reste `"<status> <code>"`, donc `humanize()` est
inchangé ; `explain()` (dans `lib/errors.ts`) préfère la phrase du serveur **quand elle est
écrite pour être lue** (refus de forme d'un n° de TVA, paiement en vol). Elle ne l'est pas
toujours : le message de `legal_required` s'adresse à un client d'API (« Enregistre-la avec
POST /api/me/legal/accept… ») et n'est pas affiché — ce sont les blocs repeints que le
payeur doit lire.

⚠️ Le snapshot OpenAPI a été rafraîchi depuis la **preprod** (`OTO_MCP_BASE=https://mcp.oto.ninja`),
pas depuis le défaut (prod). Mesuré le 2026-08-28 : les deux documents ont exactement la
**même FORME** — en retirant les descriptions et l'URL de serveur, la comparaison rend zéro
ligne de différence, donc les types dérivés seraient identiques. Ce que la preprod a en
plus, c'est la PROSE : elle décrit le refus 409 et ses `details.blockers`, c'est-à-dire
précisément le contrat que ces écrans consomment. Un `npm run api:refresh` par défaut
raccourcira ces descriptions tant que la prod n'aura pas le tag — ça se verra dans le diff,
et ce n'est pas une régression de contrat.

## Ce qui n'a PAS pu être joué contre la preprod (2026-08-28)

Deux obstacles d'environnement, tous deux hors de ce repo, notés ici pour qui reprendra :

- **La preprod n'autorise pas `http://localhost:5192` en CORS** (`OTO_MCP_CORS_ORIGINS`
  côté oto-backend) — la prod, si. Un dashboard lancé en local ne peut donc pas parler à
  `mcp.oto.ninja` sans passer par un proxy du serveur de dev. Le client SPA Logto de la
  preprod (`deploy-canari.yml`) n'accepte pas non plus ce redirect, là où celui de prod
  l'accepte : la recette de `commands.md` ne vaut aujourd'hui que **contre la prod**.
- **Le connecteur e-mail de `auth.oto.ninja` refusait la connexion** (`ECONNREFUSED` vers
  le mailer) : la connexion par code de vérification était impossible.

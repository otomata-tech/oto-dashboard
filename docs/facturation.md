---
title: Facturation & tunnel de souscription
type: reference
description: >-
  `/org/billing` et le bloc commerce de la fiche d'org admin, servis par OTO-COMMERCE
  (`commerce.oto.cx`, API utilisateur et API d'administration) — plus par le cœur. On
  choisit un nombre de membres (des places) au prix d'une place ; tunnel en un écran
  (identité de facturation → montant HT/TVA/TTC → CGV et DPA acceptées dans la
  souscription → paiement) ; plus de confirmation côté client : l'écran relit l'abonnement
  jusqu'à `active`, le webhook du PSP fait foi. Les pièges qui ont coûté de l'argent
  restent tenus : un paiement reçu lu comme un échec, un bouton « payer » reproposé
  pendant un encaissement, une alerte qui réclame un geste que l'écran n'offre nulle part,
  et un écran qui vend à ses bénéficiaires ce qu'on leur a déjà offert.
---

# Facturation — l'écran `/org/billing` et le bloc commerce de la fiche d'org

La facturation vit dans **oto-commerce** (`https://commerce.oto.cx`, routes sous `/api`),
PSP **Mollie**. Le cœur (oto-backend) ne connaît plus ni abonnement ni facture (ADR 0070) :
le dashboard ne lui demande plus rien pour ces écrans. Il lit et écrit chez le commerce, et
envoie le payeur finir sur la page de paiement **hébergée**.

Le contrat fait foi : **`oto-commerce/docs/api-utilisateur.md`**, et
`oto-commerce/oto_commerce/api.py` pour les noms de champs. Ce qui suit est ce que l'écran
en fait.

## Le transport : un second service, un second jeton

- **Deux ressources Logto au même login.** `useAuth` demande `VITE_LOGTO_AUDIENCE` (le cœur)
  et `VITE_LOGTO_COMMERCE_AUDIENCE` (`https://commerce.oto.cx/api`). Un jeton n'ouvre que
  l'audience pour laquelle il a été émis : `getAccessToken(cible)` rend celui du cœur par
  défaut (aucun appel existant ne change), celui du commerce sur demande.
  ⚠️ Une ressource ajoutée n'est acquise qu'au login suivant : une session ouverte avant
  lève `stale_session` (« se reconnecter ») la première fois qu'elle appelle le commerce.
- **`apiCommerce` / `apiCommerceDownload`** (`api.ts`) : base `VITE_OTO_COMMERCE_BASE`, même
  `apiError()` (enveloppe `{error, detail}` du cœur), et **sans les en-têtes de « voir en
  tant que »** : le commerce ne les connaît pas, il relit lui-même auprès du cœur le rôle du
  porteur du jeton dans l'org du chemin. Base absente (poste dev) : la console marche, seul
  un appel au commerce lève `commerce_unconfigured`.
- **L'org est dans le chemin**, jamais dans un « org active » de session :
  `/api/orgs/{me.active_org}/…`.
- **Préprod = commerce de PROD** (`deploy-canari.yml`) : le canari d'oto-commerce n'expose
  pas d'API (il n'encaisse pas), et la préprod lit les données de prod.
- **Types écrits à la main** dans `types/api.commerce.ts` : le commerce ne publie pas
  d'OpenAPI. Un champ qui bouge côté commerce se corrige là, dans le même lot que l'écran.

## Qui voit quoi

Le commerce tranche, à chaque requête, en relisant la liste des membres auprès du cœur :

- **l'`org_admin`** : tout — abonnement, offre, identité, paiements, factures ;
- **un membre** : seulement s'il est payant, et jusqu'à quand (`GET /moi`) — l'écran le
  dit, et dit que le reste est réservé aux administrateurs ;
- **en consultation** (`active_org_readonly`) **ou « voir en tant que »** : le jeton reste
  celui de l'opérateur, qui n'est pas membre — le commerce refuserait tout. L'écran
  **n'appelle pas** le commerce : il le dit, et renvoie l'opérateur à la fiche d'org de la
  plateforme (`/platform/orgs/{id}`), qui lit l'API d'administration.

## L'offre : des places, plus de paliers

Le catalogue de paliers (19 / 99 / 249 / 499) a disparu. On choisit un **nombre de membres
payants** (`BillingSeats.vue`), au prix d'une place servi par `GET /api/tarif`
(2 500 centimes HT par place et par mois). Les membres payants sont les premiers arrivés
dans l'org, par ancienneté.

Un abonné gardé à son prix d'avant (`tarif: forfait`) n'a **pas de places** : l'écran
montre son montant, « tarif conservé », et n'offre pas « Changer le nombre de membres »
(le commerce refuserait en `fixed_price`).

## L'ordre du tunnel n'est pas cosmétique

**Identité → montant annoncé → consentement → paiement.** On accepte des CGV *pour un
montant*, et le montant n'existe qu'une fois le pays connu : c'est lui qui décide du régime
de TVA, donc de ce qui sera réellement débité.

| composant | ce qu'il porte |
|---|---|
| `BillingView.vue` | le mode (admin / membre / consultation), l'état d'abonnement, ses alertes et leurs leviers, l'attente d'ouverture, les gestes de l'abonné |
| `BillingSeats.vue` | l'offre d'une org sans abonnement qui court : le prix d'une place, le nombre choisi ; émet le nombre, n'engage rien |
| `BillingCheckout.vue` | le tunnel d'un nombre choisi : lit l'identité et les documents d'achat, peint les blocs, souscrit, traite les refus |
| `BillingIdentityForm.vue` | la fiche (raison sociale, pays, n° de TVA facultatif, adresse, adresse d'envoi des factures) — PUT ENTIÈRE, le serveur remplace. ⚠️ Montée AUSSI par `BillingView` pour un abonné |
| `BillingPriceCard.vue` | HT / TVA / TTC et le régime — le montant annoncé AVANT le consentement |
| `BillingLegalConsent.vue` | les documents servis par `GET /api/cgv` + UNE case |
| `BillingPending.vue` | l'attente d'ouverture d'une souscription `incomplete` |
| `BillingGranted.vue` | ce qui est offert : l'essai en cours et les dons (`GET /avantages`) |
| `BillingContract.vue` | le contrat hors plateforme en cours (`GET /contrat`) : licences, droits, dates, référence — à la PLACE de l'offre |
| `BillingPaymentsCard.vue` | le journal des tentatives (souscription, échéances, changements de moyen) |
| `BillingInvoices.vue` | les factures et avoirs, et leur PDF |
| `lib/billingTunnel.ts` | la partie pure : miroir de la TVA, documents d'achat, lecture des refus, paiement en vol, cadence de relecture |

La carte « usage inclus » (`BillingUsageCard`) est **retirée** (décision d'Alexis, 28/09).

## ⚠️ CGV et DPA : acceptées DANS la souscription

Les documents d'achat vivent au commerce : `GET /api/cgv` sert, par slug (`cgv`, `dpa`),
version, libellé et adresse — rien n'est écrit en dur, pas même le nombre de documents.
L'acceptation part **dans** `POST /abonnement` (`acceptations: {cgv: "2.1", dpa: "2.1"}`,
la version de chaque document tel qu'il a été montré) ; le commerce la consigne avec qui,
quand, version et IP. Plus d'appel à `/api/me/legal/accept` pour l'achat : les CGU
(contexte « accès », `LegalGate`) restent au cœur.

Un document qui change de version entre l'affichage et le clic : `400
purchase_documents_required`. L'écran relit `GET /api/cgv`, décoche la case et le dit —
on repeint, on ne rejoue pas.

## ⚠️ Plus de confirmation côté client : on RELIT, le webhook fait foi

C'est le webhook de Mollie qui ouvre l'abonnement. L'écran ne confirme rien (`confirm`,
`method/confirm` et `BillingMethodChange` ont disparu) : une org dont l'abonnement est
`incomplete` se relit (`GET /abonnement` + `GET /paiements`) toutes les 5 s jusqu'à ce
qu'il quitte cet état, dans une fenêtre de 30 min, puis « Vérifier à nouveau ».

L'état se lit au journal, dont le dernier paiement `initial` décide :

- **en vol** (`open` / `pending` / `authorized`) ou **reçu** (`paid`) : on ATTEND.
  `BillingPending` remplace l'offre — **aucun bouton « payer » atteignable** ;
- **échoué** (`failed` / `canceled` / `expired`) : rien n'est en vol, l'offre se rouvre avec
  « le dernier paiement n'a pas abouti : rien n'a été débité ».

Ce que le 25/08/2026 a laissé (le payeur a lu un échec 1,4 s après un encaissement réussi,
a recliqué, et a été débité deux fois) reste tenu :

1. **Un paiement reçu est une ATTENTE, jamais un échec** : « votre paiement a bien été
   reçu », pas une copie négative, même passé la fenêtre.
2. **Aucun « payer » pendant l'attente** — l'écran d'attente remplace l'offre, ce n'est pas
   une bannière au-dessus d'un bouton encore cliquable.
3. **`409 payment_pending`** (un premier paiement est déjà ouvert chez Mollie) : le commerce
   refuse d'en ouvrir un second. Le refus s'affiche **tel quel** dans le tunnel, le bouton
   ne revient pas de lui-même, « Actualiser » ramène à l'état relu. Même traitement pour
   `409 subscription_alive`.

⚠️ Le retour de la page de paiement suit `OTO_COMMERCE_RETOUR_URL` (config du commerce),
pas une URL passée par le front. L'écran ne dépend pas de ce retour : c'est l'état relu qui
décide.

## ⚠️ Une alerte qui réclame un geste doit porter le geste

`BillingIdentityForm` est monté **deux fois**, sur le même composant et la même API :

- dans `BillingCheckout`, premier écran du tunnel — *avant* la souscription ;
- dans `BillingView`, carte « Identité de facturation » (`#billing-identity`) — pour une org
  **déjà abonnée**.

Le second a manqué du 25/08 au 02/09/2026 : le tunnel **disparaît** dès qu'on est abonné,
alors que l'alerte « la prochaine échéance ne peut pas être calculée » (`tva_bloquee`) ne
s'affiche **que** dans cet état. Le seul abonné payant a lu une consigne dont l'écran
n'offrait aucune exécution. Ce qui en reste comme règle :

- **Une alerte qui nomme un geste porte son levier**, dans la même phrase :
  « Résiliation programmée » → « Annuler la résiliation » ; « Paiement en échec » →
  « Changer de carte » ; échéance incalculable → « Compléter l'identité de facturation »
  (qui mène au formulaire et y pose le focus).
- **Un écran d'état et un tunnel ne partagent pas leur cycle de vie** : le préalable que
  satisfait un formulaire de tunnel ne disparaît pas avec la souscription.
- **Le formulaire n'est pas recopié** : deux formulaires pour la même fiche divergeraient.

Les leviers ne sont montrés qu'à qui peut s'en servir : l'écran d'admin n'existe que pour
l'`org_admin` hors consultation, qui est aussi le seul à qui le commerce les ouvre.

## Les gestes de l'abonné

- **Changer le nombre de membres** (`PATCH /abonnement {places}`, tarif par membre) : une
  hausse vaut tout de suite et se facture à l'échéance ; une baisse prend effet à
  l'échéance, et l'écran l'annonce (« Baisse programmée : N membres payants à partir
  du … », `places_a_l_echeance`).
- **Résilier** (`POST /abonnement/resiliation`, avec dialogue) et **annuler la
  résiliation** (`DELETE`, sans dialogue : le geste se défait comme il s'est fait). Un
  refus (`not_canceled`…) s'affiche tel quel, avec « Actualiser ».
- **Changer de carte** (`POST /moyen-de-paiement`, carte seulement, sans corps) : un premier
  paiement à 0,00 sur la page hébergée crée le nouveau mandat. ⚠️ La phrase « l'ancien reste
  actif tant que le nouveau n'est pas confirmé » s'affiche **avant** de partir, dans le
  dialogue — sans elle, qui abandonne la page du PSP croit s'être coupé. Le constat se fait
  par le webhook ; tant que le dernier `method_change` du journal est en vol, l'écran le dit
  et n'arme pas de second changement. En impayé, c'est l'alerte qui porte le geste, une
  seule fois.

Le commerce rend `{ok}` : chaque geste réussi **relit** l'état, sans repasser par le
squelette de `load()`, qui démonterait ce qui est sous les doigts.

## ⚠️ Les factures sont une PROMESSE ÉCRITE, pas une commodité

Les CGV engagent Otomata mot pour mot : « Chaque encaissement donne lieu à une facture,
envoyée par courrier électronique et **téléchargeable depuis manage.oto.cx** », et elle
« **reste** téléchargeable au format PDF ». `BillingInvoices.vue` (`GET /factures`,
`GET /factures/{id}/pdf`) est cette porte. Trois choix **sont** la promesse :

- **La carte n'est pas conditionnée à l'abonnement en cours** : « reste téléchargeable »
  vaut après une résiliation. Seule la phrase du cas vide dépend de l'état (`paying`).
- **Un document pas encore émis s'affiche, avec son montant** : l'encaissement a eu lieu,
  seule l'émission tarde. Ni « échec » ni « erreur ».
- **Aucun lien mort** : le bouton n'existe que si le commerce sert `pdf: true`. Un document
  émis sans fichier dit « PDF en préparation ».

⚠️ Un **avoir** (`nature: credit_note`) porte des montants **négatifs** : les afficher en
valeur absolue ferait passer un remboursement pour un débit. La règle des centimes vit dans
**`lib/euros.ts`** : une facture est opposable, on y lit ce qui a été débité.

Une org d'un tenant tiers (`404 unknown_org`) : la carte se tait, ce n'est pas une panne.

## ⚠️ Ce qui est offert n'écrit aucune ligne d'abonnement

Un essai ou un don ouvre des droits payants sans abonnement. Un écran qui ne lit que
l'abonnement vend donc à ses bénéficiaires, prix affichés et bouton armé, ce qu'ils
possèdent déjà (mesuré le 2026-09-02 : 32 dons vivants pour un seul abonnement payant).
`GET /avantages` (`{essai: {fin} | null, dons: [{droit, fin}]}`, lisible sans abonnement)
alimente `BillingGranted`, **au-dessus** de l'offre :

- **L'offre RESTE affichée dessous** : un don n'est pas un abonnement.
- **On NOMME l'avantage** : le droit du catalogue, traduit (`billingUi.granted.rights.*`) ;
  un droit inconnu de l'écran se montre sous son code plutôt que de disparaître.
- **Une échéance se date au JOUR** (`fmtDay`, qui ordinalise le 1er), et une absence
  d'échéance ne dit rien — surtout pas « aucune échéance ».
- **Une échéance passée se dit échue**, avec ce qui la rouvre (choisir un abonnement) —
  jamais « expire aujourd'hui ». Seulement si l'offre est dessous (`offerBelow`) : abonné,
  sous contrat ou en attente d'ouverture, le don se dit échu sans renvoyer vers une offre
  absente.

## ⚠️ `billingTunnel.taxPreview` est un MIROIR du serveur

Même régime que `lib/keyStack.ts` : une erreur n'y casse pas l'écran, **elle fait annoncer
au payeur un montant autre que celui qui sera débité**. Aucune surface ne rend le TTC de N
places *avant* la souscription : l'identité ne sert que la fiche et ses manques, le tarif
le HT d'une place. `taxPreview` rejoue `tva.scheme_for` (France 20 % ; Union hors France
avec n° de TVA : autoliquidation 0 % ; Union sans n° : refusé `vat_consumer_unsupported` ;
hors Union : export 0 %), précédé du contrôle des champs requis ; `vatAmount` rejoue
l'arrondi (au centime, moitié vers le haut). Tout est testé branche par branche.

Après souscription, les montants viennent de **`GET /abonnement`** (`montant_ht`, `tva`,
`montant_ttc`, `regime_tva`, `tva_bloquee`), jamais du miroir. Quand le TTC n'est pas
calculable, l'écran montre le HT **dit comme tel**, jamais un TTC deviné.

⚠️ **`vat_consumer_unsupported`** n'est pas un bug : le guichet OSS n'est pas en place, la
souscription en ligne est fermée à ce cas. L'écran l'annonce et n'ouvre pas de paiement.

## Le bandeau d'incitation à l'abonnement (décision du 09/09/2026)

`SubscribeBanner.vue`, monté dans `ConsoleLayout`, **permanent, sur toutes les pages, pour
les admins d'org seulement**. Il lit `GET /abonnement` (404 `no_subscription` = non
abonnée ; un abonnement `canceled` compte comme aucun) et `GET /avantages` une fois par org
active, et se **tait** — chaque cas prouvé par `SubscribeBanner.spec.ts` :

- **membre simple** — aucun appel au commerce ;
- **org personnelle** (`me.active_org_is_personal`, via `enOrgPerso`) — décision d'Alexis du
  29/09/2026 : on ne pousse à s'abonner que dans une org d'équipe ; aucun appel non plus ;
- **consultation** ou **« voir en tant que »** — aucun appel non plus ;
- **org abonnée**, **en essai** ou **dotée d'un don** non échus — le lot du 02/09 (« cesser
  de vendre à qui possède déjà ») ne se rouvre pas par ce bandeau ;
- **org sous contrat** en cours (`GET /contrat`) — elle a payé hors plateforme ;
- **page facturation** elle-même — le levier y est déjà.

Il se relit quand on **quitte** la facturation et quand l'org active change. Un refus du
commerce masque le bandeau et le dit en console : il ne doit pas casser la console.

## Le bloc commerce de la fiche d'org (admin plateforme)

`AdminOrgCommerce.vue`, en bas de `/platform/orgs/:id`, pour un **opérateur plateforme**
seulement. Branché sur l'**API d'administration** du commerce (`/api/admin/orgs/{id}`),
même jeton ; le droit est le rôle plateforme de l'appelant, relu auprès du cœur.

| appel | ce qu'il fait |
|---|---|
| `GET /commerce` | l'état entier : abonnement (brut), contrat, dons, identité, factures, `bascule_faite` |
| `PUT` / `DELETE /dons/{droit}` | offrir un droit du catalogue (`unipile`, `platform_unmetered`, `unipile_seats`, `members_max`), fin facultative — **remplace « forcer un plan offert »** |
| `PUT` / `DELETE /contrat` | `{licences, droits, fin?, reference?}` : un abonnement réglé hors plateforme ; `DELETE` le clôt maintenant |
| `PUT /identite` | la fiche ENTIÈRE et `compta_client_id` — l'identifiant client du logiciel comptable, qui **remplace l'id client Pennylane** |
| `GET /factures/{id}/pdf` | le PDF d'une facture de l'org |

⚠️ **Avant la bascule**, le commerce refuse chaque geste (`409 before_switch`) : la
facturation est encore au cœur. L'état le dit (`bascule_faite: false` → une note en tête),
et chaque refus s'affiche **tel quel**, dans un toast.

L'identifiant client comptable **se désigne, il ne se devine pas** (leçon d'oto-backend#917 :
une facture est née en doublon d'un rapprochement automatique). Il est posé à la main,
jamais cherché ni créé par le code ; le formulaire est prérempli et reposte la fiche
entière, un identifiant vide **retire** la désignation. Le formulaire côté org
(`BillingIdentityForm`) ne le montre ni ne le poste jamais.

Les dates de fin se saisissent `AAAA-MM-JJ` et partent en fin de journée UTC
(`…T23:59:59+00:00`) : le commerce lit une date ISO 8601, une date sans heure ni fuseau
serait ambiguë.

## Ce que ces écrans consomment

API utilisateur, sous `/api/orgs/{id}` sauf les deux premières :

| appel | rôle | ce qu'il sert |
|---|---|---|
| `GET /api/tarif` | aucun | le prix HT d'une place, la devise, l'intervalle |
| `GET /api/cgv` | aucun | les documents d'achat en vigueur (version, libellé, adresse) |
| `GET /moi` | membre | `{payant, jusqu_au}` |
| `GET /avantages` | admin | l'essai et les dons, même sans abonnement |
| `GET /abonnement` | admin | l'état (places, montants, statut, échéances…) ; `404 no_subscription` = aucun, état normal |
| `GET /contrat` | admin | `{licences, droits, debut, fin, reference}`, un abonnement réglé hors plateforme ; `404 no_contract` = aucun ; clos, il se lit encore. **En cours** (`fin` nulle ou à venir, `contratEnCours`) : l'écran montre le contrat au lieu de l'offre et du tunnel, le bandeau se tait ; clos, il ne masque rien |
| `POST /abonnement` | admin | `{places, methode?, acceptations}` → `{checkout_url}` ; refus `400` nommés (identité, documents), `409 subscription_alive` / `payment_pending` / `under_contract` (ce dernier dit par sa clé i18n `errors.under_contract`) |
| `PATCH /abonnement` | admin | `{places}` |
| `POST` / `DELETE /abonnement/resiliation` | admin | résilier à l'échéance / reprendre |
| `GET /paiements` | admin | le journal, du plus récent au plus ancien (`id`, nature, statut, montants) |
| `GET` / `PUT /identite` | admin | la fiche et `manquants` (les six champs requis, email compris) |
| `POST /moyen-de-paiement` | admin | → `{checkout_url}`, carte seulement |
| `GET /factures`, `GET /factures/{id}/pdf` | admin | les factures et avoirs (`pdf` : un fichier existe), le PDF |

Les refus du commerce portent un `detail` en prose : `explain()` le rend mot pour mot.

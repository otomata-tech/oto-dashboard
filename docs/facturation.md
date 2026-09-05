---
title: Facturation & tunnel de souscription
type: reference
description: >-
  `/org/billing` — catalogue, tunnel en un écran (identité de facturation → montant
  HT/TVA/TTC → consentement d'achat → paiement), retour du checkout et attente
  d'ouverture. Les trois pièges qui ont coûté de l'argent : `pending_mandate` lu
  comme un échec, un tunnel qui découvre ses préalables un par un, et une alerte
  qui réclame un geste que l'écran n'offre nulle part. Et le bloc « offert » : un don
  d'option n'écrivant aucune ligne d'abonnement, l'écran vendait à ses bénéficiaires
  ce qu'ils possédaient déjà. Depuis #845, les deux gestes qui manquaient : changer de
  carte (un premier paiement à 0,00, l'ancien moyen tient jusqu'à confirmation) et
  annuler une résiliation.
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
| `BillingGranted.vue` | **hors tunnel** — la carte « ce qui vous est offert », au-dessus du catalogue (voir plus bas) |
| `BillingUsageCard.vue` | **hors tunnel** — les appels du mois et le plafond inclus, côte à côte |
| `BillingCatalogue.vue` | **hors tunnel** — la carte « Choisir un abonnement » d'une org sans abonnement ; émet le palier choisi, n'engage rien |
| `BillingPaymentsCard.vue` | **hors tunnel** — le journal des tentatives (souscription, échéances, changements de moyen) |
| `BillingMethodChange.vue` | **hors tunnel** — le CONSTAT au retour d'un changement de carte : sonde `method/confirm`, recopie la phrase servie (voir plus bas) |
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

Les deux autres alertes de cet écran sont restées sans levier jusqu'au 2026-09-05, parce
qu'aucune surface serveur ne les ouvrait : `past_due` n'avait **aucun moyen de changer de
carte**, `canceled_at` **aucun moyen de revenir en arrière**. oto-backend#845 a ouvert les
deux portes ; la section suivante dit ce que l'écran en fait.

## ⚠️ Changer de carte, annuler une résiliation (#845)

Le modèle serveur (premier paiement à 0,00, bascule puis révocation best-effort de
l'ancien mandat, `resume` purement local) vit dans `oto-backend/docs/billing.md`. Ce que
l'écran en fait, et pourquoi :

- **« Annuler la résiliation » vit DANS l'alerte « Résiliation programmée »**, à la place
  de « Résilier l'abonnement » — visible tant que la période court (l'abonnement est encore
  `active`, avec un `canceled_at`). Un clic, sans dialogue : le geste se défait comme il
  s'est fait, et rien n'est encaissé. Une fois la période échue, l'alerte n'existe plus
  (l'abonnement est `canceled`, l'écran montre le catalogue) ; si elle s'échoit **entre
  l'affichage et le clic**, le serveur refuse (`400 already_ended`) et son refus s'affiche
  **tel quel** — il dit de repasser par une souscription — avec « Actualiser » pour relire
  l'état.
- **« Changer de carte » est offert à tout abonné payant** (`active` comme `past_due` —
  c'est justement quand la carte est morte qu'on vient là), à côté de « Résilier ». En
  impayé, c'est l'alerte « Paiement en échec » qui le porte, une seule fois.
- **La phrase du serveur s'affiche AVANT de partir chez le prestataire.** `POST
  /api/me/billing/method` rend l'URL de la page de paiement **et** une `notice` — l'ancien
  moyen reste actif tant que le nouveau n'est pas confirmé. Elle est le corps du dialogue de
  confirmation (« Continuer vers la page de paiement ») : sans elle, qui abandonne la page
  du PSP croit s'être coupé. On ne la reformule pas. Le dialogue vient APRÈS l'appel parce
  que la phrase en vient ; annuler le dialogue laisse un paiement `open` de 0,00 dans le
  journal, ce que le serveur tolère par construction (deux changements ouverts sont
  désignés par leur référence).
- **Le retour porte `?billing=method&payment_ref=tr_…`** — un marqueur distinct de celui
  de la souscription (`billing=return`), pour que la vue sonde `method/confirm` et non
  `confirm`. `BillingMethodChange` est monté sous l'alerte de l'abonné, pas à la place de
  l'écran : rien d'argent n'est en vol, le reste de la carte peut rester lisible. Il
  **recopie `notice`** à chaque branche : `changed` (« Ton nouveau moyen de paiement est
  actif. »), `failed` (« Ton moyen de paiement actuel n'a pas changé. » — la carte a refusé
  l'autorisation à zéro, l'ancien moyen est intact, et le levier « Changer de carte » est
  dans le même cadre), `pending` / `pending_mandate` (la même attente que la souscription :
  spinner, la phrase servie, aucune copie d'échec, re-sonde toutes les 5 s jusqu'à la
  fenêtre de 30 min, puis « Vérifier à nouveau » sans rien annoncer de négatif).
  ⚠️ `already_current` (rejeu sur le mandat courant) est la seule branche **sans phrase
  servie** : l'écran dit « Ce moyen de paiement est déjà celui de l'abonnement. » — la
  seule copie de ce lot qui ne vient pas du serveur.
- **Pendant le constat, aucun second « Changer de carte » n'est armé** ; après, l'abonnement
  se relit (`GET /api/me/billing`) sans repasser par `load()`, dont le squelette
  démonterait le bloc sous les doigts.
- Les refus (`not_subscribed`, `already_ended`, `no_customer`, `unknown_payment`,
  `no_pending_change`) sont des **400** dont le `detail` est écrit pour être lu — même
  régime que `vat_number_invalid` : `explain()` le rend mot pour mot, préfixe de code
  compris.

⚠️ **Ce lot n'a pas été joué contre un vrai prestataire.** Il n'existe pas de clé Mollie de
test (décision d'Alexis, 05/09/2026) ; côté serveur le client est simulé, côté écran les
réponses sont figées dans les specs. Le premier vrai changement de carte se fera en
production, sous l'œil d'Alexis. Ce que les tests garantissent, c'est le câblage : les
routes appelées, l'URL de retour, la référence transmise, les phrases servies rendues
telles quelles, et qu'aucune branche d'attente ne parle d'échec.

Les types de `method` et `method/confirm` (`BillingMethodChangeStarted`,
`BillingMethodChangeResult`) vivent dans `types/api.attendu.ts`, section ③ : servis par la
préprod depuis `595a20a0`, pas par la prod, et le snapshot commité leur est antérieur.

## ⚠️ Les factures sont une PROMESSE ÉCRITE, pas une commodité

Les CGV publiées le 2026-09-02 engagent Otomata mot pour mot : « Chaque encaissement donne
lieu à une facture, envoyée par courrier électronique et **téléchargeable depuis
manage.oto.cx** », et elle « **reste** téléchargeable au format PDF ».

Le serveur tenait déjà sa part depuis oto-backend #488 — `GET /api/me/billing/invoices` et
`GET /api/me/billing/invoices/{id}/pdf`, servis en production. **Aucun écran ne les
demandait.** Un client payant ne pouvait donc récupérer aucune facture, alors que le contrat
la lui promettait. `BillingInvoices.vue` est cette porte, et rien d'autre : le lot du
2026-09-02 n'a touché aucune surface serveur.

Trois choix de cet écran **sont** la promesse — les « simplifier » la rompt :

- **La carte n'est pas conditionnée à l'abonnement en cours.** « Reste téléchargeable » vaut
  après une résiliation : un `v-if="status.subscribed"` masquerait les factures de qui vient
  de partir — précisément celles qu'on réclame ensuite à son comptable. Seule la phrase du
  cas vide dépend de l'état (`paying`), jamais l'affichage des factures elles-mêmes.
- **Un document `status='pending'` s'affiche, avec son montant.** L'encaissement a eu lieu ;
  seule l'émission tarde, et elle est rejouée automatiquement. La copie ne dit ni « échec »
  ni « erreur » — un `pending` n'est jamais un paiement perdu.
- **Aucun lien mort.** Le bouton n'existe que si le serveur a servi un `pdf_path`, et il ne
  le sert que s'il y a un fichier au bout. Un document émis dont le PDF n'est pas revenu du
  fournisseur le **dit** au lieu d'offrir un clic qui tomberait sur un 409.

⚠️ Un **avoir** (`kind='credit_note'`) porte des montants **négatifs** : les afficher en
valeur absolue ferait passer un remboursement pour un débit.

⚠️ Le type `BillingInvoice` est **écrit à la main** dans `types/api.ts`, et pas pour la
raison des autres types billing : ici le contrat est parfaitement déclaré côté serveur. C'est
le **snapshot commité** qui est antérieur au lot ; le rafraîchir emporterait toute la dérive
accumulée. `api:refresh` est un acte à part, dont le diff est l'information — jamais l'effet
de bord d'un lot d'écran. Les champs ont été relevés un à un sur le document servi par la
prod (`v1.181.0`) **et** par la preprod, schémas identiques.

⚠️ La règle des centimes vit désormais dans **`lib/euros.ts`**, pas dans l'écran : elle
existait en plusieurs exemplaires dont un seul était juste. Une facture est un document
opposable — le nombre qu'on y lit doit être celui qui a été débité. (Les trois copies
restantes, `BillingCheckout`, `BillingPriceCard` et `BillingGranted`, formatent des prix de
**catalogue** toujours ronds ; elles n'ont pas été touchées, mais ce sont les candidates si
on reprend le sujet.)

## ⚠️ Un don n'écrit aucune ligne d'abonnement

L'écran lit l'abonnement. Or un **don d'option** (`option_comps`, couche 3 d'ADR 0043)
ouvre un avantage payant sans en écrire la moindre ligne : son bénéficiaire tombait donc
sur le catalogue, prix affichés et bouton armé, qui lui vendait exactement ce qu'il
possédait déjà. Mesuré côté serveur le 2026-09-02 : **32 dons vivants pour un seul
abonnement payant** sur toute la plateforme — le cas majoritaire, pas le cas limite.

`GET /api/me/billing` porte donc deux blocs de plus, servis dans les **deux** branches
(`subscribed` vrai comme faux) : `granted[]` (les avantages offerts — `label`, `detail`,
`scope`, `value_amount` en centimes HT, `expires_at`, `days_left`) et `usage` (`calls`,
`included`, `period_start`, `over`). `[]` et `null` veulent dire « rien à montrer ».

Ce que ces deux blocs imposent à l'écran :

- **Le catalogue RESTE affiché** sous la carte « offert ». Un don n'est pas un abonnement,
  et la voie pour en prendre un ne doit pas se refermer — c'est même tout l'enjeu.
- **On NOMME l'avantage** (`label`, dérivé du registre de connecteurs côté serveur). Un
  « offert par Otomata » seul deviendrait faux le jour où un second avantage s'offre, et
  il n'y a pas que la messagerie qui coûte.
- **Le badge se réutilise, la phrase qui l'accompagne non.** L'abonnement `comp` dit
  « aucun paiement, aucune échéance » ; un don, lui, **peut parfaitement avoir une
  échéance**. Transplanter la phrase mentirait.
- **Une échéance se date au JOUR.** `fmtDate` rend « Oct 2026 » (en-US, mois + année) :
  à un bénéficiaire, ça ne dit pas s'il lui reste un jour ou trente. D'où **`fmtDay`**
  (« 31 octobre 2026 »), ajoutée À CÔTÉ sans toucher `fmtDate`, qui garde ses usages.
  Elle ordinalise le premier du mois (« 1er septembre ») : `Intl` ne le fait pas, et
  `period_start` tombe toujours un 1er — la faute se lirait tous les mois.
- **`days_left` NÉGATIF = échu**, et le serveur ne le borne pas à zéro exprès. « Expire
  aujourd'hui » serait faux : on annonce la fin **et** ce qui la rouvre (choisir un
  palier), sinon l'écran annonce une perte sans issue — la règle « jamais d'alerte sans
  levier », un cran plus loin.
- **Aucun ratio, nulle part : ni barre, ni jauge, ni pourcentage, ni anneau.** L'usage
  médian mesuré est de **25 appels pour 1000 inclus** ; toute forme qui divise les deux
  nombres affiche une barre vide, et une barre vide dit « c'est gratuit et sans fin » —
  l'inverse exact de ce que ce compteur existe pour faire comprendre. On pose les deux
  nombres côte à côte et on laisse le lecteur les rapprocher. Le ton se change sur
  `over`, **servi**, jamais sur un ratio calculé à l'écran.
- **Le dépassement ne coupe rien et ne facture rien** — le journal qui porte le chiffre
  est best-effort côté serveur. La copie dit ce qui est, elle ne menace de rien.
- **Fenêtre = mois en cours**, et c'est une contrainte de donnée, pas un choix de produit :
  la rétention réelle du journal ne permet pas de comparaison au mois précédent. Ne rien
  bâtir dessus tant qu'elle n'a pas rattrapé la politique.

⚠️ Le serveur **referme le dispositif hors de son périmètre** : une org hébergée par un
tenant tiers reçoit `granted: []` et `usage: null`. Ses clients sont ceux du partenaire —
leur afficher « offert par Otomata jusqu'au … » serait s'adresser aux clients de quelqu'un
d'autre par-dessus sa tête. Le front n'a rien à filtrer, mais il ne doit pas non plus
reconstruire ces blocs depuis une autre source.

⚠️ `BillingGrant` et `BillingUsage` sont **écrits à la main** dans `types/api.ts`, comme
`BillingStatus` lui-même : `/api/me/billing` ne déclare pas d'`Output`, donc le document
OpenAPI ne les porte pas et `api:gen` ne peut pas les dériver. Le correctif de fond est
côté oto-backend. D'ici là les deux champs restent **optionnels**, et l'écran se contente
de ne pas afficher le bloc si le backend est plus ancien.

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
| `GET /api/me/billing` | état d'abonnement + catalogue quand l'org n'a rien ; depuis #486 il porte aussi `amount_ttc`/`vat_scheme` de la **prochaine** échéance, et depuis le 2026-09-02 `granted[]` + `usage` — servis dans les DEUX branches |
| `GET`/`PUT /api/me/billing/identity` | la fiche, `missing` (les champs requis absents, dans l'ordre du formulaire), `vat_scheme`, `vat_rate_bps`, `vat_blocked` |
| `GET /api/me/legal`, `POST /api/me/legal/accept` | les documents et le reste-à-accepter du contexte `purchase` |
| `POST /api/me/billing/subscribe` | ouvre le checkout ; 409 avec `details.blockers` tant qu'un préalable manque |
| `POST /api/me/billing/confirm` | l'avancement au retour et en re-sonde ; accepte `payment_ref` |
| `POST /api/me/billing/cancel` | résilier à fin de période (org_admin) |
| `POST /api/me/billing/resume` | annuler la résiliation, tant que la période court (org_admin) ; `400 already_ended` sinon |
| `POST /api/me/billing/method` | ouvrir un changement de carte : `{return_url}` → `checkout_url` + `notice` (org_admin) |
| `POST /api/me/billing/method/confirm` | constater le retour (ou re-sonder) : `status` ∈ changed / pending / pending_mandate / failed / already_current, + `notice` ; accepte `payment_ref` |
| `GET /api/me/billing/payments` | le journal des tentatives |
| `GET /api/me/billing/invoices` | les factures ET avoirs de l'org, plus récents d'abord — lecture ouverte à **tout membre**, comme le journal des paiements |
| `GET /api/me/billing/invoices/{id}/pdf` | le PDF, **authentifié** (jamais une URL publique) ; 409 `pdf_not_available` tant que le fichier n'est pas revenu du fournisseur |

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

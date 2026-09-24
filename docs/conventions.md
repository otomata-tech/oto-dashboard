---
title: Conventions du front
type: reference
description: >-
  Le typecheck du CI (`vue-tsc --build`, project references) et les deux vecteurs vécus de «
   local vert / CI rouge » : le cache incrémental qui ne re-vérifie pas les fichiers non tou
  chés, et le working tree ≠ arbre commité sur un checkout partagé. Plus la règle transverse
   « une alerte qui réclame un geste offre le moyen de l'accomplir », et son tripwire ;
   « un identifiant de compte s'affiche en personne » (#143) ; « une adresse n'affiche que
   l'objet qu'elle désigne » (oto#201, oto#203) ; « un rôle ne vaut pas droit d'écrire »
   (oto#211, étendu à `/connectors` par oto#212).
---

# Conventions du front

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Le typecheck — la commande DU CI, et les deux vecteurs de local-vert-CI-rouge

- ⚠️ **Avant push : typecheck avec la commande DU CI = `npx vue-tsc --build`** (script `type-check`, project references), PAS `--noEmit`. Le CI (`npm run build` → `run-p type-check …`) utilise `--build`, **plus strict** que `--noEmit` : un `--noEmit` local VERT peut être un `--build` CI ROUGE (vécu 2026-07-07 : `isPlatformOperator` utilisé dans un template sans import → `TS2339` seulement en `--build` → deploy dashboard bloqué pour tous). Purger le cache avant (`rm -f frontend/*.tsbuildinfo`). Le cache incrémental `tsbuildinfo` ne re-vérifie PAS les fichiers non touchés → un changement de nullabilité dans `types/api.ts` peut casser un consommateur ailleurs. Vécu 2026-06-22 (`AlphaInvite.email` passé nullable → `resendAlphaInvite` cassé).
  > **Second vecteur local-vert-CI-rouge : working tree ≠ arbre commité.** `vue-tsc` local compile le **working tree** ; le CI compile l'**arbre commité**. Sur ce tree partagé (`/data/oto`), le working tree porte souvent du WIP d'une session parallèle **ou** un correctif du linter non commité → le typecheck local passe alors que le commité casse. Corollaires : (a) après un `git add` large, vérifier qu'on n'a pas emporté un hunk étranger (retrait d'un symbole encore consommé par un fichier resté à l'ancienne version → build rouge) ; fix = `git checkout <sha-main> -- <fichier>` puis re-appliquer **seulement** ses ajouts additifs. (b) Si le CI pointe une ligne verte en local, comparer `git show HEAD:<fichier>` au working tree avant de conclure. Vécu 2026-07-02 (section Context : presets emportés + `ContextView.vue:45` corrigé par le linter mais non commité).

## ⚠️ Une alerte qui réclame un geste offre le moyen de l'accomplir

**Règle transverse, tous écrans.** Un cadre qui annonce un problème porte, dans le même
cadre, le geste qui le résout — ou nomme qui peut le faire. Sinon il n'informe pas : il
accuse. Une consigne sans exécution possible est pire qu'un silence, parce qu'elle est lue
avec confiance et qu'elle fait attendre un effet qui ne viendra pas.

**L'incident fondateur.** Sur `/org/billing`, **quatre** alertes de cette famille
coexistaient au 2026-09-02 : identité de facturation réclamée sans formulaire (le seul
abonné payant a lu la consigne **huit jours** sans pouvoir l'exécuter, et son prélèvement
suivant aurait échoué en silence) ; paiement en échec sans moyen de changer de carte ;
résiliation programmée sans retour arrière ; facture promise par les CGV, servie par l'API,
demandée par aucun écran. Ce n'était pas quatre oublis — c'était **une classe**.

Ce que la classe apprend, au-delà de ses cas :

- **On ferme la classe, pas le cas.** L'axe est « toute alerte de tout écran », pas « les
  alertes de la facturation ». Quatre correctifs se refont ; un contrôle tient.
- **Le levier n'est proposé qu'à qui peut s'en servir.** Quand le serveur réserve le geste,
  l'alerte **nomme qui peut agir** au lieu d'armer un bouton qui refuserait au clic — la
  même impasse, une porte plus loin (règle transverse « jamais de levier inerte » : un
  bouton hors droits est **omis**, jamais grisé).
- **Deux causes, deux traitements.** Un levier manque soit parce que l'écran l'a oublié
  (corrigeable ici), soit parce qu'**aucune surface serveur ne l'expose**. Le second n'est
  pas un lot de front : il se remonte à oto-backend au lieu d'être bricolé autour. C'est le
  cas des deux alertes qui restent aujourd'hui sans issue sur `/org/billing`
  (cf. `docs/facturation.md`) — il n'existe ni route de changement de moyen de paiement, ni
  inverse à `cancel`.

**Le contrôle** : `src/components/console/alerteLevier.tripwire.spec.ts`. Il énumère toutes
les alertes `<Notice tone="warn">` du dossier et exige que chacune porte un levier **dans son
cadre**, ou figure dans un registre avec sa raison — `informatif` (rien n'est demandé) ou
`levier-voisin` (le geste est immédiatement sous l'alerte, dans le même cadre). Une alerte
neuve que personne n'a classée fait rougir le test.

⚠️ **Ce que ce contrôle ne fait PAS**, et il ne faut pas le croire plus fort qu'il n'est : il
ne juge pas la qualité du levier — aucune analyse statique ne le peut. Il garantit seulement
que **la question a été posée** au moment où l'alerte est apparue. C'est précisément ce qui a
manqué pendant huit jours.

## ⚠️ Un identifiant de compte s'affiche en personne (oto-dashboard#143)

**Règle transverse, tous écrans.** `set_by` — l'auteur d'une clé de connecteur, d'une
version de procédure — est un **identifiant de compte** (sub Logto), pas un nom. Il
s'affiche via `lib/accountLabel.ts` : **nom, à défaut adresse, à défaut l'identifiant**,
jamais l'inverse. L'annuaire vient des membres d'org/équipe déjà lisibles côté client
(`org.get` / `group.get`, accessibles à tout membre — ADR 0023), pas d'un appel admin.

**L'incident (2026-09-01).** Les fiches de clé et l'historique des versions rendaient le
sub brut (`user_…`), lisible par personne. Le premier correctif (branche
`fix/droits-procedure-et-auteur-lisible`) l'a fait par un composable et un module
`people.ts` ; la version livrée sur `main` (3f52e57) tient en une fonction pure,
`accountLabel(sub, members)`, testable sans montage. La carte a un temps cité les noms de
la branche — corrigé le 2026-09-03.

Le sens du repli n'est pas un détail : le nom est la valeur **nominale**, l'identifiant le
cas **dégradé** — quelqu'un qui a quitté l'org, ou un geste de plateforme sans compte
associé — et il se marque comme tel. Inverser l'ordre ferait passer le cas normal pour une
panne, et la panne pour la normale.

## ⚠️ Un écran n'énonce que ce qu'il sait (oto#193)

Relevé pendant la mesure d'usage d'oto#191 (12/09/2026) : quatre éléments de manage.oto.cx
affichaient un fait faux, sans que rien ne casse.

- **La pastille « mcp connecté »** du pied de sidebar était verte en dur. Le backend ne sert
  aucun signal de connexion MCP pour l'utilisateur : `/api/me` n'en porte pas, et
  `/api/me/calls` est un journal d'appels qui compte aussi les appels REST du dashboard
  lui-même — en déduire « connecté » aurait produit un vert par défaut sous un autre nom.
  Elle est retirée. Si un signal est servi un jour, elle revient branchée dessus.
- **Les domaines** : la carte MCP écrivait `auth.oto.ninja`, le fil d'Ariane de l'aperçu et
  l'écran de connexion « app.oto.ninja », en prod comme en préprod. Ils viennent désormais de
  `lib/servedEnv.ts` : le domaine d'authentification est `VITE_LOGTO_ENDPOINT` (injecté par
  `deploy-canari.yml` pour la préprod, lu dans `.env.production` au tag — le même que
  `useAuth` utilise), le domaine de la console est l'origine servie. Un alias qui redirige
  (`app.oto.ninja` → `manage.oto.cx`) n'est jamais celui où la page s'exécute. Aucun repli :
  une variable absente lève.
- **Un libellé dit ce que montre l'écran** : « membres & secrets » ne montrait que des membres
  (« membres ») ; le groupe « mémoire » ne contenait plus que « données », aplati dans
  l'espace de travail.
- **Une fonction qui n'existe pas n'a pas de carte** : « voir en tant que membre », marquée
  « à venir » dans le contexte d'org, est retirée.

⚠️ **Resté en l'état, hors du périmètre d'oto#193** : l'étape d'accueil « connecter un
client » de l'aperçu (`OverviewView.vue`) est cochée en dur (`done: true`) — même défaut que
la pastille, sur un autre élément.

## ⚠️ Une adresse n'affiche que l'objet qu'elle désigne (oto#201, oto#203)

Quatre écrans résolvaient un paramètre d'URL contre une liste et, faute de résultat,
affichaient AUTRE CHOSE sans le dire : la première procédure (`/procedures/:id`, oto#201) ; le
brief du projet ou le tableau précédent (`/projects/:id?doc=`, `/projects/:id/data/:nsRef`) ;
le premier de deux tableaux homonymes, adresse réécrite (`/data/<nom>`, oto#203). Une réponse
plausible et fausse, pire qu'une erreur.

La règle, portée par `lib/routeTarget.ts` (`resolveTarget`, `targetRefusal`) :
- **les clés dans l'ordre, l'identifiant d'abord** — un id ne désigne qu'un objet ; chercher
  id et nom dans la même passe laisse l'ordre de la liste trancher ;
- **un nom porté par plusieurs objets ne choisit pas** : l'écran liste les candidats, et
  n'efface pas l'adresse demandée en la réécrivant ;
- **rien trouvé** : l'écran le dit, avec le code du serveur s'il y a eu une lecture, et rien
  ne s'affiche à la place — `components/console/TargetRefusalCard.vue` ;
- **une liste qui n'a pas chargé ne prouve pas l'absence** : on dit l'erreur, ou on lit par id.

Seule une adresse SANS paramètre choisit par défaut (l'entrée du menu `/procedures`, l'accueil
d'un projet). Tests : `DoctrineView.spec.ts`, `ProjectDetailView.spec.ts`, `DataView.spec.ts`.

## ⚠️ Un rôle ne vaut pas droit d'écrire (oto#211, oto#212)

**Règle transverse, tous écrans d'org et de travail.** En consultation (`active_org_readonly`), le serveur refuse
toute écriture en `403 view_as_read_only`, super_admin compris. Un geste d'écriture ne lit donc
jamais un rôle seul : il lit `canAdministerOrg` (geste d'admin d'org) ou `canWriteInOrg` (geste de
membre), dans `composables/useMe.ts`, la seule source. `useOrgScope` les expose, et
`runnerGestes.droits` en est la projection. La lecture seule se dit une fois, dans la coque
(`ConsultOrgBanner`) ; l'écran omet ses gestes, jamais grisés, et garde ses lectures.

**L'incident (13/09/2026).** Relevé pendant oto#210 : seuls les gestes de campagne composaient la
lecture seule. Membres, paramètres, sécurité, connecteurs, équipes et facturation offraient au
super_admin qui consulte l'org d'un client des gestes dont chaque clic prenait 403. Le rôle était
juste ; l'état de la session était ignoré.

Deux pièges que la règle a fait sortir :
- **une sonde qui se dit lecture peut être une écriture pour le serveur** : « tester » un
  connecteur est un POST sans `op`, et la liste des lectures du middleware est une liste blanche.
  Le levier la retient (`canVerify`) ;
- **un geste de membre n'est gardé par aucun rôle** : « quitter l'org » et « annuler un envoi
  programmé » étaient offerts même à l'admin plateforme qui consulte une org dont il n'est pas
  membre. Ils lisent `canWriteInOrg`.

**Étendue à `/connectors` (oto#212).** Un écran hors `/org/*` est aussi en consultation dès que
l'URL porte `/o/<org>/`. « Mes connecteurs » et la marketplace offraient 22 écritures, portées par
onze composants (panneaux du tiroir, widgets de connexion, marketplace) : chacun lit la même règle.
Un troisième piège : **un contrôle grisé n'est pas un contrôle omis**. L'exposition du membre
rendait ses trois boutons `disabled` ; sans droit, le panneau rend désormais l'état sur une ligne.

**« Voir en tant que » : couvert depuis le 24/09/2026 (oto#212).** Le serveur y refuse toute
écriture, et `/api/me` décrit le compte vu — ses rôles, `active_org_readonly` faux. Le backend sert
désormais `view_as_read_only`, seul signal de ce mode ; `canWriteInOrg` lit les deux champs, et
tout ce qui passe par la règle omet ses gestes. Toujours rien de déduit de l'en-tête envoyé ni du
`localStorage` du bandeau. ⚠️ Un écran qui lit `active_org_readonly` directement au lieu de la règle
rate ce mode : c'est ce que faisait le bandeau d'abonnement, corrigé le même jour.

Recensement écran par écran, et sa mesure contre le middleware : `docs/orgs-groupes-invitations.md`.

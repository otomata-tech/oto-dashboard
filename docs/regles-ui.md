# Règles de l'UI — la liste complète

`CLAUDE.md` n'en garde que les plus coûteuses. Celle-ci est le domicile : une phrase par règle,
l'incident qui l'a produite et ses cas limites dans le doc pointé.

## Identité, droits, consultation

- **La consultation (view-as) n'a ZÉRO effet MCP** : le switcher change ce que le dashboard affiche,
  jamais l'identité de Claude ; le seul geste qui touche le MCP est « définir comme maison »
  (`setActiveOrg`/`useGroup`). → `identite-et-consultation.md`
- **L'état d'un tiers (fiche admin) se calcule contre SON org persistée**, pas `current_org` — qui
  renverrait le contexte du requérant. → `identite-et-consultation.md`
- **Un geste d'admin d'org suit la règle du serveur** : `isOrgAdmin` = org_admin ou super_admin,
  jamais l'`admin` plateforme (403) ; l'opérateur plateforme VOIT les écrans d'administration d'org
  en lecture (`seesOrgAdministration`), sauf ceux dont les lectures mêmes exigent l'admin
  (`orgAdminReads`). → `orgs-groupes-invitations.md`
- **Un rôle ne vaut pas droit d'écrire** : un geste d'écriture lit `canAdministerOrg` ou
  `canWriteInOrg` (`useMe`), jamais le rôle seul — en consultation (`active_org_readonly`) le serveur
  refuse tout, super_admin compris ; la coque le dit une fois (`ConsultOrgBanner`), l'écran omet ses
  gestes, `/connectors` compris. « Voir en tant que » n'est pas couvert : aucun champ servi ne le dit,
  et la règle ne le déduit pas ; le super_admin peut y ouvrir l'écriture par un geste d'acceptation
  explicite (bandeau). → `conventions.md`, `orgs-groupes-invitations.md`, `identite-et-consultation.md`
- **Un droit d'ÉCRITURE ne se déduit pas d'un droit d'ADMINISTRATION** : un geste d'écriture lit le
  drapeau de SON geste (`can_write_instructions`…), jamais `can_edit`. Aucun écran n'écrit plus de
  procédure aujourd'hui ; la règle vaut pour le prochain. → `orgs-groupes-invitations.md`

## Ce qu'un écran a le droit d'affirmer

- **Jamais de levier inerte** : un pouvoir qu'un scope n'a pas ⇒ colonne/onglet **omis**, jamais
  affiché grisé.
- **Jamais d'alerte sans levier** (la règle symétrique) : un message qui nomme un geste porte le geste
  dans la même phrase, ou nomme qui peut agir ; un formulaire posé dans un tunnel doit aussi vivre
  APRÈS le tunnel. Tripwire : `alerteLevier.tripwire.spec.ts`. → `conventions.md`, `facturation.md`
- **Un écran n'énonce que ce qu'il sait** : un état (pastille, coche) lit un signal servi, jamais une
  valeur par défaut, sinon il disparaît ; un domaine affiché vient de l'environnement servi
  (`lib/servedEnv.ts`), jamais d'une constante. → `conventions.md`
- **Une adresse n'affiche que l'objet qu'elle désigne** : id avant nom, un nom ambigu liste ses
  candidats, un objet introuvable se dit avec le code du serveur — jamais un autre objet à sa place
  (`lib/routeTarget.ts`, `TargetRefusalCard.vue`). → `conventions.md`
- **Une page absente de `PAGE_META` retombe silencieusement sur l'overview** ; `lib/consoleNav.spec.ts`
  tient la règle (tout écran a son titre, tout titre ses deux traductions). → `automations.md`
- **`set_by` est un identifiant de compte, pas un nom** : il s'affiche via `lib/accountLabel.ts` — nom,
  à défaut adresse, à défaut l'identifiant, jamais l'inverse. → `conventions.md`
- **Copy user-facing = verbatim** (`lib/connectorVerdict.ts` porte la copy du CDC), jamais reformulée ;
  i18n FR complète.
- Les identifiants de code/API gardent le mot « doctrine » (`Doctrine*View`, `getDoctrine`,
  `/api/me/instructions*`) ; seul le vocabulaire produit (routes, copy) dit « procédure » / « agent
  readme ». → `agent-context.md`

## Les miroirs du serveur

`lib/keyStack.ts` (↔ `access.walk_cascade`), `lib/credentialForm.ts`, `lib/tenantVerdict.ts`,
`lib/connectorVerdict.ts`, `lib/datastoreClaims.ts` : **aucun test ne relie les deux repos**, une
erreur n'y casse pas l'écran, **elle fait mentir l'UI** ; toute évolution se fait des deux côtés.
→ `connecteurs.md`, `plateforme.md`, `datastore.md`

- **Un secret conservé est OMIS du corps** du formulaire de credential : le serveur traite une clé
  présente et vide comme un effacement. → `connecteurs.md`
- **Un paiement RÉUSSI ne produit jamais de copie négative** : les branches de `confirm` sont des 200
  discriminées par `status`, `pending_mandate` est une attente, et aucun bouton de paiement n'est
  atteignable pendant l'attente. → `facturation.md`
- **Les horodatages du backend arrivent en UTC sans fuseau** : toute lecture de date passe par
  `instant()` (`lib/runnerJobs.ts`), jamais par `Date.parse` nu. → `automations.md`

## Design system — règles front (DRY, non négociables)

- **Réutiliser avant d'écrire** : composer les classes `console.css` et les composants existants, ne
  jamais redéfinir un style qui existe.
- **Zéro valeur magique** : couleurs, rayons, espacements, ombres, polices → `var(--…)` uniquement.
  Rayons : `--radius-md` ou `--radius-pill`, rien d'autre.
- **Accents = sens**, jamais décoratif. Icônes = Lucide ; jamais de SVG dessiné à la main, jamais
  d'emoji.
- **Besoin récurrent (≥2×) manquant → un composant** dans le design system, documenté, puis utilisé.
  Étendre le système, jamais bricoler dans une vue.
- **Contraste** : petits libellés en `--color-mute`/`--color-faint` (lisibles WCAG sur crème), vérifier.
- Toute nouvelle vue rend **empty / error / loading** explicitement.
- **Jamais de dialog natif** (`window.prompt`/`confirm`/`alert`) : éditeur + confirmation inline.

---
title: Refonte UX des pages Projet & Projets (cahier des charges, historique)
type: reference
description: >-
  Le cahier des charges de la refonte des pages Projet/Projets, écrit le 16/07/2026. Documen
  t historique : ce qui reste valide, ce qui est périmé, et pourquoi les pages Projet visées
  seront celles du nouveau front.
---

> **Déplacé ici le 2026-08-27** depuis `design-system/`, archivé le même jour. Le cahier des
> charges reste utile au dashboard **actuel** tant qu'il vit — mais les pages Projet qu'il vise
> seront celles du **nouveau front** : le futur design system du produit est le sien, pas celui
> décrit ici. Lire ce document comme l'énoncé d'un besoin UX, pas comme une spec à implémenter.

> ⚠️ **Document historique — ne pas implémenter tel quel.**
>
> Écrit le 16/07/2026 contre le modèle où un projet est un **conteneur d'entités liées**. Ce qui a changé depuis :
>
> - **Le rail d'entités est abandonné** (maquettes du 11/08/2026) : la navigation ne scinde plus procédures / tableaux / pages — le menu de gauche *est* l'arborescence du contenu, et une procédure s'y intercale comme n'importe quel nœud. Un rail listant « les entités du projet » à côté de cet arbre afficherait deux fois la même chose.
> - **Ce qui reste valide** : le viewer (maquetté à nouveau le 11/08, avec ses blocs et son fil d'Ariane), le mapping maquette → tokens, et les signatures de composants — `ProjectRail.vue` et `ProjectViewer.vue` sont en production.
> - **Sur les cinq « points à trancher » du §10** : trois sont périmés (les compteurs d'entités comptaient des liens, objet appelé à disparaître ; le viewer n'attend plus le backend ; le troisième est cosmétique). **Deux restent ouverts**, transposés : transférer un projet reviendra à transférer un **sous-arbre** — « et le contenu, il suit ? » —, et l'endroit où vit l'endpoint MCP dans le partage.
>
> Rapatrié le 11/08/2026 depuis le poste où il vivait seul (`annex-ADR-refonte-projets.md`, lot design du 16/07).

# Refonte UX — pages **Projet** & **Projets**

Guide d'implémentation · cible : `otomata-tech/oto-dashboard` (Vue 3 + `frontend/src/…`)

> **Source de vérité visuelle** : la maquette interactive `Projets - Oto Console.dc.html`
> (+ le composant `Menu Oto.dc.html` pour le menu de gauche). Tout ce qui suit décrit comment
> porter cette maquette dans le vrai codebase. Les tokens de couleur/typo sont **identiques**
> à ceux de l'app (`--color-ink`, `--color-saffron`, `--color-paper-2`, `--font-mono`…), donc
> le portage est surtout un **refactor de présentation** — pas une réécriture de la couche data.

---

## 0. TL;DR

1. **Page Projets** (`ProjectsView.vue`) : sortir le titre/description de la `ConsoleCard` et le fusionner dans une **barre d'en-tête** (titre + compteur + « Nouveau projet »). Cartes enrichies **orientées état** (pastilles partagé / mcp / modèle / à vérifier) + bascule **cartes ↔ tableau dense**.
2. **Page Projet** (`ProjectDetailView.vue`) : refonte d'ossature. L'en-tête de page fusionne **nom + tags + actions** (Partager · Historique · **Reprendre dans Claude** · •••). Le corps devient un **navigateur de contenu pleine largeur** = *viewer* à gauche (3fr) + *rail d'entités* à droite (~0.85fr). Partage → **modale**. Activité → **drawer Historique**.
3. **Ne pas réécrire la logique** : `ProjectWiki.vue` et `ProjectEntities.vue` contiennent déjà tout le câblage API (docs, liens, résolution connecteur, surcharge). On **réutilise leurs `<script>`** et on ré-agence le rendu.

---

## 1. Contexte & intention

Retours issus de la revue (transcript) qui motivent la refonte :

- **Trop de boutons à plat** sur la page projet (6 boutons lowercase en ligne). → 1 action primaire + secondaires + overflow.
- **Manque de hiérarchie / contraste**, « trop monochrome ». → application stricte du design system (sidebar ink, accents sémantiques, cartes chaudes).
- **Objectif n°1 de la liste** : « voir l'état de chaque projet d'un coup d'œil ». → cartes/lignes orientées état.
- **« tout est une page »** : fusion brief ↔ page (déjà amorcée dans `ProjectWiki`). Le brief est la page d'accueil.
- **Entités = pointeurs résolus** : un connecteur s'affiche avec sa **résolution** (compte), ex. `Unipile · compte partagé` ; la procédure reste générique, le **projet porte la résolution**.
- **Partage = un seul endroit à 4 modes** : équipe · lien public (browser) · endpoint MCP (sans compte) · transférer. Aujourd'hui éclaté en 3 cartes + boutons dispersés = « le bordel ».
- **Procédure = entité à part** (traçable, partageable, runs) — distincte du doc. *(Hors périmètre du pur portage UI ; le viewer procédure est prêt à recevoir les runs quand le backend les expose.)*

---

## 2. Avant → Après

| | Aujourd'hui | Cible |
|---|---|---|
| **Liste — chrome** | `ConsoleCard title="projects"` + description, bouton `+ Nouveau projet` dans les actions de la carte | Barre d'en-tête : `Projets` + `N projets` (mono) + bouton **Nouveau projet** (pill saffron 36px) |
| **Liste — items** | carte : nom + tag modèle + tag org/perso + snippet + `maj` | carte **état** : nom + owner + **pastilles** (partagé / mcp live / modèle / lecture / à vérifier) + snippet 2 lignes + `maj · N entités` + chevron ; **+ bascule tableau dense** |
| **Détail — en-tête** | `← projets` puis header : eyebrow + gros titre + `● actif` + 6 boutons lowercase | header fusionné : **nom + tags + avatars + Partager · Historique · Reprendre dans Claude (primary) · •••** (mêmes hauteurs 36px) |
| **Détail — corps** | grille `1fr 280px` : atelier (wiki + audit + entités) \| méta (partage, MCP, docs, activité) en cartes empilées | **navigateur pleine largeur** : *viewer* 3fr (gauche) + *rail d'entités* ~0.85fr (droite) ; audit en **bandeau pleine largeur** |
| **Partage** | 2 cartes (`partage`, `Endpoint MCP & partage`) + bouton `Transférer` + `SharePrincipalDialog` | **1 modale** « Partager » à 4 sections : Équipe · Lien public chiffré · Endpoint MCP · Transférer |
| **Activité** | carte `activité` + `ActivityChart` inline | bouton **Historique** → **drawer** (~50 %) : graphe 14 j + événements enrichis (`par l'agent / <nom de l'utilisateur>`) |
| **Actions surchargées** | tout visible | primary + overflow (Copier · Publier/Retirer modèle · Archiver) — tweak `detailActions: grouped/flat` |

---

## 3. Inventaire des fichiers

**À refondre**
- `frontend/src/views/console/ProjectsView.vue` — page liste.
- `frontend/src/views/console/ProjectDetailView.vue` — page projet (chef d'orchestre).
- `frontend/src/components/console/ProjectWiki.vue` — **réutiliser le `<script>`** (docs/brief) ; le rendu « arbre + page » alimente désormais *rail Pages* + *viewer page*.
- `frontend/src/components/console/ProjectEntities.vue` — **réutiliser le `<script>`** (links, résolution, surcharge, identités) ; alimente *rail Connecteurs/Tableaux/Procédures/Documents* + *viewers* correspondants.

**À créer** (voir §7)
- `ProjectRail.vue` — le rail d'entités groupé (droite).
- `ProjectViewer.vue` — le viewer polymorphe (gauche), 6 types.
- `ProjectShareDialog.vue` — la modale Partager 4-en-1 (absorbe `SharePrincipalDialog` + carte MCP + transfert + lien public).
- `ProjectHistoryDrawer.vue` — le drawer Historique (enveloppe `ActivityChart` + liste enrichie).
- `EntityPickerDialog.vue` — modale « lier / créer » ouverte par le `(+)` de chaque groupe (réutilise les sélecteurs réels de `ProjectEntities`).

**Réutilisés tels quels**
- `Tag.vue`, `Icon.vue`, `Btn.vue`, `Dropzone.vue`, `MarkdownView.vue`, `ActivityChart.vue`, `NameDialog.vue`, `FormDialog.vue`, composables `useToast` / `usePrompt` / `useTransferOwnership` / `useFormDialog`.

**Aucun changement d'API backend requis** pour le portage (les endpoints listés en §8 existent déjà). Les seuls « manques » (runs de procédure, aperçu tableau inline) sont signalés `⚠ dérivé/à câbler`.

---

## 4. Tokens & primitives (mapping maquette → app)

La maquette utilise les composants React du design system ; en Vue, remplace par les primitives de l'app. **Les tokens CSS sont les mêmes** — garde-les.

| Maquette (DS React) | App (Vue) | Notes |
|---|---|---|
| `Tag tone=…` | `Tag.vue` | tones : `saffron` `terra` `olive` `cobalt` (+ neutre = pas de tone) |
| `Icon name=…` | `Icon.vue` | l'app expose des alias Lucide/Oto : `plug` `db` `doc` `book` `ext`… ; mappe les noms (`file-text`→doc, `chevron-right`, `pencil`, `users`, `activity`, `plus`, `x`, `ellipsis`, `sparkles`, `trash-2`, `external-link`, `triangle-alert`, `house`). Ajoute les glyphes manquants dans `Icon.vue` depuis Lucide. |
| `Button kind=…` / `MenuItem` | `Btn.vue` + un petit `Menu`/`MenuItem` (ou `<button>` stylé) | boutons = **pill** ; voir classes `.btn-resume` / `.btn-soft` déjà présentes dans `ProjectDetailView.vue` |
| `OtoMark` | mark existante (`lib/mark.ts`) | dans l'en-tête, optionnel |

**Tokens clés** (déjà dans `assets/main.css` / `console.css`) : `--color-ink` `--color-ink-soft` `--color-mute` `--color-faint` `--color-bg` `--color-surface` `--color-paper` `--color-paper-2` `--color-hair` `--color-hair-soft` `--border-card` · accents `--color-saffron(-soft/-ink)` `--color-terra…` `--color-olive…` `--color-cobalt…` · `--font-sans` `--font-mono` · `--radius-md`(8px) `--radius-pill`(999px) · `--shadow-card` `--shadow-pop` · `--ease-out` `--t-fast`.

**Sélection dans le rail** (motif récurrent) : `background: var(--color-saffron-soft)` + `color: var(--color-saffron-ink)` + liseré gauche `box-shadow: inset 2px 0 0 var(--color-saffron)`. Hover d'un item non sélectionné : `var(--color-paper-2)`.

**Titres de section de modale** (Équipe / Lien public / MCP / Transférer) : 14.5px / 700, couleur `color-mix(in srgb, var(--color-saffron) 55%, var(--color-saffron-ink))`, avec icône de même teinte. *(Reco DS : en faire un vrai composant `SectionTitle` — l'eyebrow mono 10px est trop faible pour titrer une section de modale.)*

---

## 5. Page **Projets** (`ProjectsView.vue`)

### 5.1 Structure cible

```
content-inner
├─ HEADER (barre)  ── remplace la ConsoleCard titre/description
│   ├─ h1 « Projets »  +  span mono « {{ projects.length }} projets »
│   └─ [Nouveau projet]  (pill saffron, 36px, icône plus) → create()
├─ segmented « cartes | tableau »  (bascule listLayout, cf. 5.3)
├─ GRID projets            (cartes)  OU  TABLEAU dense
└─ section « modèles »     (cartes tirets, bouton « Utiliser ce modèle »)
```

- Supprime la `ConsoleCard` d'en-tête. Garde la logique `load()` / `create()` / `useTemplate()` / `openProject()` / `briefSnippet()` **inchangée**.
- La phrase « conteneurs de travail (un but + ses entités)… » n'a plus de place fixe : la mettre en **état vide** (aucun projet) ou en tooltip du titre. *(à trancher — §10)*

### 5.2 Données par carte

Le backend `Project` porte déjà : `name`, `owner_type` (`'org'|'perso'`), `is_template`, `brief_md`, `updated_at`, `mcp_access`. Il faut, pour les pastilles, **partagé** et **nombre d'entités** :

- `mcp live` ← `p.mcp_access && p.mcp_access !== 'off'`.
- `modèle` ← `p.is_template`.
- `partagé` ← présence de grants **ou** un flag `p.shared` / `p.grant_count` s'il existe. ⚠ `listProjects()` ne renvoie peut-être pas les grants : soit **ajouter `shared`/`grant_count`** au DTO de liste (léger, recommandé), soit dériver au chargement. À confirmer côté `oto-backend`.
- `à vérifier` ← audit. Idem : exposer un `has_audit`/`audit_count` sur la liste, ou l'omettre en liste (l'audit reste visible sur le détail).
- `N entités` ← `links.length` (+ fichiers) : exposer `entity_count` sur la liste, sinon masquer le compteur.

> Règle de pastilles (reprise de la maquette, `chipsFor`) : modèle=saffron, mcp live=olive, partagé=cobalt, lecture=neutre, à vérifier=saffron.

### 5.3 Bascule cartes ↔ tableau

Tweak `listLayout` (`'cards' | 'rows'`, défaut `cards`). Persister en `localStorage` (`oto.projects.layout`).

- **cards** : `grid-template-columns: repeat(auto-fill, minmax(288px,1fr))`, gap 14px ; carte = surface blanche `--border-card` + `--shadow-card`, hover `translateY(-2px)` + `--shadow-pop`.
- **rows** : tableau `1fr auto 132px 96px 28px` (projet · état · maj · entités · chevron), en-tête mono, lignes hover `--color-paper-2`. Idéal pour scanner beaucoup de projets.

---

## 6. Page **Projet** (`ProjectDetailView.vue`)

`ProjectDetailView` reste le **chef d'orchestre** (charge le projet, détient l'état, distribue les props/handlers). Sa logique `<script>` est **quasi conservée** — on ré-agence le `<template>` et on déplace le rendu vers `ProjectRail` / `ProjectViewer` / les dialogs.

### 6.1 Nouvelle ossature

```vue
<div class="pj-page">                 <!-- flex column, 100% hauteur -->
  <header class="pj-topbar"> … </header>       <!-- 6.1a -->
  <ProjectAuditBanner v-if="auditIssues" :audit="audit" />   <!-- 6.7, pleine largeur -->
  <div class="pj-body">                 <!-- grid: 3fr minmax(198px,.85fr) -->
    <ProjectViewer :sel="sel" … />      <!-- order:1 (gauche) -->
    <ProjectRail   v-model:sel="sel" … /> <!-- order:2 (droite) -->
  </div>

  <ProjectShareDialog   v-if="shareOpen"  … />
  <ProjectHistoryDrawer v-if="histOpen"   … />
  <EntityPickerDialog   v-if="addKind"    :kind="addKind" … />
</div>
```

- Supprime `RouterLink ← projets` (l'en-tête + le menu latéral suffisent à la navigation).
- `sel` = clé de l'entité/page sélectionnée (défaut : la page d'accueil / brief).

**6.1a — En-tête fusionné** (remplace `.wk-head`)

```
[ nom du projet ]  [tags: modèle? lecture?]  ……  [avatars] [Partager] [Historique] [Reprendre dans Claude] [•••]
```

- **Nom** = `project.name` (h1, 20px/700). **Tags** = `modèle` (si `is_template`), `lecture` (si `readOnly`). *(l'ancien `● actif` et l'eyebrow « projet d'org · partagé » disparaissent.)*
- **Avatars** = 3 premiers `grants` empilés (chevauchement −8px) → clic ouvre la modale Partager. Palette : cobalt/saffron/olive-soft.
- **Partager** (ghost pill) → `shareOpen = true`.
- **Historique** (ghost pill) → `histOpen = true`.
- **Reprendre dans Claude** (primary **ink**, icône `sparkles`) → `handoff()` **inchangé** (copie le blob presse-papier).
- **•••** overflow (tweak `detailActions=grouped`) : `Copier le projet` → `copy()` ; `Publier/Retirer comme modèle` → `toggleTemplate()` ; séparateur ; `Archiver` (danger) → `archive()`. En `flat`, ces 3 sont des boutons visibles.
- Tout à **36px** de haut, radius pill. Réutilise `.btn-resume` (primary) et `.btn-soft` (ghost) déjà définis ; ajoute juste les hovers manquants.

### 6.2 Rail d'entités (`ProjectRail.vue`, droite)

Colonne `background: var(--color-paper)`, `border-left: 1px solid var(--color-hair)`, padding 18/14, groupes espacés de 20px. **Ordre des groupes** :

1. **Pages** (icône `book`) — items depuis `ProjectWiki` : `Accueil - Brief` (icône `house`, = brief), puis l'arbre de docs. Sous-pages **repliables** (chevron à gauche, façon Notion) ; `parent_id` pilote l'indentation (`pad`).
2. **Tableaux** (`db`) — `links` filtrés `target_type==='tableau'`.
3. **Connecteurs** (`plug`) — `target_type==='connecteur'`.
4. **Procédures** (`doc`) — `target_type==='procedure'`.
5. **Documents** (`book`) — `target_type==='doc'`.
6. **Fichiers importés** (`file-text`) — `listProjectFiles()`.

Chaque **en-tête de groupe** : icône + label **mono saffron-ink** (10px, tracking .14em, uppercase) + filet bas + bouton `(+)` (masqué si `readOnly`) → ouvre `EntityPickerDialog` du bon `kind`.

Chaque **item** : `<button>` pleine largeur, `font-size:12.5px`. Sélection = motif saffron (§4). Un item peut porter une **pastille de rail** : `à résoudre` (saffron) si un connecteur n'a pas d'identité, `!` (terra) si slots non bindés, `public` (cobalt) pour un fichier public.

> **Source de la logique** : `ProjectEntities.vue` groupe déjà par `target_type` (`LINK_GROUPS`), résout le nom d'affichage (`linkName`), gère `identity_ref` + `config.instructions_md`. Extrais ce `<script>` dans un composable `useProjectLinks(projectId)` partagé entre le rail et le viewer, ou passe `links` + handlers en props.

### 6.3 Viewer (`ProjectViewer.vue`, gauche)

Colonne `background: var(--color-surface)`, padding 26/30. **En-tête de viewer** commun : tuile-icône 40px + titre 20px + tags + eyebrow/hint + actions (`éditer`, `+ sous-page` pour une page ; `éditer` pour une procédure). Puis un corps **selon le type** (6 branches) :

| Type | Contenu | Câblage |
|---|---|---|
| **page** | blocs markdown (`MarkdownView`) du brief/doc + liste des sous-pages en bas | `ProjectWiki` : `brief_md` (accueil) ou `doc.body_md` ; `éditer` = logique existante ; `+ sous-page` = `addDoc(parent)` |
| **connecteur** | **résolution** (select du compte / identité) + **outils exposés** (chips mono) + **surcharge** (textarea instructions) + `Enregistrer` | `ProjectEntities` : `getConnectorIdentities`, `identity_ref`, `config.instructions_md`, `saveConfig` |
| **tableau** | aperçu des premières lignes (grille) + méta + lien « ouvrir → » | deep-link `/data/:ref` existe ; ⚠ **aperçu inline** = à câbler (fetch échantillon) ou fallback lien |
| **procédure** | déroulé (étapes) + **derniers runs** (pastille ok/échec) + `éditer` | déroulé = doctrine liée ; ⚠ **runs** = à câbler quand le backend expose l'exécution des procédures |
| **doc** | contenu markdown | doc lié (vit dans son projet d'origine) |
| **fichier** | aperçu + taille + `Partager par lien public` | `listProjectFiles` / `setProjectFilePublic` / `deleteProjectFile` |

Chaque **titre de sous-bloc** (résolution, outils, surcharge, déroulé…) : mono 9.5px saffron-faint.

### 6.4 Modale **Partager** (`ProjectShareDialog.vue`)

Ouverte par le bouton *Partager* / les avatars. Overlay `rgba(44,33,18,.42)`, carte centrée `min(540px,100%)`, header sticky `--color-saffron-soft`. **4 sections** séparées par un filet :

1. **Équipe — membres & org** : liste des `grants` (initiales + label + tags équipe/org + édition/lecture + `✕` révoquer) ; champ « email ou @équipe » + `Inviter`. → absorbe `SharePrincipalDialog` (garde son `<script>` : `getResource`, `unshareResource`, `principalOf`, `revoke`, et le geste d'ajout membre/équipe/org/email).
2. **Lien public · chiffré** : instantané lecture seule (brief + pages), **chiffré navigateur** (la clé vit dans le lien). État actif → input read-only + `Copier` ; sinon `Partager par lien chiffré`. → mappe sur le mode **`secret`** existant (`shareUrl` = `<slug>.share.oto.cx`, `copyShareUrl`). *(Nom UI = « lien public chiffré » ; techniquement = accès `secret` navigable.)*
3. **Endpoint MCP** : publie le projet en serveur MCP **sans compte**. Tag d'accès (`public · sans login` / `org · authentifié`) + input URL + `Copier` + liste d'outils ; sinon `Publier en endpoint MCP`. → `publishMcp()` / `unpublishMcp()` / `copyMcpUrl()` **inchangés** (le `promptForm` slug/access/tools reste valable, ou intègre-le dans la section).
4. **Transférer la propriété** : « avec ou sans copie chez toi » → `transfer()` (`pickTarget` + `transferResource`). ⚠ **à trancher** (§10) : transfert **avec/sans copie** + auto-inclusion dans l'org cible.

Masque les contrôles d'écriture si `readOnly` (affiche « réservé au propriétaire »).

### 6.5 Drawer **Historique** (`ProjectHistoryDrawer.vue`)

Ouvert par *Historique*. Overlay + panneau **droite ~50 %** (`min-width:420px; max-width:760px`), header `--color-saffron-soft`, anim slide-in. Contenu :

- **Activité · 14 jours** + compteur d'événements + graphe → réutilise `ActivityChart` (`:activity :days="14"`).
- **Événements** : liste enrichie — pastille sémantique (agent=olive, humain=cobalt, audit=saffron) + `<strong>action</strong> · détail` + **`par l'agent / <nom de l'utilisateur>`** + date mono. `activity` vient de `getProjectActivity`. ⚠ le champ **auteur** (`par …`) : si `ProjectActivity` ne le porte pas encore, l'ajouter au DTO ; sinon dériver de `action` (heuristique de la maquette : déroulé/enrichi/collecte→agent, partagé/publié→humain, audit→auto).

### 6.6 Modale **lier / créer** (`EntityPickerDialog.vue`)

Ouverte par le `(+)` d'un groupe du rail. Deux formes :

- **recherche** (connecteur / tableau / procédure / doc) : champ + résultats + bouton `Lier`. → réutilise les **vrais sélecteurs** de `ProjectEntities` (`entitiesFor(type)` : `getNamespaces` / `getConnectors` / `getDoctrine` / `listDocs`), puis `linkProject(...)`. Pour un connecteur, garde l'étape **identité** (`getConnectorIdentities`, multi-binding #57).
- **création** : `page` (titre → `createDoc`) ; `fichier` (dropzone → `uploadProjectFile`).

### 6.7 Bandeau **Audit** (pleine largeur)

Remplace la `section.surface-card` audit. Bandeau `border-left: 3px solid var(--color-saffron)`, titre mono saffron-ink + tag compteur, puis la liste `dead_links` / `unbound_slots` / `inert_procedures`. Logique `audit` / `auditIssues` / `loadAudit` **inchangée** (`getProjectInventory`).

### 6.8 Lecture seule (`readOnly = can_write === false`)

- Rail : masquer les `(+)`.
- Viewer : `éditer` → **« proposer une modif »** (déjà géré par `ProjectWiki` : `requestDocChange`).
- Modale Partager : masquer invite/révocation/publish/transfert, afficher « réservé au propriétaire ».

---

## 7. Composants à créer — signatures

```
ProjectRail.vue
  props:  groups: RailGroup[]            // dérivé de links + docs + files
          sel: string                    // clé sélectionnée (v-model)
          readOnly: boolean
  emits:  update:sel, add(kind)          // (+) d'un groupe

ProjectViewer.vue
  props:  item: RailItem | null          // l'entité/page sélectionnée
          projectId, readOnly
  emits:  changed                        // → parent recharge activité/audit
  // délègue à ProjectWiki (pages) / logique links (connecteur, etc.)

ProjectShareDialog.vue
  props:  open, project, grants, readOnly
  emits:  close, changed
  // absorbe SharePrincipalDialog + MCP + transfert + lien public

ProjectHistoryDrawer.vue
  props:  open, activity, days=14
  emits:  close

EntityPickerDialog.vue
  props:  open, kind: 'connecteur'|'tableau'|'procedure'|'doc'|'page'|'file', projectId
  emits:  close, linked
```

`RailItem` porte au minimum : `{ key, kind, label, meta?, tags?, parentKey?, railTag? }`. Construis les groupes dans `ProjectDetailView` (ou un composable `useProjectRail`) à partir de `project.links`, des docs (`ProjectWiki`) et des fichiers.

---

## 8. Câblage API — déjà en place (rappel)

Tout est importé aujourd'hui dans `ProjectDetailView.vue` / `ProjectEntities.vue` / `ProjectWiki.vue` :

- **Projet** : `getProject` · `updateProject` (brief) · `archiveProject` · `copyProject` · `setProjectTemplate` · `projectHandoff` · `getProjectActivity` · `getProjectInventory` (audit + outils).
- **Partage / transfert** : `getResource` · `unshareResource` · `transferResource` · `SharePrincipalDialog`.
- **MCP** : `publishProjectMcp` · `unpublishProjectMcp` (+ `mcp_slug` / `mcp_access` / `mcp_url` / `mcp_tools`).
- **Fichiers** : `listProjectFiles` · `uploadProjectFile` · `deleteProjectFile` · `setProjectFilePublic`.
- **Liens (entités)** : `linkProject` · `unlinkProject` · sélecteurs `getNamespaces` / `getConnectors` / `getDoctrine` / `listDocs` · `getConnectorIdentities`.
- **Docs (pages)** : `createDoc` · `updateDoc` · `deleteDoc` · `getDocRevisions` · `requestDocChange` / `listDocChanges` / `resolveDocChange` · `setDocPublic`.

**Éventuels ajouts backend** (non bloquants pour le portage, à arbitrer) :
- Liste projets : `shared` / `grant_count`, `entity_count`, `has_audit` pour les pastilles.
- `ProjectActivity.actor` (auteur : agent vs humain) pour l'Historique.
- Runs de procédure + aperçu tableau inline (viewers `procédure` / `tableau`).

---

## 9. Checklist d'implémentation

- [ ] **Projets** : header-barre (titre + compteur + Nouveau projet) ; retirer la `ConsoleCard` d'en-tête.
- [ ] **Projets** : carte état (pastilles) + bascule `cartes/tableau` persistée.
- [ ] **Projets** : exposer/dériver `shared` + `entity_count` (ou masquer les compteurs manquants).
- [ ] **Projet** : header fusionné (nom + tags + avatars + Partager/Historique/Reprendre/•••), suppression `← projets` et `● actif`.
- [ ] **Projet** : ossature `pj-body` grid `3fr minmax(198px,.85fr)` (viewer gauche / rail droite).
- [ ] Extraire `useProjectLinks` / `useProjectRail` depuis `ProjectEntities` ; construire les groupes.
- [ ] `ProjectRail.vue` (6 groupes, sélection saffron, sous-pages repliables, `(+)` par groupe).
- [ ] `ProjectViewer.vue` (6 types ; pages via `ProjectWiki`, connecteur via logique links).
- [ ] `ProjectShareDialog.vue` (Équipe / Lien public / MCP / Transférer) — absorbe `SharePrincipalDialog` + carte MCP.
- [ ] `ProjectHistoryDrawer.vue` (graphe + événements enrichis).
- [ ] `EntityPickerDialog.vue` (recherche = sélecteurs réels ; création = page/fichier).
- [ ] Bandeau audit pleine largeur.
- [ ] Lecture seule sur tous les surfaces d'écriture.
- [ ] Compléter `Icon.vue` (glyphes Lucide manquants).
- [ ] *(Reco DS)* composant `SectionTitle` + hovers explicites sur les boutons custom.

---

## 10. Points à trancher

1. **Transférer** = avec ou sans copie chez soi ? auto-inclusion dans l'org cible seulement si déjà membre ? (transcript non conclu).
2. **Endpoint MCP** dans la modale Partager (retenu ici) **vs** carte dédiée sur la page.
3. Pastilles liste : ajouter les champs backend (`shared`/`entity_count`/`has_audit`) **ou** afficher un sous-ensemble en attendant.
4. Phrase descriptive « conteneurs de travail… » : état vide, tooltip, ou abandon.
5. **Viewer procédure/tableau** : livrer avec placeholders (runs/aperçu) puis câbler, ou attendre le backend.

---

## Annexe — Menu latéral (hors périmètre, suit)

La maquette porte aussi un menu de gauche refondu (`Menu Oto.dc.html`) : sélecteur de workspace/org **en tête** (logo + nom d'org + chevron), nav à plat (Accueil · Projets + récents · Pages · Tableaux · Connecteurs · Procédures), pied identité (nom de l'utilisateur · org + chevron → popover compte/admin). Il touche `ConsoleLayout.vue` / `ConsoleSidebar.vue` / `ConsoleUserMenu.vue` / `ConsoleIdentity.vue` — **à traiter dans un lot séparé** ; ce guide couvre uniquement Projet & Projets.

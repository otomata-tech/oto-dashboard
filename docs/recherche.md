---
title: Recherche transverse
type: reference
description: >-
  Le geste « retrouver » côté front : popup ⌘K et page deep-linkable, un seul chemin de rend
  u, deep-link `?doc=`, chapôs, tokens d'overlay, drag&drop du rail, backlinks et la boîte «
   À traiter ».
---

# Recherche transverse (⌘K + page `/search`)

> Extrait de `CLAUDE.md` le 2026-08-27 — le contenu n'a pas changé, seule sa place a bougé.
> La carte garde le résumé + le pointeur ; le détail (inventaires d'écrans, historique
> des refontes, incidents datés et leurs leçons) vit ici.

## Le geste « retrouver »

Le geste « retrouver » : **popup ⌘K** (`SearchOverlay`, bâtie sur reka `Dialog` — jamais le
patron drawer maison) ouverte par le faux champ `.sb-search` de la sidebar (`useHotkey`) +
**page `/search?q=`** (exploration deep-linkable, chips de type dérivées des hits). **Un seul
chemin** : rendu partagé `SearchHitList` + `lib/searchNav` (groupHits/flattenHits/hitPath —
l'ordre ↑↓ EST l'ordre affiché groupé), client `searchAll` (= même API que MCP `oto_search`).
Passages surlignés sanitizés DOMPurify (b/mark seulement). **Deep-link page `?doc=<id>`** sur
`/projects/:id` (selectFromRoute ; clic = miroir replace) — la cible de tout hit page.
**Chapôs** (`Doc.description`) : tooltip du rail (jamais de 2e ligne), sous-titre du viewer,
champ d'édition. **Tokens overlay** `--blur-overlay`/`--scrim` (console.css) = LE flou/voile
de toute modale — plus jamais de `blur(Npx)` magique. Rail **drag&drop** natif : réordonner ET **reparenter** une page (3 zones avant/après/imbriquer + garde anti-cycle, émet `move {id, parentId, beforeId}` → `oto_doc op=move parent_id/position`).

## Backlinks & collaboration (Ship 3-4)

**Backlinks & collaboration (Ship 3-4, LIVE preprod)** : `MarkdownView` gagne un resolver OPTIONNEL (`resolveLink`) qui pré-transforme les `[[Titre]]` en liens `data-doc` (navigate) / `data-stub` (create) avant marked — sans le prop, context-free (usages publics intacts) ; `ProjectViewer` résout contre `docTitleMap` du parent + panneau **« Cité par »** (`getBacklinks`). **Accueil « À traiter »** : `InboxCard` (voies À traiter/Récent, `useInbox` singleton) + **`ProposalReview`** (reka Dialog, diff LCS avant/après, `resolveDocChange(request_id)`) + badge sur l'entrée Accueil (special-case `/overview`, NAV intouché). Recherche sémantique = backend (embeddings) ; le front `oto_search`/`searchAll` est inchangé (fusion RRF transparente).

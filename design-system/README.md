# design-system — dashboard

Tokens, guidelines et composants de marque du dashboard.

## 📍 Source de vérité : `oto-studio/brand/`

La charte Otomata — palette, typo, logos, charte formelle — se définit dans **`oto-studio/brand/`** (repo `otomata-tech/oto-studio`). Ce dossier en est un **consommateur** : il applique la charte au dashboard, il ne la définit pas.

- Une évolution de charte se fait **d'abord dans `oto-studio/brand/`**, puis se répercute ici.
- En cas de divergence, `brand/` a raison.
- `oto-studio/brand/` conserve une copie de `tokens/` et des guidelines (sous `theme/dashboard-tokens/` et `charte-doc/`) — c'est cette copie qui fait autorité.

Vérifier la dérive :

```bash
diff -rq design-system/tokens/ /data/oto/oto-studio/brand/theme/dashboard-tokens/
```

## Contenu

| | |
|---|---|
| `tokens/` | colors, fonts, typography, spacing |
| `guidelines/` | cartes HTML du design-system (brand-logo, iconographie, couleur, type, spacing) |
| `components/brand/` | composants de marque (`OtoMark`, `Medallion`, `Avatar`) |
| `assets/` | logos et marks |
| `DESIGN-BRIEF.md`, `handoff-alexis.md` | brief et notes de passation |
| `marques-*.html`, `directions-artistiques.html` | explorations d'identité (historique) |

// Verdict d'un tenant — « le verdict d'abord, en langage clair » (même principe que
// `connectorVerdict.ts`). UNE dérivation pure : ce que dit la base × ce que sert le
// process → un libellé de liste, une couleur, et la phrase qui explique pourquoi.
//
// Extrait de la vue parce que c'est ce que l'opérateur LIT pour décider s'il doit
// agir : une erreur ici ne casse aucun rendu, elle fait dire au tableau qu'un
// partenaire est servi alors que ses jetons sont rejetés. C'est donc testé.
//
// Sémantique couleur STRICTE (DESIGN.md, un axe = une couleur) :
//   terra = ça ne marche pas · saffron = incomplet, à provisionner ·
//   ink = c'est nous (le tenant de la plateforme) · olive = servi.
import type { TenantRow } from '@/types/api'

export type TenantTone = 'olive' | 'saffron' | 'terra' | 'ink'

export interface TenantVerdict {
  tone: TenantTone
  label: string     // colonne « état » de la liste — court
  why: string       // la phrase du panneau : pourquoi ce verdict, et ce qu'il implique
}

export function tenantVerdict(t: Pick<TenantRow, 'primary' | 'authenticates' | 'pending_restart'>): TenantVerdict {
  // L'ordre compte : « déclaré mais pas chargé » prime sur tout le reste — c'est le
  // seul état où l'écran affirmerait « servi » alors que rien ne passe.
  if (t.pending_restart) {
    return {
      tone: 'terra',
      label: 'redémarrage requis',
      why: "l'émetteur est déclaré en base mais absent du registre du serveur (bâti au démarrage) : les jetons de ce tenant sont encore rejetés.",
    }
  }
  if (!t.authenticates) {
    return {
      tone: 'saffron',
      label: 'sans émetteur',
      why: "aucun émetteur déclaré : ce tenant ne peut authentifier personne. le provisionnement (instance d'annuaire dédiée) reste à faire.",
    }
  }
  if (t.primary) {
    return {
      tone: 'ink',
      label: 'plateforme',
      why: "le tenant d'oto : son émetteur vient de la configuration du serveur, pas de la base — ses comptes gardent un identifiant nu.",
    }
  }
  return {
    tone: 'olive',
    label: 'servi',
    why: 'émetteur déclaré et chargé par le serveur : les jetons de ce tenant sont acceptés.',
  }
}

// Ce qui demande une action humaine : un tenant qui ne sert pas ce qu'il promet, ou
// un écart de rattachement (deux sources qui ne disent pas la même chose). Un tenant
// « sans émetteur » n'y est PAS : il n'a rien promis, il attend son provisionnement.
export function needsAttention(t: TenantRow): boolean {
  return t.pending_restart || t.orgs_desalignees > 0
}

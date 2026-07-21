// Verdict d'un connecteur — « le verdict d'abord, en langage clair » (CDC lot 2,
// principes 1-2 ; vocabulaire §2 imposé, français partout). UNE dérivation pure
// (état d'installation × résolution de clé × option) → une phrase de liste + une
// phrase de panneau + un CTA dérivé. Source de vérité de la COPY = le CDC de JB
// (`lot2-cdc-claude-design-connecteurs.md`) — ne pas paraphraser les libellés.
//
// Sémantique couleur STRICTE (§2) : olive = OK/résolu · saffron = action requise ·
// faint = neutre/absent · terra = erreur RÉELLE seulement (jamais « pas configuré »).
import type { DotTone } from './consoleTypes'
import type { MyConnector, ProviderStatus } from '@/types/api'

export interface ConnectorVerdict {
  dot: DotTone
  hollow: boolean          // ○ (non installé) vs ● (le reste)
  list: string             // phrase courte, colonne « État » de la liste (M1)
  phrase: string           // phrase primaire du panneau (verdict, principe 1)
  cta: string | null       // CTA unique dérivé (principe 2) — null si tout est vert
  hint: boolean            // « demande à un admin » (réservé/option — pas d'endpoint)
  keyCount: number         // nb de clés qui coexistent (suffixe (+N) si ≥2)
}

// Nb de niveaux qui portent réellement une clé — pour le suffixe (+N) et la décision
// « déplier la pile » (KeyStack). On ne compte que ce qui existe pour la personne.
export function keyLevelCount(ps?: ProviderStatus): number {
  if (!ps) return 0
  return (
    (ps.user_key_configured ? 1 : 0) +
    (ps.group_secret_configured ? 1 : 0) +
    (ps.org_secret_configured ? 1 : 0) +
    (ps.platform_key_label ? 1 : 0)
  )
}

// Libellé de la source effective (principe 8 — noms contextuels). En liste on reste
// court ; la pédagogie des niveaux est réservée à la pile dépliée. En SOLO (org perso,
// principe 9) on ne prononce jamais « org »/« équipe » : tout est « ta clé ».
function sourceLabel(r: MyConnector, ps: ProviderStatus, isPersonal: boolean): string {
  switch (ps.mode) {
    case 'user':
      // hosted/oauth : la clé résout via un compte lié — dire « compte lié ».
      return r.auth.method === 'hosted' || r.auth.method === 'oauth'
        ? 'compte lié'
        : 'ta clé'
    case 'group': return isPersonal ? 'ta clé' : 'clé d’équipe'
    case 'org': return isPersonal ? 'ta clé' : 'clé d’org'
    case 'platform': return 'clé oto'
    default: return 'ta clé'
  }
}

export function connectorVerdict(
  r: MyConnector, ps?: ProviderStatus, opts: { isPersonal?: boolean } = {},
): ConnectorVerdict {
  const isPersonal = !!opts.isPersonal
  const keyCount = keyLevelCount(ps)
  const base = { hollow: false, cta: null as string | null, hint: false, keyCount }

  // 1. État d'installation d'abord (le verdict encode l'exposition — principe 1).
  if (r.state === 'not_selected') {
    // Non installé : ○ neutre. Le CTA du panneau = installer (« Activer » si une
    // clé existe déjà / résout, sinon « Connecter »).
    const resolves = r.auth.method === 'none' || (!!ps && ps.mode !== 'forbidden')
    return {
      ...base, dot: 'faint', hollow: true,
      list: 'Non installé', phrase: 'Non installé.',
      cta: resolves ? 'Activer' : `Connecter ${r.label}`,
    }
  }
  if (r.state === 'paused') {
    return {
      ...base, dot: 'saffron',
      list: 'En veille', phrase: 'En veille — outils masqués de tes agents.',
      cta: 'Activer',
    }
  }

  // 2. Connecteur actif → verdict de résolution.
  // Open data : jamais de clé, toujours prêt.
  if (r.auth.method === 'none') {
    return { ...base, dot: 'olive', list: 'Actif · open data', phrase: 'Prêt à l’emploi.' }
  }

  const m = ps?.mode

  // Option payante manquante (couche 3) : distincte de la réserve RBAC.
  if (r.paid_option && r.option_ok === false) {
    const opt = r.paid_option
    return {
      ...base, dot: 'saffron', hint: true,
      list: `Option ${opt} requise`,
      phrase: `Option ${opt} requise — demande à un admin.`,
    }
  }

  // Réservé (RBAC connecteur, ADR 0025) OU pas de clé résolue.
  if (!m || m === 'forbidden') {
    if (m === 'forbidden') {
      // Une clé d'équipe existe mais l'équipe n'est pas active → pas « réservé ».
      if (ps?.team_key_group) {
        return {
          ...base, dot: 'saffron', hint: false,
          list: `Clé d’équipe ${ps.team_key_group.name}`,
          phrase: `Une clé existe dans l’équipe ${ps.team_key_group.name} — active cette équipe pour l’utiliser.`,
        }
      }
      return {
        ...base, dot: 'saffron', hint: true,
        list: 'Réservé',
        phrase: 'Réservé à certaines équipes — demande à un admin.',
      }
    }
    // Pas de clé du tout.
    return {
      ...base, dot: 'saffron',
      list: 'À connecter', phrase: 'À connecter — branche une clé.',
      cta: `Connecter ${r.label}`,
    }
  }

  // Quota du jour épuisé sur la clé plateforme.
  if (m === 'over_quota') {
    return {
      ...base, dot: 'saffron',
      list: 'Quota atteint',
      phrase: 'Quota du jour atteint — pose ta clé pour le lever.',
      cta: 'Pose ta clé',
    }
  }

  // Connexion KO (seam générique backend `health_ko`, posé par la sonde verify) : la
  // clé résout mais la dernière vérification a ÉCHOUÉ (session expirée, token révoqué…)
  // → erreur RÉELLE = terra (§2). Reste jusqu'à ce qu'un test/reconnexion la rétablisse.
  if (ps?.health_ko) {
    return {
      ...base, dot: 'terra',
      list: 'Connexion KO',
      phrase: ps.health_reason ? `Connexion KO — ${ps.health_reason}` : 'Connexion KO — reconnecte ou vérifie la clé.',
      cta: 'Reconnecter',
    }
  }

  // Étape manquante (seam générique backend `pending_action`, lot 2) : la clé
  // résout mais le connecteur n'est pas opérationnel — le libellé backend EST le
  // verdict et le CTA (unipile : « Connecte un canal »). Aucun cas par connecteur ici.
  if (ps?.pending_action) {
    return {
      ...base, dot: 'saffron',
      list: ps.pending_action, phrase: `${ps.pending_action}.`,
      cta: ps.pending_action,
    }
  }

  // 3. Résolu (user/group/org/platform) → prêt. Suffixe (+N) seulement si ≥2 clés.
  const src = sourceLabel(r, ps!, isPersonal)
  const extra = keyCount >= 2 ? ` (+${keyCount - 1})` : ''
  return {
    ...base, dot: 'olive',
    list: `Actif · ${src}${extra}`,
    phrase: 'Prêt à l’emploi.',
  }
}

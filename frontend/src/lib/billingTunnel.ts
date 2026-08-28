// Le tunnel de souscription, côté lecture : ce que le serveur refuse, ce qu'il
// faudra afficher, et le montant à annoncer avant d'envoyer quelqu'un payer.
//
// ⚠️ **MIROIR DU SERVEUR**, au même titre que `keyStack.ts` : `vatAmount()` refait
// le calcul de `billing_vat.vat_amount` (oto-backend) parce qu'aucune surface ne
// rend le TTC d'un palier AVANT la souscription — l'identité sert le taux et le
// régime, le catalogue sert le HT, et c'est ici qu'ils se rencontrent. Une erreur
// n'y casse rien à l'écran : **elle fait annoncer au payeur un montant autre que
// celui qui sera débité**, ce qui se découvre sur la page du PSP. D'où le test.
// Le jour où le backend sert un TTC par palier, ce calcul disparaît.
//
// Le reste du module est de la LECTURE de contrat : normaliser les deux formes sous
// lesquelles arrivent les mêmes manques — le refus 409 de `subscribe`
// (`details.blockers`) et la lecture à froid (`GET /api/me/billing/identity` +
// `GET /api/me/legal`) — pour que l'écran n'ait qu'une forme à peindre.
import { ApiError } from '@/api'
import type { LegalStatus, VatBlocked, VatScheme } from '@/types/api'

// ── le montant ───────────────────────────────────────────────────────────────

/** La TVA en centimes, arrondie au centime supérieur à la moitié — l'arrondi du
 *  serveur (`ROUND_HALF_UP`). Les entrées sont des entiers de centimes et de points
 *  de base : le produit reste exact bien en deçà de 2^53, et `Math.round` arrondit
 *  la moitié vers le haut sur un positif. */
export function vatAmount(amountHt: number, rateBps: number): number {
  return Math.round((amountHt * rateBps) / 10000)
}

export interface PriceParts {
  /** Prix du palier, en centimes hors taxes. */
  ht: number
  /** TVA en centimes — 0 en autoliquidation comme à l'export. */
  vat: number
  /** Ce qui sera réellement débité, en centimes. */
  ttc: number
}

/** La décomposition à annoncer, ou `null` quand elle ne peut pas être calculée :
 *  palier sur devis (`amountHt` absent) ou régime pas encore tranché (`rateBps`
 *  absent, `vat_blocked` dit alors pourquoi). Ne devine JAMAIS un taux : annoncer
 *  un TTC au jugé serait pire que de n'en annoncer aucun. */
export function priceParts(
  amountHt: number | null | undefined,
  rateBps: number | null | undefined,
): PriceParts | null {
  if (amountHt == null || rateBps == null) return null
  const vat = vatAmount(amountHt, rateBps)
  return { ht: amountHt, vat, ttc: amountHt + vat }
}

// ── les préalables, sous leurs deux formes ───────────────────────────────────

/** Un document à accepter, tel qu'il doit être PRÉSENTÉ : son libellé, sa version
 *  courante et son adresse viennent tous du serveur (un tenant tiers a ses propres
 *  documents, et une version bouge entre deux déploiements). */
export interface TunnelDoc {
  slug: string
  label: string
  version: string
  url: string
  /** Non nul = déjà accepté, mais dans une version antérieure. Le dire évite
   *  d'envoyer quelqu'un chercher une case qu'il a bien cochée, sur la version
   *  d'avant. */
  accepted_version: string | null
}

export interface TunnelBlockers {
  /** Identité de facturation incomplète, ou pays fermé à la souscription en ligne. */
  identity: { code: VatBlocked; message: string } | null
  /** Documents du contexte `purchase` restant à accepter. */
  legal: { message: string; documents: TunnelDoc[] } | null
}

const EMPTY: TunnelBlockers = { identity: null, legal: null }

const IDENTITY_CODES: readonly string[] = ['billing_identity_required', 'vat_consumer_unsupported']

/** Les préalables non satisfaits que porte un refus de `subscribe`, ou `null` si ce
 *  refus n'en est pas un (`already_subscribed`, `payment_pending`, panne PSP…).
 *
 *  ⚠️ On lit `details.blockers`, **jamais le code de tête seul** : celui-ci ne nomme
 *  que le PREMIER manque dans l'ordre du tunnel, donc un écran qui s'y fie fait
 *  remplir un formulaire pour opposer une case à cocher au clic suivant. Le code de
 *  tête ne sert que de repli, pour un serveur qui ne rendrait pas encore `details`. */
export function blockersOf(e: unknown): TunnelBlockers | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null
  const raw = e.details?.blockers
  const found = Array.isArray(raw)
    ? raw.reduce<TunnelBlockers>((acc, b) => merge(acc, b as Record<string, unknown>), EMPTY)
    // Repli : un seul manque, nommé par le code de tête et décrit par `detail`.
    : merge(EMPTY, { code: e.code, message: e.detail ?? '' })
  return found.identity || found.legal ? found : null
}

function merge(acc: TunnelBlockers, b: Record<string, unknown>): TunnelBlockers {
  const code = typeof b.code === 'string' ? b.code : ''
  const message = typeof b.message === 'string' ? b.message : ''
  if (IDENTITY_CODES.includes(code)) {
    return { ...acc, identity: { code: code as VatBlocked, message } }
  }
  if (code === 'legal_required') {
    return { ...acc, legal: { message, documents: toDocs(b.documents) } }
  }
  return acc
}

function toDocs(raw: unknown): TunnelDoc[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((d) => {
    const o = d as Record<string, unknown>
    if (typeof o.slug !== 'string' || typeof o.url !== 'string') return []
    return [{
      slug: o.slug,
      label: typeof o.label === 'string' ? o.label : o.slug,
      version: typeof o.version === 'string' ? o.version : '',
      url: o.url,
      accepted_version: typeof o.accepted_version === 'string' ? o.accepted_version : null,
    }]
  })
}

/** Les mêmes documents, lus à FROID sur `GET /api/me/legal` — la source pour peindre
 *  l'écran avant d'avoir tenté quoi que ce soit. Le 409 ne sert qu'au cas « on a
 *  essayé et il manquait quelque chose ». */
export function docsToAccept(status: LegalStatus | null, context: string): TunnelDoc[] {
  const outstanding = new Set(status?.contexts?.[context]?.outstanding ?? [])
  return (status?.documents ?? [])
    .filter((d) => outstanding.has(d.slug))
    .map((d) => ({
      slug: d.slug,
      label: d.label,
      version: d.version,
      url: d.url,
      accepted_version: d.accepted_version ?? null,
    }))
}

// ── libellés ─────────────────────────────────────────────────────────────────

/** Les cinq champs requis, dans l'ordre du formulaire — le même ordre que celui
 *  dans lequel le serveur nomme les manquants (`missing`). */
export const IDENTITY_FIELD_LABEL: Record<string, string> = {
  legal_name: 'Raison sociale',
  country_code: 'Pays',
  address_line: 'Adresse',
  postal_code: 'Code postal',
  city: 'Ville',
}

/** Le régime servi par l'API, dit au payeur. Le front ne le calcule pas. */
export const VAT_SCHEME_LABEL: Record<VatScheme, string> = {
  fr_ttc: 'TVA française',
  reverse_charge: 'Autoliquidation',
  export: 'Hors champ de la TVA française',
}

export const VAT_SCHEME_NOTE: Record<VatScheme, string> = {
  fr_ttc: 'La TVA française de 20 % est ajoutée au prix du palier.',
  reverse_charge: 'TVA due par le preneur — article 196 de la directive 2006/112/CE.',
  export: 'Prestation de services fournie hors de l\'Union européenne — article 259-1 du CGI.',
}

/** Pourquoi il n'y a pas de montant à annoncer. `vat_consumer_unsupported` ferme la
 *  souscription en ligne : le guichet OSS n'est pas en place, encaisser une TVA
 *  qu'on ne sait pas reverser serait pire qu'un client perdu. */
export const VAT_BLOCKED_MESSAGE: Record<VatBlocked, string> = {
  billing_identity_required:
    'Renseignez l\'identité de facturation pour connaître le montant à régler.',
  vat_consumer_unsupported:
    'La souscription en ligne n\'est pas ouverte à ce pays sans numéro de TVA '
    + 'intracommunautaire. Renseignez votre numéro, ou écrivez-nous.',
}

// ── la course au moyen de paiement ───────────────────────────────────────────

/** La fenêtre pendant laquelle un moyen de paiement encore en validation est une
 *  ATTENTE et non un incident — `billing.PENDING_WINDOW` côté serveur. Passée cette
 *  durée, l'écran cesse de sonder et renvoie vers nous. */
export const PENDING_WINDOW_MS = 30 * 60 * 1000

/** Cadence de re-sonde quand le serveur n'en conseille pas (branche `pending` : le
 *  payeur est peut-être encore sur la page du PSP). */
export const DEFAULT_RETRY_S = 5

/** Le délai avant la prochaine sonde, borné : un `retry_after` absent ou aberrant ne
 *  doit ni marteler le serveur ni figer l'écran une minute. */
export function nextProbeDelayMs(retryAfter: number | null | undefined): number {
  const s = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_S
  return Math.min(Math.max(s, 2), 60) * 1000
}

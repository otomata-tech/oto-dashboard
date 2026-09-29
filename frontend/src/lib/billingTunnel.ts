// Le tunnel de souscription, côté lecture : ce que le commerce refuse, ce qu'il
// faudra afficher, et le montant à annoncer avant d'envoyer quelqu'un payer.
//
// ⚠️ **MIROIR DU SERVEUR**, au même titre que `keyStack.ts` : `taxPreview()` refait la
// règle de `tva.scheme_for` / `tva.tax_preview` (oto-commerce) et `vatAmount()` son
// calcul, parce qu'aucune surface ne rend le TTC d'un nombre de places AVANT la
// souscription — l'identité ne sert que la fiche et ses manques, le tarif sert le HT
// d'une place, et c'est ici qu'ils se rencontrent. Une erreur n'y casse rien à l'écran :
// **elle fait annoncer au payeur un montant autre que celui qui sera débité**, ce qui se
// découvre sur la page du PSP. D'où le test. Après souscription, les montants viennent
// de `GET /abonnement`, jamais d'ici.
//
// Le reste du module est de la LECTURE de contrat : les documents d'achat de
// `GET /api/cgv`, les refus de `POST /abonnement` qui nomment un préalable, et le
// journal des paiements qui dit si un encaissement est en vol.
import { ApiError } from '@/api'
import { EU_COUNTRIES, HOME_COUNTRY } from '@/lib/countries'
import { i18n } from '@/lib/i18n'
import type {
  CommerceCgv, CommerceContrat, CommerceIdentiteVue, CommercePaiement, VatBlocked, VatScheme,
} from '@/types/api.commerce'

// ── le montant ───────────────────────────────────────────────────────────────

/** La TVA en centimes, arrondie au centime supérieur à la moitié — l'arrondi du
 *  serveur (`ROUND_HALF_UP`). Les entrées sont des entiers de centimes et de points
 *  de base : le produit reste exact bien en deçà de 2^53, et `Math.round` arrondit
 *  la moitié vers le haut sur un positif. */
export function vatAmount(amountHt: number, rateBps: number): number {
  return Math.round((amountHt * rateBps) / 10000)
}

export interface PriceParts {
  /** Prix de l'abonnement, en centimes hors taxes. */
  ht: number
  /** TVA en centimes — 0 en autoliquidation comme à l'export. */
  vat: number
  /** Ce qui sera réellement débité, en centimes. */
  ttc: number
}

/** La décomposition à annoncer, ou `null` quand elle ne peut pas être calculée :
 *  montant absent, ou régime pas encore tranché (`rateBps` absent, `blocked` dit
 *  alors pourquoi). Ne devine JAMAIS un taux : annoncer un TTC au jugé serait pire
 *  que de n'en annoncer aucun. */
export function priceParts(
  amountHt: number | null | undefined,
  rateBps: number | null | undefined,
): PriceParts | null {
  if (amountHt == null || rateBps == null) return null
  const vat = vatAmount(amountHt, rateBps)
  return { ht: amountHt, vat, ttc: amountHt + vat }
}

export interface TaxPreview {
  scheme: VatScheme | null
  rateBps: number | null
  /** Le refus qui s'appliquerait à la souscription ; `null` quand elle est ouverte. */
  blocked: VatBlocked | null
}

/** Le régime et le taux qu'ouvre une identité — la règle de `tva.scheme_for`, précédée
 *  du contrôle des champs requis de `tva.tax_for_identity` :
 *
 *    France                              `fr_ttc`          20 %
 *    Union hors France, n° de TVA        `reverse_charge`   0 %
 *    Union hors France, SANS n° de TVA   refusé (`vat_consumer_unsupported`)
 *    hors Union                          `export`           0 % */
export function taxPreview(vue: CommerceIdentiteVue | null): TaxPreview {
  const i = vue?.identite
  if (!i || (vue?.manquants.length ?? 0) > 0) {
    return { scheme: null, rateBps: null, blocked: 'billing_identity_required' }
  }
  if (i.country_code === HOME_COUNTRY) return { scheme: 'fr_ttc', rateBps: 2000, blocked: null }
  if (EU_COUNTRIES.has(i.country_code)) {
    return i.vat_number
      ? { scheme: 'reverse_charge', rateBps: 0, blocked: null }
      : { scheme: null, rateBps: null, blocked: 'vat_consumer_unsupported' }
  }
  return { scheme: 'export', rateBps: 0, blocked: null }
}

// ── les documents d'achat ────────────────────────────────────────────────────

/** Un document à accepter, tel qu'il doit être PRÉSENTÉ : son libellé, sa version en
 *  vigueur et son adresse viennent tous du commerce (une version bouge entre deux
 *  déploiements). */
export interface TunnelDoc {
  slug: string
  label: string
  version: string
  url: string
}

/** Les documents de `GET /api/cgv`, dans l'ordre servi. */
export function cgvDocs(cgv: CommerceCgv | null): TunnelDoc[] {
  return Object.entries(cgv?.documents ?? {}).map(([slug, d]) => ({
    slug, label: d.label || slug, version: d.version, url: d.url,
  }))
}

/** Ce que `POST /abonnement` attend : la version acceptée de chaque document. */
export function acceptationsOf(docs: TunnelDoc[]): Record<string, string> {
  return Object.fromEntries(docs.map((d) => [d.slug, d.version]))
}

// ── les préalables qu'un refus nomme ─────────────────────────────────────────

export interface TunnelBlockers {
  /** Identité de facturation incomplète, ou pays fermé à la souscription en ligne. */
  identity: { code: VatBlocked; message: string } | null
  /** Les documents d'achat ont changé de version entre l'affichage et le clic. */
  legal: { message: string } | null
}

const IDENTITY_CODES: readonly string[] = ['billing_identity_required', 'vat_consumer_unsupported']

/** Le préalable non satisfait que porte un refus de `POST /abonnement`, ou `null` si ce
 *  refus n'en est pas un (`subscription_alive`, `payment_pending`, `invalid_places`…). Le
 *  commerce nomme UN manque par refus : l'écran se peint à froid (fiche + documents)
 *  pour ne pas avoir besoin d'un refus pour savoir quoi demander. */
export function blockersOf(e: unknown): TunnelBlockers | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null
  const message = e.detail ?? ''
  if (IDENTITY_CODES.includes(e.code)) {
    return { identity: { code: e.code as VatBlocked, message }, legal: null }
  }
  if (e.code === 'purchase_documents_required') return { identity: null, legal: { message } }
  return null
}

// ── libellés ─────────────────────────────────────────────────────────────────

/** Les cinq champs requis, dans l'ordre du formulaire — le même ordre que celui
 *  dans lequel le serveur nomme les manquants (`manquants`). */
export const IDENTITY_FIELD_LABEL: Record<string, string> = {
  legal_name: 'Raison sociale',
  country_code: 'Pays',
  address_line: 'Adresse',
  postal_code: 'Code postal',
  city: 'Ville',
}

/** Le régime servi par l'API, dit au payeur. */
export const VAT_SCHEME_LABEL: Record<VatScheme, string> = {
  fr_ttc: 'TVA française',
  reverse_charge: 'Autoliquidation',
  export: 'Hors champ de la TVA française',
}

export const VAT_SCHEME_NOTE: Record<VatScheme, string> = {
  fr_ttc: 'La TVA française de 20 % est ajoutée au prix de l\'abonnement.',
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

// ── ce que l'org a déjà ──────────────────────────────────────────────────────

/** Une échéance qui court encore : `null` = sans terme, sinon à venir. La règle est
 *  celle du commerce pour un essai, un don et un contrat (`contrat_en_cours`). */
export function enCours(fin: string | null, maintenant = Date.now()): boolean {
  return fin == null || Date.parse(fin) > maintenant
}

/** Un contrat qui court : il couvre l'org, et `POST /abonnement` le refuse
 *  (`409 under_contract`). Clos, il ne couvre plus rien et ne masque plus l'offre. */
export function contratEnCours(c: CommerceContrat | null, maintenant = Date.now()): boolean {
  return !!c && enCours(c.fin, maintenant)
}

/** Le nom d'un droit du catalogue du cœur (don ou contrat), traduit. Un droit que
 *  l'écran ne connaît pas se montre sous son code plutôt que de disparaître. */
export function droitLabel(droit: string): string {
  const key = `billingUi.granted.rights.${droit}`
  return i18n.global.te(key) ? i18n.global.t(key) : droit
}

// ── l'encaissement en vol ────────────────────────────────────────────────────

/** Les statuts Mollie d'un paiement qui n'est pas conclu : le payeur est peut-être
 *  encore sur la page du prestataire, ou l'encaissement s'achève. */
const EN_VOL = ['open', 'pending', 'authorized']
const ECHEC = ['failed', 'canceled', 'expired']

/** Où en est le dernier paiement d'une `nature` donnée (`initial` : la souscription ;
 *  `method_change` : un nouveau moyen de paiement), d'après le journal — que le commerce
 *  sert du plus récent au plus ancien : `en_vol` (pas encore conclu), `paye`, `echec`, ou
 *  `null` s'il n'y en a pas. */
export function dernierPaiement(
  paiements: CommercePaiement[], nature: string,
): 'en_vol' | 'paye' | 'echec' | null {
  const p = paiements.find((x) => x.nature === nature)
  if (!p) return null
  if (EN_VOL.includes(p.statut)) return 'en_vol'
  if (ECHEC.includes(p.statut)) return 'echec'
  return p.statut === 'paid' ? 'paye' : 'en_vol'
}

/** La fenêtre pendant laquelle un abonnement `incomplete` est une ATTENTE et non un
 *  incident. Passée cette durée, l'écran cesse de relire et rend la main. */
export const PENDING_WINDOW_MS = 30 * 60 * 1000

/** Cadence de relecture quand rien n'en conseille une autre. */
export const DEFAULT_RETRY_S = 5

/** Le délai avant la prochaine relecture, borné : une valeur absente ou aberrante ne
 *  doit ni marteler le serveur ni figer l'écran une minute. */
export function nextProbeDelayMs(retryAfter: number | null | undefined): number {
  const s = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_S
  return Math.min(Math.max(s, 2), 60) * 1000
}

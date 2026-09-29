// Le contrat de l'API utilisateur d'OTO-COMMERCE (`https://commerce.oto.cx/api`).
//
// ⚠️ Provenance : `oto-commerce/docs/api-utilisateur.md` (contrat arbitré) et
// `oto-commerce/oto_commerce/api.py`, qui le sert et FAIT FOI pour les noms de champs.
// Le commerce ne publie pas de document OpenAPI : ces types sont écrits à la main, et
// c'est le seul endroit du front qui le fait pour ce service. Un champ qui bouge côté
// commerce se corrige ICI, dans le même lot que l'écran qui le lit.
//
// Conventions du service : montants en CENTIMES entiers, dates en ISO 8601 avec fuseau,
// noms de champs en français (sauf l'identité, reprise telle quelle du cœur). Refus dans
// l'enveloppe `{error, detail}` du cœur, donc lus par la même `ApiError`.

/** Le régime de TVA qu'une identité de facturation ouvre. */
export type VatScheme = 'fr_ttc' | 'reverse_charge' | 'export'
/** Pourquoi aucun montant TTC n'est calculable (l'identité manque, ou n'ouvre pas la
 *  souscription en ligne). */
export type VatBlocked = 'billing_identity_required' | 'vat_consumer_unsupported'

// ── sans jeton ──────────────────────────────────────────────────────────────

/** `GET /api/tarif` : le prix d'une place (un membre payant), par mois. */
export interface CommerceTarif {
  prix_ht_par_place: number
  devise: string
  intervalle: string
}

/** Un document d'achat, tel que `GET /api/cgv` le sert. */
export interface CommerceDocument {
  version: string
  label: string
  url: string
}
/** `GET /api/cgv` : les documents à accepter DANS la souscription, par slug (`cgv`,
 *  `dpa`). L'acceptation part avec `POST /abonnement` (`acceptations: {slug: version}`). */
export interface CommerceCgv {
  documents: Record<string, CommerceDocument>
}

// ── tout membre ─────────────────────────────────────────────────────────────

/** `GET /orgs/{id}/moi` : ce qu'un membre voit de lui-même. */
export interface CommerceMoi {
  payant: boolean
  jusqu_au: string | null
}

// ── l'administrateur de l'org ───────────────────────────────────────────────

export interface CommerceEssai {
  fin: string
}
export interface CommerceDon {
  /** Un droit du catalogue du cœur : `unipile`, `platform_unmetered`, `unipile_seats`,
   *  `members_max`. */
  droit: string
  /** `null` = sans échéance. */
  fin: string | null
}
/** `GET /orgs/{id}/avantages` : ce que l'org a sans payer, même sans abonnement. */
export interface CommerceAvantages {
  essai: CommerceEssai | null
  dons: CommerceDon[]
}

/** `GET /orgs/{id}/contrat` : un abonnement réglé HORS PLATEFORME (bon de commande,
 *  virement), posé à la main par l'admin plateforme ; `404 no_contract` s'il n'y en a pas.
 *  Clos, il se lit encore : sa `fin` est passée. En cours = `fin` nulle ou à venir
 *  (`contratEnCours`), et tant qu'il court, `POST /abonnement` refuse `409 under_contract`. */
export interface CommerceContrat {
  /** Posé en `members_max` ; `null` = aucun nombre de licences au contrat. */
  licences: number | null
  /** Les droits de portée org qu'il ouvre (catalogue du cœur, comme `CommerceDon.droit`). */
  droits: string[]
  /** `null` pour un contrat repris sans date de début. */
  debut: string | null
  /** `null` = reconduction tacite, sans échéance. */
  fin: string | null
  reference: string | null
}

export type CommerceStatut = 'incomplete' | 'active' | 'past_due' | 'canceled'

/** `GET /orgs/{id}/abonnement` ; `404 no_subscription` quand il n'y en a pas. */
export interface CommerceAbonnement {
  /** `forfait` : un abonné gardé à son prix d'avant — il n'a pas de places. */
  tarif: 'par_membre' | 'forfait'
  places: number
  /** Une baisse en attente, qui prend effet à l'échéance. */
  places_a_l_echeance: number | null
  /** Les `sub` des membres payants, par ancienneté. */
  payants: string[]
  montant_ht: number
  tva_bps: number | null
  tva: number | null
  montant_ttc: number | null
  regime_tva: VatScheme | null
  /** Le refus qui s'appliquerait à la prochaine échéance, quand l'identité manque ou
   *  n'ouvre pas la souscription. */
  tva_bloquee: VatBlocked | null
  statut: CommerceStatut
  periode_fin: string | null
  echeance: string | null
  grace_fin: string | null
  resilie_le: string | null
  droits_jusqu_au: string | null
  essai: CommerceEssai | null
}

export interface CommerceSouscription {
  places: number
  methode?: 'card' | 'sepa'
  /** La version acceptée de chaque document d'achat, par slug. */
  acceptations: Record<string, string>
}
export interface CommerceCheckout {
  checkout_url: string
}
export interface CommerceOk {
  ok: boolean
}

/** Une ligne du journal (`GET /orgs/{id}/paiements`, du plus récent au plus ancien).
 *  `nature` : `initial`, `renewal`, `method_change` ; `statut` : le statut Mollie (`open`,
 *  `pending`, `authorized`, `paid`, `failed`, `canceled`, `expired`). Les montants d'une
 *  ligne reprise du cœur peuvent être nuls. */
export interface CommercePaiement {
  id: number
  created_at: string
  nature: string
  statut: string
  places: number
  montant_ht: number | null
  tva_bps: number | null
  tva: number | null
  montant_ttc: number | null
  regime_tva: string | null
  periode_fin: string | null
}

/** L'identité de facturation. `email` est exigé (et nommé dans `manquants`). */
export interface CommerceIdentite {
  legal_name: string
  country_code: string
  vat_number: string | null
  address_line: string | null
  postal_code: string | null
  city: string | null
  email: string | null
  /** Posé par l'admin plateforme seul (l'identifiant client du logiciel comptable). */
  compta_client_id?: string | null
}
/** `GET|PUT /orgs/{id}/identite` : la fiche, et les champs requis qui manquent. */
export interface CommerceIdentiteVue {
  identite: CommerceIdentite | null
  manquants: string[]
}
export interface CommerceIdentiteSaisie {
  legal_name: string
  country_code: string
  vat_number: string | null
  address_line: string
  postal_code: string
  city: string
  email: string
}

/** Une facture ou un avoir (`GET /orgs/{id}/factures`). `pdf` dit qu'un fichier existe :
 *  c'est lui, et lui seul, qui arme le téléchargement. */
export interface CommerceFacture {
  id: number
  nature: 'invoice' | 'credit_note' | string
  statut: string
  numero: string | null
  montant_ht: number | null
  tva_bps: number | null
  tva: number | null
  montant_ttc: number | null
  regime_tva: string | null
  periode_debut: string | null
  periode_fin: string | null
  emise_le: string | null
  pdf_nom: string | null
  pdf: boolean
}

// ── l'administration plateforme (`/api/admin/orgs/{id}`) ─────────────────────

/** La ligne d'abonnement BRUTE (la table du commerce), telle que l'admin la lit. */
export interface CommerceAbonnementBrut {
  places: number
  statut: CommerceStatut
  tarif: 'par_membre' | 'forfait'
  forfait_ht: number | null
  places_suivantes: number | null
  periode_fin: string | null
  echeance: string | null
  grace_fin: string | null
  resilie_le: string | null
}
/** Le contrat tel que l'admin plateforme le lit : celui de l'org, et qui l'a posé. */
export interface CommerceContratAdmin extends CommerceContrat {
  pose_par: string | null
}
export interface CommerceDonAdmin {
  droit: string
  source: string
  fin: string | null
  pose_par: string | null
}
/** `GET /api/admin/orgs/{id}/commerce` : tout ce que le commerce tient sur une org. */
export interface CommerceEtatAdmin {
  abonnement: CommerceAbonnementBrut | null
  contrat: CommerceContratAdmin | null
  dons: CommerceDonAdmin[]
  identite: CommerceIdentite | null
  factures: CommerceFacture[]
  /** Faux = la facturation est encore au cœur : tout geste rend `409 before_switch`. */
  bascule_faite: boolean
}
export interface CommerceContratSaisie {
  licences: number
  droits: string[]
  fin?: string | null
  reference?: string | null
}
export type CommerceIdentiteAdminSaisie = CommerceIdentiteSaisie & { compta_client_id: string | null }

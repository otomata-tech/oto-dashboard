// Contrats REST d'oto-backend consommés par le dashboard.
//
// ── D'OÙ VIENNENT CES TYPES ─────────────────────────────────────────────────────
// Ils ne se recopient plus à la main. Ils se DÉRIVENT du document OpenAPI que
// oto-backend produit depuis son registre de capacités — snapshot dans
// `openapi/oto-openapi.json`, types dans `api.generated.ts` (`npm run api:gen`).
// Un type d'écran est ici un ALIAS nommé vers un schéma généré : le nom reste
// lisible à l'appel, la FORME vient du serveur. Deux formes d'alias :
//
//   components['schemas']['X'] — schéma nommé du document (partagé par plusieurs
//                                opérations) ;
//   ApiOut<'operation_id'>     — réponse 200 d'une opération, quand le backend
//                                décrit la forme sans lui donner de nom global.
//
// Reste écrit à la main UNIQUEMENT ce que le document ne décrit pas — chaque bloc
// concerné porte la raison. Les trois raisons, aujourd'hui :
//   · `/api/admin/*` est HORS du document servi (préfixe admin exclu) — tout l'écran
//     plateforme est donc à la main, et le restera tant que le backend n'expose pas
//     ces opérations ;
//   · la capacité ne déclare pas son `Output` (dette côté backend) ;
//   · le contrat servi est plus LÂCHE que ce que l'écran suppose (champ déclaré
//     optionnel/nullable, ou `str` là où le domaine est un ensemble fermé) : adopter
//     le type généré tel quel dégraderait l'écran au lieu de le corriger.
//
// Pour rapatrier un type dans le généré : corriger l'`Output` côté oto-backend,
// puis `npm run api:refresh` ici.

import type { components, operations } from './api.generated'
// ⚠️ Ce qu'un lot backend OUVERT sert et que l'OpenAPI en ligne ignore encore —
// écrit à la main, à part, pour qu'une régénération ne l'efface pas. Cf. le fichier.
import type { BailDeLaLigne } from './api.attendu'

/** La réponse 200 (application/json) d'une opération du document OpenAPI. */
export type ApiOut<K extends keyof operations> = operations[K]['responses'] extends {
  200: { content: { 'application/json': infer T } }
}
  ? T
  : never

/** Le corps (application/json) attendu par une opération du document OpenAPI. Même
 *  raison qu'`ApiOut` : un formulaire qui POSTe une fiche décrite par le serveur ne
 *  redéclare pas ses champs — il les dérive, et le CI voit la dérive. */
export type ApiIn<K extends keyof operations> = operations[K] extends {
  requestBody: { content: { 'application/json': infer T } }
}
  ? T
  : never

// Paliers de rôle plateforme (3 crans, ADR rôles) :
//   super_admin > admin (opérateur) > member.
// super_admin = tout-puissant (rôles plateforme, platform keys) ; admin = palier
// OPÉRATIONNEL (voit la section « platform · admin » et la majorité des écrans en
// lecture/gestion, mais ne change PAS les rôles plateforme ni les platform keys).
export type Role = 'member' | 'admin' | 'super_admin'
export type OrgRole = 'org_member' | 'org_admin'
export type GroupRole = 'group_member' | 'group_admin'   // chef d'équipe = group_admin

// ── connecteurs (catalogue, registre source unique) ──
// Un champ de saisie d'un credential (modèle générique multi-champs, ADR 0011) —
// le formulaire « configure » se rend en bouclant dessus. `secret` = champ masqué.
export interface CredentialField {
  name: string
  label: string
  secret: boolean
  help?: string              // aide de saisie (ex. « ex. https://eu1.make.com »)
  required?: boolean         // false = facultatif (connecteur « ET/OU » type slack, ≥1 champ au total)
  // Valeurs du champ DISCRIMINANT du connecteur (`AuthDescriptor.field_discriminator`)
  // qui rendent ce champ pertinent. Vide/absent = le champ vaut toujours. Ex. `http` :
  // `header_name` n'a de sens qu'en `auth_mode=header`. Cf. `lib/credentialForm.ts`.
  when?: string[]
  // Jeu FERMÉ de valeurs acceptées → se rend en select, pas en champ libre. Vide =
  // saisie libre. Une valeur hors liste est refusée par le serveur à l'écriture.
  choices?: string[]
}
// Section de doc « how-to » d'un connecteur (user-facing, markdown) — rendue
// partout où le connecteur s'affiche. `kind` = type curé (ordre + icône).
export interface DocSection {
  kind: 'prerequisite' | 'setup' | 'usage' | 'note'
  title: string
  body_md: string
}
// Descripteur d'auth unifié (ADR 0024) — source unique du widget credential de
// la ConnectorCard, quel que soit le mécanisme. `method` pilote le widget rendu ;
// `cardinality=multi_account` = N comptes liés (Google) ; `fields` = schéma de
// saisie (vide hors method='secret', où les flux — oauth/cookie/remote — sont dédiés).
export interface AuthDescriptor {
  method: 'secret' | 'oauth' | 'cookie' | 'remote' | 'hosted' | 'none'
  cardinality: 'single' | 'multi_account'
  // Le MOT que l'utilisateur emploie chez ce fournisseur pour un compte —
  // « workspace » (Slack), « organisation » (Zoho), « site » (navigateur connecté),
  // « compte » par défaut. Servi par le registre : l'écran l'affiche, il ne le
  // devine pas. Optionnel le temps qu'un backend plus ancien soit à jour.
  account_noun?: string
  // Le champ dont la VALEUR sélectionne les autres (`auth_mode` chez `http`). Vide =
  // credential à schéma plat, tous les champs valent toujours — le cas des ~90 autres
  // connecteurs. Optionnel le temps qu'un backend plus ancien soit à jour.
  field_discriminator?: string
  fields: CredentialField[]
}
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (GET /api/connectors) : sa
//    réponse est un `200 OK` nu dans le document.
export interface ConnectorMeta {
  name: string
  label: string
  help: string               // blurb d'une ligne (sous-titre)
  description: string        // description user-facing (2-3 phrases, curée — fallback help)
  doc_sections?: DocSection[]  // doc « how-to » user-facing (prérequis/setup/usage), markdown
  href: string | null
  publisher: string          // éditeur affiché (curé) — catalogue
  logo_url: string | null    // logo éditeur (oto-media), null si absent → placeholder
  availability: 'self_serve' | 'platform_granted'
  auth_modes: string[]
  personal_session: boolean
  secret_kind: 'api_key' | 'basic_auth' | 'fields' | 'cookie' | 'oauth' | 'refresh_token' | 'none'
  auth: AuthDescriptor       // ADR 0024 — descripteur d'auth unifié (dérivé de secret_kind/kind)
  namespaces: string[]
  family: string             // axe builder (dérivé) — api|open-data|browser|google|federated|bridge
  category: string           // axe utilisateur (curé) — Prospection|Data FR|…
  credential_fields: CredentialField[]
  free_tier: { daily_quota: number } | null   // ADR 0031 — clé plateforme offerte (quota gratuit/jour/user)
  identities: boolean        // ADR 0024 — sélecteur d'identité/cible par défaut (pennylaneged : la GED cible)
  connect?: ConnectFlow | null   // le geste de connexion déclaré, ou null (cf. connector_flow)
  verifiable: boolean        // le connecteur a une sonde « tester la connexion » (zoho…) — bouton de test
}

// Retour d'une sonde de credential (POST /api/me/connectors/{provider}/verify).
// `ok:false` porte le message provider actionnable (l'erreur d'auth EST le résultat).
// `pending:true` = credential ENREGISTRÉ mais volontairement incomplet (connexion en
// deux temps : l'app est posée, le consentement se donne sur la fiche). Ce n'est PAS
// une erreur de saisie — le formulaire doit se fermer, pas retenir l'utilisateur.
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`VerifyResult` :
//    error et pending déclarés nullables ; `level` énuméré côté contrat, `str` ici). Le
//    correctif est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface VerifyResult {
  ok: boolean
  provider: string
  error?: string
  pending?: boolean
  elapsed_ms?: number
  // QUELLE instance a répondu. En niveau `auto` la cascade peut retomber d'un cran
  // (perso → équipe → org → plateforme) : un `ok` nu ne dit pas si c'est bien la clé
  // qu'on croyait tester. Optionnels — un backend antérieur ne les renvoie pas.
  level?: string        // user | group | org | platform
  ref?: string          // ex. « org:2:salesforce »
}

// ⚠️ ÉCRIT À LA MAIN — le contrat servi ne PEUT PAS décrire ce corps : il est PLAT et
// ses clés sont les `credential_fields` du connecteur visé, donc variables (base_url,
// auth_mode, header_name, username…). Le document OpenAPI n'en connaît que l'enveloppe.
//
// Les champs rendus sont ceux que le registre déclare révélables ou non secrets — un
// secret ne se relit JAMAIS, à aucun palier. C'est ce qui permet de corriger une URL
// sans détenir la clé (oto-backend#448).
//
// ⚠️ **`read_scope`, pas `scope`.** Le préfixe n'est pas décoratif : le connecteur
// `http` déclare lui-même un champ nommé `scope` (les scopes oauth2), et une clé
// d'enveloppe du même nom l'aurait écrasé en silence.
export interface CredentialState {
  provider: string
  configured: boolean
  read_scope: 'member' | 'group' | 'org'
  read_account: string
  [field: string]: string | boolean | null | undefined
}

// État de sélection marketplace d'un connecteur pour le membre (ADR 0019).
export type ConnectorState = 'not_selected' | 'active' | 'paused'

// Catalogue + état per-membre (GET /api/me/connectors) — source unique du
// marketplace dashboard (library installable + « mes connecteurs »).
export interface MyConnector extends ConnectorMeta {
  state: ConnectorState
  recommended: boolean       // proposé par l'org active (baseline default_connectors)
  doctrine_ref_count?: number  // nb de doctrines de l'org qui le référencent (posture doctrine-only, ADR 0024)
  paid_option?: string | null  // option payante requise (couche 3, ADR 0043/0044) ou null
  option_ok?: boolean          // l'option est-elle accordée pour moi (true si aucune requise)
}

// Modes de connexion d'un connecteur Zoho (self client + server-based).
// `has_app` = un client_id/client_secret est DÉJÀ à disposition, à n'importe quel
// palier de la cascade (le mien, celui de mon équipe, de mon org, de la plateforme).
// Faux ⇒ il faut d'abord poser l'app sur la carte avant de pouvoir consentir.
/** FORME du geste « connecter » d'un connecteur (backend `connector_flow.describe`).
 *  `null` pour les ~56 connecteurs sans flux : leur credential se pose au formulaire.
 *  Ne porte VOLONTAIREMENT aucune URL — le chemin est fixe côté client
 *  (`POST /api/me/connectors/{name}/connect`), le nom voyage en paramètre. */
export interface ConnectFlowParam {
  name: string
  label: string
  required: boolean
  default: string
  help: string
  options: { value: string; label: string }[]
}
export interface ConnectFlow {
  label: string
  params: ConnectFlowParam[]
  /** URL de retour à enregistrer chez le fournisseur (Connected App Salesforce, app
   *  OAuth Zoho…). DÉRIVÉE de l'environnement côté backend — donc juste en preprod
   *  comme en prod — et servie UNIQUEMENT sur la projection authentifiée. */
  callback_url?: string | null
  /** Une app OAuth est-elle DÉJÀ à disposition de cet utilisateur — la sienne, celle
   *  de son org, ou celle d'oto (app d'éditeur) ? `null`/absent = le connecteur ne
   *  déclare pas la question : ne rien promettre plutôt qu'affirmer. Sert à ne plus
   *  demander « pose d'abord les identifiants de l'application » à qui n'a rien à poser. */
  app_ready?: boolean | null
}

export interface ZohoOauthModes {
  connector: string
  self_client: boolean
  server_based: boolean
  has_app: boolean
  scopes: string[]
}

// Instance de connecteur (ADR 0038 §B / 0044) — projection lecture du coffre :
// une config possédée à un niveau (member/group/org/tenant/platform). Métadonnées
// seulement.
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`ConnectorInstance` :
//    account: déclaré nullable ; suspended: déclaré nullable). Le correctif est côté oto-
//    backend — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface ConnectorInstance {
  ref: string                  // handle opaque stable (cible de pin)
  connector: string
  // `tenant` (oto-backend#603/#604, oto-dashboard#133) : la clé partagée du tenant de
  // l'appelant — entre `org` et `platform`, comme dans le walker (`access.walk_cascade`).
  level: 'member' | 'group' | 'org' | 'tenant' | 'platform'
  owner: { type: string; id: string | number; label?: string | null }
  name: string                 // nom dérivé (Connecteur · compte)
  account?: string
  secret_kind?: string | null
  set_by?: string | null
  set_at?: string | null
  // 'credential' | 'shared_with_me' | 'tenant_key' | grant plateforme…
  via?: string
  suspended?: boolean          // clé membre mise de côté (lot 2) — sautée par la cascade
}

// ── bibliothèque publique de doctrines (marketplace, library.*) ──
// Métadonnées d'une entrée publiée (sans body ; `snippet` présent si recherche).
export type LibraryEntry = components['schemas']['LibraryEntrySummary']
// Entrée complète (avec le markdown), pour la preview.
export type LibraryDoctrine = ApiOut<'library_get_get'>

// Cran d'activation des connecteurs (ADR 0010, admin). `enabled` null = jamais
// posé → OFF (deny-by-default). `overrides` = exceptions par org.
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/connectors/activation) : rien à dériver tant qu'il l'est.
export interface ConnectorActivation {
  connector: string
  label: string
  help: string
  namespaces: string[]
  enabled: boolean | null
  overrides: { org_id: number; enabled: boolean }[]
  paid_option: string | null   // option payante (couche 3, ADR 0044 §H) ou null
}

// Gouvernance d'activation d'un connecteur, vue côté ORG (cockpit /org/connectors,
// ADR 0022). master_enabled = master plateforme (null = jamais posé = OFF) ;
// org_enabled = override de l'org (null = pas d'override) ; effective = ce que voient
// les membres (override > master > OFF) ; recommended = baseline default_connectors.
export type OrgConnectorActivation = components['schemas']['OrgActivationRow']

// Activation de connecteur au grain ÉQUIPE (ADR 0012, restrict-only). L'équipe ne peut
// que COUPER ce que l'org expose (jamais exposer au-delà). `effective` = org_available
// ET pas coupé par l'équipe.
export type GroupConnectorActivation = components['schemas']['GroupActivationRow']

// ACL connecteur au grain ÉQUIPE (ADR 0012 B2, restrict-only) : réserver un connecteur
// à des MEMBRES de l'équipe. Intersection avec l'ACL d'org (narrowing pur).
export type GroupAclEntry = components['schemas']['GroupAclEntry']

// RBAC connecteur interne à l'org (ADR 0025) : une entrée = un principal (département
// ou membre) autorisé sur un connecteur. ≥1 entrée pour un connecteur ⟹ il est réservé.
export type ConnectorAclEntry = components['schemas']['AclEntry']

// Miroir de access.py::status_for (cascade user > group > org > tenant > platform).
// ⚠️ ÉCRIT À LA MAIN — `/api/me` est bien dans le document servi, mais son champ
// `providers` y est déclaré `additionalProperties: true` (dict ouvert, aucune forme) :
// le contrat servi est plus LÂCHE que l'écran, comme `ConnectorInstance` ci-dessus.
export interface ProviderStatus {
  // `tenant` (oto-backend#603/#604, oto-dashboard#133) : la clé gagnante est celle
  // partagée par le tenant de l'appelant — pas de flag `tenant_secret_configured`
  // séparé côté backend (contrairement à `org_secret_configured`), donc `keyLevelCount`
  // ne la compte pas dans le suffixe (+N) : limite assumée, pas un oubli d'ici.
  mode: 'user' | 'group' | 'org' | 'tenant' | 'platform' | 'forbidden' | 'over_quota'
  user_key_configured: boolean
  group_secret_configured?: boolean
  org_secret_configured: boolean
  platform_key_label: string | null
  quota_used_today: number
  quota_daily: number | null
  // Connecteurs à session navigateur (cookie/personal_session : brevo, crunchbase) —
  // quand la session a été posée (Live View Browserbase). Absent pour les keyés.
  // `session_set_at` = session MEMBRE (perso) ; les deux ci-dessous = sessions
  // PARTAGÉES d'un connecteur org-partageable (ex. Pennylane GED cabinet).
  session_set_at?: string | null
  group_session_set_at?: string | null
  org_session_set_at?: string | null
  // Identité/cible par défaut du sélecteur ADR 0024 (pennylaneged : la société
  // cliente = SA GED) — satellites publics du meta credential, rendus sans listing.
  identity_id?: string | null
  identity_label?: string | null
  // Clé d'équipe « à portée » (mode=forbidden seulement) : une équipe dont je suis
  // membre détient un secret, mais elle n'est pas mon équipe active → la cascade ne
  // la lit pas. Le drawer doit dire « active l'équipe X », pas « pas de clé ».
  team_key_group?: { id: number; name: string } | null
  // Seam générique « étape manquante » (lot 2) : la clé résout mais le connecteur
  // n'est pas opérationnel (unipile : « Connecte un canal »). Libellé backend,
  // rendu tel quel comme verdict + CTA — le front ne connaît pas le connecteur.
  pending_action?: string | null
  // Santé du connecteur : la clé est là mais la dernière sonde a ÉCHOUÉ (session
  // expirée, token révoqué…) → erreur RÉELLE (terra). Posé par le test de connexion,
  // effacé quand il repasse. `health_reason` = message provider nettoyé.
  health_ko?: boolean | null
  health_reason?: string | null
  // L'accès à ce connecteur t'est-il RÉELLEMENT refusé (RBAC ADR 0025/0012 B2) ?
  // ⚠️ À ne PAS confondre avec `mode: 'forbidden'`, qui dit seulement « aucune clé ne
  // résout » — l'état par défaut de tout connecteur pas encore connecté. L'écran a
  // longtemps déduit « Réservé à certaines équipes — demande à un admin » du second,
  // et affichait donc un mur à qui n'était pas bloqué, jusqu'à un org_admin devant le
  // connecteur de sa propre org. Optionnel : un backend antérieur ne le renvoie pas,
  // et son absence vaut « pas de restriction annoncée ».
  rbac_restricted?: boolean
}

// Langue de l'UI (i18n EN/FR). Défini ici pour que `lib/i18n.ts` l'importe sans
// créer un cycle types→lib.
export type Locale = 'en' | 'fr'

export interface Me {
  sub: string
  email: string | null
  name: string | null
  avatar_url: string | null
  role: Role
  locale?: Locale | null             // préférence de langue du compte (i18n) ; absent/null = non réglée
  active_org: number | null          // org EFFECTIVE affichée = consultation (view-as) ?? maison
  active_org_name: string | null
  active_org_logo_url: string | null
  org_role: OrgRole | null
  active_org_readonly?: boolean       // org active consultée EN LECTURE par un opérateur non-membre (ADR 0023)
  active_org_is_personal?: boolean    // org active = espace perso mono-membre → vocab « solo » (principe 9)
  home_org: number | null            // org MAISON (défaut MCP des nouvelles conversations)
  home_org_name: string | null
  active_group: number | null        // équipe EFFECTIVE affichée = consultation ?? maison
  active_group_name: string | null
  group_role: GroupRole | null
  home_group: number | null          // équipe MAISON (défaut MCP)
  home_group_name: string | null         // effectif (escalade org_admin/platform incluse)
  providers: Record<string, ProviderStatus | undefined>
}

// Scope d'une invitation (feature cascade) — DÉRIVÉ des cibles côté backend.
export type InviteScopeKind = 'platform' | 'org' | 'team'

// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (GET /api/invitations/code/{},
//    GET /api/invitations/{}) : sa réponse est un `200 OK` nu dans le document.
export interface InvitePreview {
  email: string | null
  inviter: string | null
  org_name: string | null
  group_name?: string | null
  scope?: InviteScopeKind
}

// Résultat d'une émission d'invitation d'org.
export type InviteResult = ApiOut<'group_invite_create_post'>

// ── tools ──
export interface ToolEntry {
  name: string
  enabled: boolean
  // Anti-lockout / boucle d'usage (PROTECTED_TOOLS backend) : jamais désactivable.
  protected?: boolean
  // 1ʳᵉ ligne de docstring (champ MCP `description`), fusionnée depuis le registre
  // résolu (ADR 0014, `/api/me/tools/registry`) pour l'afficher dans la carte.
  description?: string
}
// Entrée du registre résolu (ADR 0014). `source` = native (in-process oto) ou
// federated (MCP tiers monté) ; `mcp` = nom du connecteur fédéré le cas échéant.
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (GET /api/me/tools/registry) :
//    sa réponse est un `200 OK` nu dans le document.
export interface ToolRegistryEntry {
  name: string
  description: string
  source: 'native' | 'federated'
  mcp?: string
}
// Propriété d'un schéma d'entrée d'outil (JSON Schema dérivé par FastMCP). Un
// param `Optional[str]` arrive en `anyOf: [{type:'string'},{type:'null'}]`.
export interface ToolParamSchema {
  type?: string
  description?: string
  title?: string
  default?: unknown
  enum?: (string | number)[]
  anyOf?: { type?: string }[]
  items?: { type?: string }
}
export interface ToolInputSchema {
  type?: string
  properties?: Record<string, ToolParamSchema>
  required?: string[]
}
// Fiche détaillée d'un outil (`GET /api/me/tools/{name}/detail`) : description
// complète + schémas + connecteur + état perso + testabilité (bouton « tester »).
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (GET /api/me/tools/{}/detail) :
//    sa réponse est un `200 OK` nu dans le document.
export interface ToolDetail {
  name: string
  description: string
  input_schema: ToolInputSchema | null
  output_schema: unknown | null
  namespace: string
  connector: { name: string; label: string } | null
  source: 'native' | 'federated'
  enabled: boolean
  protected: boolean
  default_hidden: boolean
  // Testable depuis le dashboard = open-data en lecture seule (FOD & co). Un test
  // n'envoie jamais d'email / n'écrit jamais de donnée (backend `is_testable`).
  testable: boolean
}
// Résultat d'un test d'outil (`POST /api/me/tools/{name}/call`). L'erreur de
// l'outil est renvoyée EN DONNÉE (`ok:false`) — la voir EST le but du test.
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (POST /api/me/tools/{}/call) :
//    sa réponse est un `200 OK` nu dans le document.
export interface ToolCallResult {
  ok: boolean
  name: string
  result?: unknown
  error?: string
  elapsed_ms?: number
}
// Usage d'une doctrine : nb de chargements par l'agent, appelants, série 30j.
export type InstructionUsage = ApiOut<'org_instruction_usage_get'>
// ── agent readme (niveau USER) — prose injectée à chaque session (cumulable) ──
// Readme INJECTÉ d'un scope (guide delivery='init', ADR 0042) — la prose que l'agent
// reçoit au handshake. Les quatre niveaux partagent cette forme.
export type InitScope = 'platform' | 'org' | 'group' | 'user'
export interface InitGuide {
  scope: InitScope
  slug: string
  delivery: 'init'
  body_md: string
  updated_at: string | null
}

// ── guides on-demand (ADR 0042) : how-to chargés par l'agent via oto_guide ──
export type GuideScope = 'platform' | 'org' | 'group' | 'user'
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`GuideRef` : scope:
//    `str` là où l'écran a un ensemble fermé (group|org|platform|user) ; title: déclaré
//    optionnel ; description: déclaré optionnel ; body_md: absent du contrat). Le correctif
//    est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface Guide {
  slug: string
  scope: GuideScope
  title: string
  description: string
  body_md?: string   // présent seulement sur la lecture d'un guide précis (getGuide)
}

// ── procédures / instructions ──
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran
//    (`GroupInstructionIndexEntry` : title: déclaré optionnel ; title: déclaré nullable ;
//    description: déclaré optionnel ; description: déclaré nullable ; updated_at: déclaré
//    optionnel). Le correctif est côté oto-backend — resserrer l'`Output` — puis `npm run
//    api:refresh` ici.
export interface InstructionMeta {
  id: number
  slug: string
  title: string
  description: string
  version: number
  updated_at: string | null
}
// ⚠️ ÉCRIT À LA MAIN — les DEUX vues du même objet n'ont pas la même forme :
//    `InstructionView` (org) porte `slots` et pas `id`, `GroupInstructionView` (équipe)
//    porte `id` et pas `slots`. Aucun des deux n'est un sur-ensemble de ce que l'écran lit.
export interface InstructionDetail extends InstructionMeta {
  body_md: string
  set_by: string | null
  created_at: string | null
}
export type InstructionVersion = components['schemas']['InstructionVersion']
// Les deux droits servis PAR VERBE sur les bundles de procédures (oto-backend#719,
// suite de #695) : écrire (et restaurer, qui en est le défaire) est ouvert à tout
// MEMBRE de l'équipe propriétaire ; supprimer reste au CHEF, parce que ça emporte
// l'historique. `can_edit`, lui, ne change ni de valeur ni de sens — il dit le droit
// d'ADMINISTRER (readme, membres, secrets) et un intégrateur tiers le lit ainsi.
//
// ⚠️ OPTIONNELS À DESSEIN, et pas parce que le contrat les déclare tels : le serveur les
// sert REQUIS — mesuré le 2026-09-02 sur mcp.oto.cx (prod) ET mcp.oto.ninja (preprod),
// sur `GET /api/me/instructions` et `GET /api/groups/{id}/instructions`. C'est le
// SNAPSHOT commité qui est en retard, et `npm run api:refresh` emporterait tout le
// contrat d'un coup (~18 000 lignes de dérive backend) : un acte à part, à lire, pas un
// effet de bord de ce lot. Optionnels ici veut donc dire « un serveur plus ancien peut
// répondre » — un retour arrière de tag — d'où le repli de `instructionRights`
// (src/lib/instructionRights.ts). Au prochain `api:refresh` : ce bloc disparaît des deux
// types, le généré les portera, requis.
export interface InstructionRights {
  can_write_instructions?: boolean
  can_delete_instructions?: boolean
}

// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`InstructionsBundle` :
//    org_id: déclaré optionnel ; org_name: déclaré optionnel). Le correctif est côté oto-
//    backend — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface DoctrineBundle extends InstructionRights {
  org_id: number | null
  org_name: string | null
  can_edit: boolean
  doctrine: { exists: boolean; version: number; updated_at: string | null }
  instructions: InstructionMeta[]
}

// ── contexte agent (otomata-private#49) : ce que le Claude de l'user reçoit ──
export interface AgentDoctrine {
  org_id: number | null
  org: string | null
  doctrine: string
  group_id: number | null
  group: string | null
  group_doctrine: string
  doctrines: { slug: string; title: string; description: string; scope: string }[]
  referenced_tools: { name: string; description?: string }[]
}
export type AgentToolNamespace = components['schemas']['ToolsNamespace']
export type AgentToolsView = components['schemas']['ToolsView']
// Une couche de l'artefact injecté (backend `instructions.session_layers`) —
// l'invariant : la concaténation "\n\n" des bodies == `instructions`.
export type ContextLayer = components['schemas']['ContextLayer']

// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`AgentContextView` :
//    org_id: déclaré optionnel). Le correctif est côté oto-backend — resserrer l'`Output` —
//    puis `npm run api:refresh` ici.
export interface AgentContext {
  org_id: number | null
  instructions: string
  layers: ContextLayer[]
  doctrine: AgentDoctrine
  tools: AgentToolsView
}

// Fiche profil « situation avec oto » (GET/PUT /api/me/profile). Data model libre :
// `profile` = clés/valeurs, `fields` = schéma suggéré (question/why) pour guider l'UI.
export type ProfileField = components['schemas']['ProfileField']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`ProfileView` :
//    updated_at: déclaré optionnel). Le correctif est côté oto-backend — resserrer
//    l'`Output` — puis `npm run api:refresh` ici.
export interface AccountProfile {
  profile: Record<string, string>
  updated_at: string | null
  fields: ProfileField[]
  missing?: string[]            // clés du schéma encore vides (servi aux deux faces)
}

// ── Blocs d'instructions plateforme A/B (#50) — édités par l'admin plateforme ──
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (PUT
//    /api/admin/platform-instructions, PUT /api/admin/platform-instructions/{}) : rien à
//    dériver tant qu'il l'est.
export interface PlatformInstrBlock {
  key: string                   // 'secret_sauce' (bloc A)
  body_md: string               // contenu effectif (override DB, ou le seed si jamais édité)
  updated_at: string | null
  updated_by: string | null
  is_seed: boolean              // true = jamais édité, body_md = le défaut du code
  default_md: string            // le défaut du code (bouton « rétablir »)
}

// ── Projets (couche d'organisation, ADR 0030) ──
export type ProjectLinkType = 'tableau' | 'procedure' | 'connecteur' | 'doc'
// Surcharge contextuelle PRÉFAITE d'un connecteur dans un projet (ADR 0032 §4, B2) :
// quel compte agir + instructions de surcharge en prose, posées au montage du projet,
// lues par l'agent au chargement — jamais déclarées à la volée.
export interface ConnectorLinkConfig {
  identity_id?: string
  instructions_md?: string
}
export interface ProjectLink {
  target_type: ProjectLinkType
  target_ref: string
  identity_ref?: string | null  // connecteur : identité (compte) du binding — clé de multiplicité (#57)
  label?: string | null
  namespace?: string | null     // tableau : nom du namespace résolu backend (target_ref = id stable)
  title?: string | null         // procédure : titre de la doctrine / doc : titre de la page Documents (résolu backend, target_ref = id stable)
  doc_project_id?: number | null  // doc : projet propriétaire de la page (deep-link vers /projects/:id)
  role?: string | null          // pourquoi cette entité est dans le projet (ADR 0032 §2)
  config?: ConnectorLinkConfig | null   // surcharge préfaite du lien (connecteur, ADR 0032 §4)
  cross_project?: boolean        // dérivé : la même entité est liée par ≥1 autre projet
  created_at?: string | null
}
export interface Project {
  id: number
  name: string
  brief_md: string
  owner_type: string
  owner_id: string
  icon?: string | null           // emoji facultatif — repère visuel (listes, en-tête)
  is_template?: boolean          // publié comme modèle copiable (ADR 0032 §7 B5a)
  can_write?: boolean            // droit d'écriture effectif (#4b) ; false → lecture seule
  public_shared?: boolean        // partage public CHIFFRÉ actif (ADR 0032 §3, zero-knowledge)
  public_shared_at?: string | null  // horodatage de la dernière (re)publication chiffrée
  // Publication en endpoint MCP dédié `<mcp_slug>.mcp.oto.cx` (ADR 0032, amende #44).
  mcp_slug?: string | null
  mcp_access?: 'off' | 'anonymous' | 'secret' | 'org'   // off = non publié ; anonymous = sans login + listé ; secret = sans login, non listé, URL secrète ; org = JWT + org épinglée
  mcp_tools?: string[]                        // allowlist figée du preset exposé
  mcp_url?: string | null                     // URL dérivée `https://<slug>.mcp.oto.cx/mcp` (null si off)
  mcp_unresolvable_tools?: string[]           // (réponse publish) outils exposés MAIS non résolubles sans login → échouent à l'appel
  mcp_expose_datastore?: boolean              // `secret` : datastore exposé en LECTURE sur l'endpoint partagé (tableaux liés au projet)
  mcp_expose_datastore_write?: boolean        // opt-in ADDITIONNEL : écriture (data_write/data_set_schema) ; sans objet si lecture non exposée
  mcp_expose_docs?: boolean                   // `secret` : PAGES du projet lisibles (oto_doc) par l'invité branché ; défaut false (elles portent des notes internes)
  mcp_instructions_md?: string                // ce que l'agent de l'invité lit en se branchant — ≠ brief_md, qui reste interne
  // Périmètre d'URL (oto-backend#605) : motifs canoniques `hôte/chemin/` (ou `hôte/*`)
  // que les outils de recherche écartent et que les outils d'extraction refusent.
  excluded_url_prefixes?: string[]
  created_at?: string | null
  updated_at?: string | null
  archived_at?: string | null
  links?: ProjectLink[]
  // Pastilles d'ÉTAT de l'index (op=list) — dérivées backend, absentes ailleurs.
  entity_count?: number          // nombre d'entités liées
  has_audit?: boolean            // le projet a des liens « à vérifier » (audit)
  shared?: boolean               // partagé (grants présents, ou livré à mon org)
}
// Fichier brut d'un projet — carte « Autre document » (ADR 0032 §3, B4a). Blob
// durable en Object Storage ; `download_url` = lien signé expirant (jamais la clé S3).
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (GET /api/me/projects/{}/files,
//    POST /api/me/projects/{}/files/{}/public) : sa réponse est un `200 OK` nu dans le
//    document.
export interface ProjectFile {
  id: number
  filename: string
  mime?: string | null
  size_bytes?: number | null
  title?: string | null
  description?: string | null
  summary?: string | null
  public?: boolean
  public_url?: string | null     // lien permanent quand public (ADR 0032 §3, B4b)
  created_at?: string | null
  download_url?: string | null
}
export type DocKind = 'doc' | 'note' | 'source'
// Hit de la recherche transverse (lot 3 Ship 1) — deux familles : passages
// (page/brief/procedure/guide, avec fragment surligné) et conteneurs
// (tableau/fichier/connecteur, nom+description). `ref` dépend du kind.
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`SearchHit` : kind:
//    `str` là où l'écran a un ensemble fermé
//    (brief|connecteur|fichier|guide|page|procedure|tableau) ; project_id: déclaré nullable
//    ; project_name: déclaré nullable ; matched_by: déclaré optionnel ; matched_by: déclaré
//    nullable). Le correctif est côté oto-backend — resserrer l'`Output` — puis `npm run
//    api:refresh` ici.
export interface SearchHit {
  kind: 'page' | 'brief' | 'procedure' | 'guide' | 'tableau' | 'fichier' | 'connecteur'
  ref: number | string | { scope: string; slug: string }
  title: string
  description?: string | null
  passage?: string | null        // ts_headline (tags <b>) — à sanitizer au rendu
  project_id?: number
  project_name?: string
  updated_at?: string | null
  matched_by: string
}

// Inbox d'accueil (lot 3 Ship 3) — deux voies : À traiter (décision de moi) / Récent.
export type InboxReviewItem = components['schemas']['InboxProposal']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`InboxInvitation` :
//    code: déclaré nullable ; org_id: déclaré nullable). Le correctif est côté oto-backend
//    — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface InboxInvite { code?: string; org_id?: number; org_name?: string | null; invited_by?: string | null; created_at?: string | null }
export type InboxRecent = components['schemas']['InboxRecent']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`InboxView` : ). Le
//    correctif est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh`
//    ici.
export interface Inbox {
  to_review: InboxReviewItem[]
  invitations: InboxInvite[]
  recent: InboxRecent[]
  count: number
}

export interface Doc {
  id: number
  project_id: number
  parent_id: number | null
  title: string
  description?: string | null    // chapô (Ship 2 lot 3) — sous-titre curé
  position?: number | null       // ordre curé dans la fratrie (entiers espacés)
  body_md: string
  kind: DocKind
  public?: boolean               // partagé publiquement (#4a)
  public_url?: string | null     // lien public de lecture quand partagé
  created_at?: string | null
  updated_at?: string | null
}
// Version antérieure d'un Doc (ADR 0032 §3, B4c) — snapshot avant une mise à jour.
export interface DocRevision {
  id: number
  title: string
  body_md: string
  edited_by?: string | null
  created_at?: string | null
}
// Demande de modif d'un Doc (gap #4b) — proposée par un utilisateur en lecture seule.
export interface DocChangeRequest {
  id: number
  doc_id: number
  requested_by?: string | null
  proposed_title?: string | null
  proposed_body_md: string
  message?: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at?: string | null
}
export interface ProjectActivity {
  sub: string | null
  action: string
  detail: string | null
  created_at: string | null
  // Identité de l'auteur résolue backend (refonte UX) — null si sub inconnu/système.
  actor?: { name?: string | null; email?: string | null } | null
}
// Run persisté d'un projet (ADR 0017) — pastille ok/échec du viewer de procédure.
export interface ProjectRun {
  run_id: string
  label: string
  doctrine: string | null
  outcome: string | null         // done|abandoned|failed|blocked ; null = en cours
  started_at: string | null
  finished_at: string | null
}
export interface ResourceGrant {
  principal_type: string
  principal_id: string
  email?: string | null
  permission: string
  granted_at?: string | null
}

// ── google / datastore / tokens ──
export interface GoogleAccount {
  email: string | null
  is_default: boolean
  scopes: string[]
  granted_at: string | null
}
export interface GoogleOauthStatus {
  connected: boolean
  granted_at: string | null
  scopes: string[]
  accounts?: GoogleAccount[]
}
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (POST /api/me/tokens) : sa
//    réponse est un `200 OK` nu dans le document.
export interface ApiToken {
  id: number
  label: string
  created_at: string
  last_used_at: string | null
}

// MCP fédéré (otomata#16) — statut de connexion OAuth per-user (ex. atlassian).
export interface FederatedStatus {
  connected: boolean
  set_at: string | null
}

// Datastore (ADR 0016 + primitive d'ownership ADR 0030) — un namespace possédé ou partagé.
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`NamespaceEntry` :
//    owner_type: déclaré nullable ; owner_type: `str` là où l'écran a un ensemble fermé
//    (group|org|user) ; owner_id: déclaré nullable ; owner_sub: absent du contrat ;
//    permission: déclaré nullable). Le correctif est côté oto-backend — resserrer
//    l'`Output` — puis `npm run api:refresh` ici.
export interface NamespaceEntry {
  id: number          // BIGSERIAL stable — handle de deeplink, survit au renommage
  namespace: string
  url: string
  shared: boolean
  created_at?: string | null
  owner_type?: 'user' | 'org' | 'group'
  owner_id?: string
  owner_sub?: string  // legacy (≈ owner_id quand user)
  permission?: string
  can_write?: boolean   // ADR 0030 : droit d'écriture effectif (owner-match ∪ grant write)
  can_govern?: boolean  // ADR 0030 : droit de gouvernance (transfert/partage/suppression)
  is_personal?: boolean // classeur perso (owner_type=user, owner_id=sub)
  schema?: DatastoreSchema | null  // mode typé optionnel (ADR 0032 §6 / 0029) ; null = table libre
}

// Schéma typé d'un namespace (ADR 0032 §6 / 0029, B6) — champs + rôles de rendu.
// v2 (ADR 0046) : types imbriqués (`object`+fields / `list`+of), validation
// opt-in (required / required_when) et cycle de vie sur le field status. Le
// front ne VALIDE pas (le backend refuse à l'écriture) — il REND ces formes.
export type DatastoreFieldRole = 'title' | 'badge' | 'metric' | 'status' | 'qualif' | 'note'
export interface DatastoreLifecycle {
  states?: string[]
  transitions?: Record<string, string[]>
  terminal?: string[]
  // Plafond de réservations SANS écriture (oto-backend#433) : au-delà, le serveur
  // verse la ligne dans `abandon_state` (un état terminal déclaré), pose le motif
  // dans `_abandon` et la sort de la file. Les deux clés vont ensemble — l'une sans
  // l'autre est refusée à la pose. Absentes = aucun plafond.
  max_claims?: number | null
  abandon_state?: string | null
}
export interface DatastoreField {
  key: string
  label?: string
  // Types de DONNÉE + types de PRÉSENTATION (url/email/datetime/enum) : le widget
  // d'édition et le rendu en découlent. Sans type déclaré, on retombe sur la
  // détection par la valeur (`cellKind`) — jamais sur la LONGUEUR (cf. RowDrawer).
  type?: 'text' | 'number' | 'date' | 'datetime' | 'bool' | 'json' | 'object' | 'list'
    | 'url' | 'email' | 'enum'
  options?: string[]            // type=enum : valeurs proposées (select)
  // Largeur DÉCLARÉE dans la fiche : 'full' = pleine ligne, 'half' = demi-colonne.
  // Absente ⇒ dérivée du type (note/json/url longs en pleine ligne). Rend le layout
  // STABLE d'une ligne à l'autre (avant : deviné de la longueur de la valeur).
  width?: 'half' | 'full'
  hidden?: boolean              // hors table par défaut (reste éditable en fiche)
  // ⚠️ Le serveur nomme une ligne depuis `display` — les rôles sont sortis du
  // schéma côté serveur (oto-backend#317 étape A). `role` reste servi sur les
  // schémas convertis (additif) et reste la convention des autres rendus, qui
  // sont désormais des conventions de CONSOMMATEUR. Voir `lib/datastoreTitle`.
  display?: 'title'
  role?: DatastoreFieldRole
  fields?: DatastoreField[]  // type=object
  of?: Partial<DatastoreField>  // type=list — field-def d'item, key optionnelle (scalaire n'en a pas)
  required?: boolean
  required_when?: Record<string, string>
  lifecycle?: DatastoreLifecycle                       // sur role=status
}
export interface DatastoreSchema {
  fields?: DatastoreField[]
  key?: string
  strict?: boolean
}

// Bénéficiaire d'un partage de ressource (vue propriétaire).
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (POST /api/resources) : sa
//    réponse est un `200 OK` nu dans le document.
export interface NamespaceShare {
  email: string | null
  label?: string | null   // libellé résolu backend : email (user) / nom (org, équipe)
  role?: string | null    // ADR 0048 : viewer | editor | manager (surface produit)
  permission: string      // rétro-compat (read | write) — projeté depuis le rôle
  principal_type?: string
  principal_id?: string
  created_at?: string | null
}

// Destinataire d'un partage `oto_resource` : un user (email), une équipe (group_id —
// groupe d'une org dont on est membre) ou une org entière (org_id, livraison client).
export interface SharePrincipal {
  email?: string
  org_id?: number
  group_id?: number
}

// Object-browser admin (ADR 0030) — une ressource possédée, plan gouvernance.
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (POST /api/resources) : sa
//    réponse est un `200 OK` nu dans le document.
export interface ResourceEntry {
  resource_type: string
  resource_id: string
  namespace?: string
  owner_type?: string
  owner_id?: string
  owner_label?: string | null
  row_count?: number
  created_at?: string | null
}

// Une row du datastore : méta à plat (`_id`/`_created_at`/`_updated_at`) + champs
// user arbitraires (schéma libre). Cf. datastore.py::_row_to_dict.
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (POST
//    /api/datastore/namespaces/{}/rows) : sa réponse est un `200 OK` nu dans le document.
// `BailDeLaLigne` apporte `_claimed_run` — POUR QUEL RUN la ligne est réservée,
// servi partout où `_claimed_by` l'est. Sans lui, la file de travail disait qu'un
// agent tenait une ligne, jamais lequel tenait laquelle. ⚠️ Trois états : le run,
// `null` (bail pris sans run), clé absente (aucun bail). Cf. `api.attendu.ts`.
export interface DatastoreRow extends BailDeLaLigne {
  _id: string
  _created_at?: string | null
  _updated_at?: string | null
  [field: string]: unknown
}

// Une entrée du JOURNAL du datastore (ADR 0046 b4, élargi) — une fiche ou un
// tableau entier. Source UNIQUE : la table `tool_calls`. `kind` dit d'où vient
// le geste : `mcp` = appel d'un agent, `rest` = geste posé dans la console.
// Les champs enrichis (`row_id`/`row_title`/`fields`/`from_status`/`to_status`)
// valent null/[] sur les lignes journalisées AVANT l'élargissement (aucune
// migration de données) — l'affichage doit rester lisible sans eux.
export interface RowActivityEntry {
  created_at: string
  kind: 'rest' | 'mcp'
  tool: string
  ok: boolean
  error: string | null
  sub: string | null
  email: string | null
  run_id: string | null
  run_label: string | null
  doctrine: string | null
  outcome: string | null
  row_id: string | null
  row_title: string | null
  fields: string[]
  from_status: string | null
  to_status: string | null
}

// Filtre par colonne de la vue tableau datastore (oto-dashboard#18). Combinés AND,
// appliqués server-side. Miroir de db._DS_FILTER_OPS.
export type FilterOp =
  | 'contains' | 'eq' | 'ne' | 'in'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'empty' | 'not_empty'
export interface ColumnFilter {
  field: string
  op: FilterOp
  value: string | string[]
}

// Unipile (LinkedIn & WhatsApp hébergés) — l'user connecte SES comptes (account_id
// per-user PAR CANAL) sous la clé Unipile partagée de l'org, sous un abonnement
// commun. channels.<canal>.connected=false → doit faire le hosted-auth de ce canal.
export interface UnipileChannel {
  connected: boolean
  account_id: string | null
  connected_at: string | null
}
// ÉCRIT À LA MAIN — la capacité ne déclare pas son `Output` (GET /api/me/unipile) : sa
//    réponse est un `200 OK` nu dans le document.
export interface UnipileStatus {
  subscribed: boolean       // option débloquée (BYO ou comp admin) — gate l'étape « connecter »
  mode?: string             // user|group|org|platform|over_quota|forbidden (origine de la clé)
  byo?: boolean             // clé propre (user/groupe/org), pas la clé plateforme
  channels: { linkedin: UnipileChannel; whatsapp: UnipileChannel; telegram: UnipileChannel; instagram: UnipileChannel; messenger: UnipileChannel; twitter: UnipileChannel }
  // Proposition d'ADOPTION (binding-par-org) : canaux non liés dans CETTE org dont le
  // sub a un compte connecté ailleurs (même clé plateforme) — « Connect » l'active ici.
  elsewhere?: Partial<Record<keyof UnipileStatus['channels'],
    { account_id: string; account_name: string | null; org_id: number | null }>>
}

// Identité connectée d'un connecteur (sélecteur générique, ADR 0024).
export type ConnectorIdentity = components['schemas']['Identity']

// Autorisation de compte connecteur partagé (#55) : le propriétaire accorde à un
// user nommé (par email/sub, même hors de ses orgs) le droit d'OPÉRER son compte sur un canal.
// Face owner (granted_by_me : grantee_*) et face grantee (granted_to_me : owner_*).
export interface AccountGrant {
  provider: string          // canal DB (LINKEDIN/WHATSAPP/…)
  account_id: string | null // handle LIVE du compte du owner (null = canal déconnecté)
  account_name?: string | null
  grantee_sub?: string
  grantee_email?: string | null
  grantee_name?: string | null
  owner_sub?: string
  owner_email?: string | null
  owner_name?: string | null
  owner_org_id?: number | null    // org sous laquelle le owner a connecté ce compte
  owner_org_name?: string | null  // (face grantee : d'où vient le partage)
  granted_by?: string
  granted_at?: string
  active?: boolean          // false = owner déconnecté du canal (grant inerte)
}

// Siège de la clé plateforme unipile : un compte de l'instance partagée + son
// propriétaire oto. Un siège se paie tant qu'il EXISTE chez unipile — se déconnecter
// côté oto ne le rend pas, d'où trois états distincts et non deux :
//   bound        = binding vivant, en service (ne pas libérer)
//   disconnected = plus que des bindings morts ; on sait encore à qui il est
//   orphan       = aucune ligne, personne ne le réclame
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/unipile/seats) : rien à dériver tant qu'il l'est.
export interface UnipileSeat {
  account_id: string
  name: string | null
  type: string | null          // = provider (compat : valait null depuis la bascule v2)
  provider: string | null
  status: string
  created_at?: string | null
  owner_sub: string | null
  owner_email: string | null
  org_id: number | null
  org_name: string | null
  disconnected_at: string | null
  state: 'bound' | 'disconnected' | 'orphan'
  orphan: boolean              // = state === 'orphan'
}

// ── orgs ──
export type Org = components['schemas']['OrgBrief']
export type OrgMember = components['schemas']['OrgMemberEntry']
export type OrgSecret = components['schemas']['OrgSecretEntry']
export interface OrgEntitlement {
  namespace: string
  granted_at?: string | null
}
// ⚠️ ÉCRIT À LA MAIN — `entitlements` n'est PAS servi : `_org_detail` renvoie {org,
//    members, secrets, option_comps, billing}. La carte « accès débloqués »
//    d'OrgSettingsView en dépend et ne peut donc jamais s'afficher — à trancher côté
//    backend (servir le champ) ou ici (retirer la carte), pas à masquer.
export interface OrgDetail {
  org: Org
  members: OrgMember[]
  secrets: OrgSecret[]
  entitlements?: OrgEntitlement[]
  option_comps?: string[]   // options payantes offertes (comp admin) à l'ORG
  billing?: BillingStatus   // plan/abonnement de l'org (ADR 0043) — cockpit admin
}
// ── redaction de champs par connecteur (FieldFilter, ADR 0015) ──
export interface FieldRule {
  fields: string[]
  action: 'mask' | 'drop' | 'pseudonym' | 'generalize' | 'hash' | 'anonymize'
  // params optionnels selon l'action
  preserve?: 'email' | 'phone' | 'iban'
  keep_first?: number
  keep_last?: number
  kind?: string          // pseudonym
  to?: string            // generalize : year|month|department|range
  step?: number          // generalize range
}
export interface FieldFilterBlock {
  salt?: string
  rules: FieldRule[]
}
export interface FieldActionParam {
  key: string
  type: 'select' | 'int'
  label: string
  options?: string[]
}
export interface FieldActionSchema {
  action: string
  label: string
  params: FieldActionParam[]
}
// Champ de sortie déclaré d'un connecteur (pilote l'onglet « transformations »).
export interface ConnectorFieldSchema {
  name: string
  label?: string
  type?: string
  sensitive?: boolean
}
export interface FieldFilterTemplate {
  label: string
  hint?: string
  rules: FieldRule[]
}
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`FieldFiltersView` :
//    schemas: déclaré optionnel ; schemas: déclaré nullable). Le correctif est côté oto-
//    backend — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface FieldFiltersBundle {
  org_id: number
  filters: Record<string, FieldFilterBlock>   // service -> politique de l'org
  defaults: Record<string, FieldFilterBlock>  // défauts serveur (vide : rien par défaut)
  templates: Record<string, FieldFilterTemplate>  // jeux applicables en 1 clic
  schema: FieldActionSchema[]                 // modes dispo (pilote le formulaire)
  schemas: Record<string, ConnectorFieldSchema[]>  // champs déclarés par connecteur
}

// Invitation en attente, tous scopes (org/équipe/plateforme — feature cascade). Le
// backend enrichit chaque ligne de son scope dérivé + noms d'org/équipe.
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`InvitationEntry` :
//    email: déclaré optionnel ; org_role: déclaré optionnel ; org_role: déclaré nullable ;
//    org_role: `str` là où l'écran a un ensemble fermé (org_admin|org_member) ; group_role:
//    `str` là où l'écran a un ensemble fermé (group_admin|group_member) ; scope: `str` là
//    où l'écran a un ensemble fermé (org|platform|team)). Le correctif est côté oto-backend
//    — resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface OrgInvitation {
  id: number
  email: string | null
  code?: string | null
  org_role: OrgRole
  group_role?: GroupRole | null
  scope?: InviteScopeKind
  org_id?: number | null
  group_id?: number | null
  org_name?: string | null
  group_name?: string | null
  source?: string | null
  invited_by?: string | null
  created_at?: string | null
  expires_at?: string | null
}

// ── groupes (départements / équipes, ADR 0012) ──
export interface GroupListItem {
  id: number
  group_id: number
  name: string
  description: string
  member_count: number
  my_role: GroupRole | null
  active: boolean
}
export type GroupBrief = components['schemas']['GroupBrief']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`GroupMemberEntry` :
//    email: déclaré optionnel ; name: déclaré optionnel ; role: `str` là où l'écran a un
//    ensemble fermé (group_admin|group_member)). Le correctif est côté oto-backend —
//    resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface GroupMember {
  sub: string
  email: string | null
  name: string | null
  role: GroupRole
  active: boolean
}
export type GroupSecret = components['schemas']['GroupSecretEntry']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`GroupDetail` : ). Le
//    correctif est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh`
//    ici.
export interface GroupDetail {
  group: GroupBrief
  members: GroupMember[]
  secrets: GroupSecret[]
}
export type GroupInstructionsBundle = ApiOut<'group_instruction_list_get'> & InstructionRights

// ── admin ──
export interface AdminGrant {
  provider: string
  label: string
  daily_quota: number | null
}
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/users) : rien à dériver tant qu'il l'est.
export interface AdminUser {
  sub: string
  email: string | null
  name: string | null
  role: Role
  effective_role: Role
  created_at: string
  updated_at: string
  grants: AdminGrant[]
}
// Fiche détaillée d'un user (GET /api/admin/users/{sub}) : accès effectif par
// provider + grants + namespaces, pour la page /platform/users/:sub.
export interface AdminUserOrg {
  org_id: number
  name: string
  org_role: OrgRole
  is_active: boolean
  joined_at: string
}
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/users/{}) : rien à dériver tant qu'il l'est.
export interface AdminUserDetail {
  sub: string
  email: string | null
  name: string | null
  role: Role
  active_org: number | null
  orgs: AdminUserOrg[]
  providers: Record<string, ProviderStatus | undefined>
  grants: AdminGrant[]
  option_comps: string[]   // options de connecteur offertes (comp admin) à CET user
  unipile_orgs?: AdminUserUnipileOrg[]   // messagerie PAR ORG (l'option est per-org)
}
// État messagerie Unipile d'un user POUR UNE org donnée (un bloc par org dont il est
// membre ; un user peut appartenir à N orgs, l'option est par org). org_id
// null = bloc « hors de ses orgs » (comptes orphelins), subscribed/option_source null.
export interface AdminUserUnipileOrg {
  org_id: number | null
  org_name: string | null
  is_active: boolean
  subscribed: boolean | null
  mode?: string | null
  byo?: boolean | null
  channels: UnipileStatus['channels']
  option_source: {
    user_comp: boolean
    org_comp: boolean
  } | null
}
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/orgs) : rien à dériver tant qu'il l'est.
export interface AdminOrgSummary {
  id: number
  name: string
  member_count: number
  logo_url: string | null   // logo effectif (upload > logo.dev du domaine), null si absent
  domain: string | null
}

// ── Tenants (étage d'identité, ADR 0052) — suivi plateforme, LECTURE SEULE ──
// Un tenant porte un émetteur (son Logto dédié), des hosts, des orgs. Déclarer un
// tenant est un runbook de provisioning côté backend : cet écran ne l'édite pas.
// ⚠️ `orgs` et `comptes` viennent de DEUX sources différentes qui peuvent diverger
// (`orgs.tenant_id` vs la qualification du sub) — `orgs_desalignees` mesure l'écart.
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/tenants) : rien à dériver tant qu'il l'est.
export interface TenantRow {
  id: number
  slug: string
  name: string
  created_at: string | null
  // Configuration d'annuaire (aucun secret : la table n'en porte pas).
  issuer: string | null
  jwks_uri: string | null
  hosts: string[]
  oauth_client_id: string | null
  dashboard_url: string | null
  link_paths: Record<string, string>
  primary: boolean              // le tenant `oto` : son émetteur vient de l'env
  issuer_source: 'env' | 'db' | null
  authenticates: boolean        // un émetteur est déclaré
  loaded: boolean               // présent dans le registre du process (bâti au boot)
  pending_restart: boolean      // déclaré MAIS pas chargé ⟹ ses jetons sont rejetés
  live_hosts: string[]          // hosts effectivement servis par le process
  orgs: number
  orgs_archivees: number
  comptes: number
  comptes_actifs: number
  appels: number
  dernier_compte_at: string | null
  last_seen_at: string | null
  orgs_desalignees: number
}
// ── Relance des comptes inactifs (console plateforme) ──
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/outreach) : rien à dériver tant qu'il l'est. Relevé sur la capacité
//    `admin.outreach` d'oto-backend, présente au commit servi par la preprod ET au
//    tag de prod.
//
// ⚠️ Cette surface FAIT PARTIR DES MAILS sous notre marque. Les cinq verrous vivent
// au serveur, et l'écran n'en contourne aucun — il les rend visibles :
//   1. les comptes d'un tenant PARTENAIRE sont exclus par la requête elle-même ;
//   2. l'index unique `(campagne, compte)` interdit la seconde relance — et
//      l'audience est regroupée par BOÎTE MAIL, parce que cet index ne voit pas
//      deux comptes distincts qui partagent une adresse (`accounts` le dit) ;
//   3. `send` refuse tant qu'un `test` n'a pas été REÇU pour cette empreinte de
//      contenu et pour CHAQUE langue servie — toute retouche invalide l'essai ;
//   4. `send` sans `confirm` refuse en annonçant N ; un `confirm` qui ne colle plus
//      refuse aussi ; plafond dur au-delà de `OUTREACH_MAX_ENVOI` ;
//   5. chaque message porte un lien de désinscription signé.
export type OutreachOp = 'audience' | 'preview' | 'test' | 'send' | 'journal'
  | 'optouts' | 'optout_clear'
/** 'never_active' = aucun appel d'outil, jamais. 'dormant' = a appelé, puis plus
 *  rien depuis `dormant_days`. Deux SEGMENTS d'une même campagne — pas deux
 *  campagnes : le slug et le contenu restent les mêmes, donc l'essai vaut pour les
 *  deux et personne n'est relancé deux fois. */
export type OutreachStatus = 'never_active' | 'dormant'
/** Plafond dur d'un envoi, côté serveur (`db_outreach.MAX_ENVOI`). Affiché pour que
 *  l'opérateur sache où il est AVANT d'être refusé ; le refus reste au serveur. */
export const OUTREACH_MAX_ENVOI = 200

export interface OutreachRow {
  sub: string
  email: string | null
  name: string | null
  created_at: string | null
  calls: number
  last_seen_at: string | null
  /** Relances DÉJÀ reçues, toutes campagnes confondues. */
  previous_outreach: number
  /** La préférence DÉCLARÉE (langue d'UI du dashboard), souvent `null`. */
  locale: string | null
  /** La langue réellement servie à cette personne. */
  served_locale: string
  /** ⚠️ `declared` = la personne a choisi ; `default` = c'est l'opérateur qui a
   *  choisi pour elle. Les afficher pareil ferait passer un choix d'opérateur pour
   *  une donnée de compte. */
  locale_source: 'declared' | 'default'
  /** INDICATION à l'œil seulement : le domaine n'entre dans aucune décision de
   *  langue — un `.com` peut être français, un `.fr` une filiale. */
  email_domain: string | null
  /** ⚠️ Combien de COMPTES partagent cette boîte mail. Une relance s'adresse à la
   *  BOÎTE, pas au compte : un humain qui s'est inscrit deux fois avec la même
   *  adresse est UNE ligne, et `sub` est son compte le plus récent. Servi pour que
   *  la fusion se VOIE — une audience qui rétrécit sans dire pourquoi se lit comme
   *  un filtre qui a trop mordu. */
  accounts: number
  /** Renseignés par `op=send` uniquement, ligne par ligne. */
  sent: boolean | null
  reason: string | null
}

export interface OutreachSend {
  id: number
  campaign: string
  sub: string
  to_email: string | null
  locale: string
  /** 'test' = parti chez l'opérateur ; 'send' = parti chez la personne. */
  kind: string
  fingerprint: string | null
  sent_by: string | null
  sent_at: string | null
  desinscrit: boolean
}

export interface OutreachOptout {
  sub: string
  email: string | null
  source: string | null
  opted_out_at: string | null
}

export interface OutreachResult {
  op: OutreachOp
  campaign: string | null
  recipients: OutreachRow[]
  /** `total` = l'audience ENTIÈRE ; `selected` = ce que CETTE réponse porte, et donc
   *  le nombre à confirmer. ⚠️ Ne jamais confirmer avec `total` : la troncature est
   *  le seul écart que l'opérateur ne peut pas voir. */
  total: number
  selected: number
  truncated: boolean
  with_declared_locale: number
  with_default_locale: number
  sent: number
  cleared: boolean
  /** locale → HTML rendu. ⚠️ L'aperçu est rendu SANS lien de désinscription (il
   *  n'existe pas de destinataire) ; le mail réel en porte toujours un. */
  preview_html: Record<string, string>
  /** sha256 du contenu servi, toutes langues. C'est LUI qui lie l'essai à l'envoi. */
  fingerprint: string | null
  /** Les langues pour lesquelles un essai a été reçu SUR CETTE EMPREINTE. */
  tested_locales: string[]
  log: OutreachSend[]
  optouts: OutreachOptout[]
}

/** Le corps posté. `body_*` est du TEXTE BRUT : les lignes vides séparent des
 *  paragraphes, les retours simples deviennent des sauts. Il est échappé au rendu —
 *  aucun HTML ne passe. */
export interface OutreachInput {
  op: OutreachOp
  campaign?: string
  status?: OutreachStatus
  dormant_days?: number
  limit?: number
  subject_fr?: string
  body_fr?: string
  subject_en?: string
  body_en?: string
  cta_label_fr?: string
  cta_label_en?: string
  cta_url?: string
  /** La langue servie aux comptes SANS préférence déclarée — un CHOIX d'opérateur,
   *  jamais une déduction. */
  default_locale?: 'fr' | 'en'
  /** Le nombre annoncé, renvoyé à l'identique. Absent ⟹ `send` refuse en donnant N. */
  confirm?: number
  target?: string
  only?: string[]
}

// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/tenants) : rien à dériver tant qu'il l'est.
export interface TenantTotals {
  tenants: number
  orgs: number
  comptes: number
  comptes_actifs: number
  appels: number
}
export interface TenantOrgRow {
  id: number
  name: string
  created_at: string | null
  archived_at: string | null
  personal: boolean
  front_base_url: string | null
  front_brand: string | null
  membres: number
}
export interface TenantAccountRow {
  sub: string
  email: string | null
  name: string | null
  role: Role
  created_at: string | null
  appels: number
  last_seen_at: string | null
}
export interface TenantMisalignedOrg {
  id: number
  name: string
  created_by: string | null
  tenant_du_createur: string
}
// La fiche = la ligne + les listes qui expliquent ses compteurs (bornées à 50 côté
// backend : une fiche rend son index, pas la population).
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/tenants/{}) : rien à dériver tant qu'il l'est.
export interface TenantSheet extends TenantRow {
  orgs_recentes: TenantOrgRow[]
  comptes_recents: TenantAccountRow[]
  orgs_desalignees_detail: TenantMisalignedOrg[]
}
// ADR 0044 §F : instance scope PLATFORM du coffre (identité = provider+label, plus d'id/secret).
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/platform-keys) : rien à dériver tant qu'il l'est.
export interface PlatformKey {
  provider: string
  label: string
  set_at: string
}

// Accès plateforme d'un connecteur (ADR 0044 §H) — « qui y a droit » côté plateforme.
export interface PlatformAccessBeneficiary {
  scope: 'org' | 'user'
  id: string
  label: string
  has_key: boolean       // puise dans la clé plateforme (couche 2)
  has_option: boolean    // option payante offerte (comp, couche 3)
  logo_url?: string | null   // org
  email?: string | null      // user
}
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (POST
//    /api/admin/connectors/{}/platform-access) : rien à dériver tant qu'il l'est.
export interface PlatformAccess {
  connector: string
  paid_option: string | null   // null = pas d'option payante
  platform_key: boolean        // une clé plateforme existe
  open_tier: boolean           // free-tier : ouvert à tous sans grant
  beneficiaries: PlatformAccessBeneficiary[]
}

// ── monitoring ──
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`CallRow` : sub:
//    déclaré optionnel ; email: déclaré optionnel ; name: déclaré optionnel ; tool_name:
//    déclaré optionnel ; tool_name: déclaré nullable ; called_at: déclaré optionnel ;
//    called_at: déclaré nullable ; duration_ms: déclaré optionnel ; ok: déclaré optionnel ;
//    ok: déclaré nullable ; error: déclaré optionnel). Le correctif est côté oto-backend —
//    resserrer l'`Output` — puis `npm run api:refresh` ici.
export interface ToolCall {
  id: number
  sub: string | null
  email: string | null
  name: string | null
  tool_name: string
  called_at: string
  duration_ms: number | null
  ok: boolean
  error: string | null
  // Axes de corrélation (investigation) : la conversation, le déroulé, l'org sous
  // laquelle l'appel a été émis. NULL hors contexte — un appel peut n'être dans
  // aucun run. `sentry_event_id` n'est posé que sur une erreur de CODE capturée.
  session_id?: string | null
  run_id?: string | null
  org_id?: number | null
  sentry_event_id?: string | null
}
// Fiche d'UN appel (`GET /api/admin/monitoring/calls/{id}`) : la ligne complète,
// args TRONQUÉS à l'écriture (jamais le payload intégral, garantie calllog).
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/monitoring/calls/{}) : rien à dériver tant qu'il l'est.
export interface ToolCallDetail {
  id: number
  kind: string
  server: string
  sub: string | null
  email: string | null
  name: string | null
  tool: string
  args: Record<string, unknown> | null
  ok: boolean
  error: string | null
  duration_ms: number | null
  created_at: string
  session_id: string | null
  run_id: string | null
  org_id: number | null
  org_name: string | null
  client_id: string | null
  sentry_event_id: string | null
}
export type MonitoringToolStat = components['schemas']['ToolStat']

// ── lentilles par kind (ADR 0017, « un seul flux ») ──
export interface MonitoringRouteStat {
  route: string
  calls: number
  errors: number
  avg_ms: number | null
  p95_ms: number | null
}
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/monitoring/rest) : rien à dériver tant qu'il l'est.
export interface MonitoringRestStats {
  since_days: number
  total_calls: number
  error_count: number
  active_users: number
  by_route: MonitoringRouteStat[]
}
export type ConnectorFailureStat = components['schemas']['ConnectorFailure']
export type MonitoringConnectorStats = ApiOut<'org_monitoring_connectors_get'>
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/monitoring/funnel) : rien à dériver tant qu'il l'est.
export interface ActivationFunnel {
  window_days: number
  total_accounts: number
  active: number
  rest_only: number
  never_active: number
  blocked_by_connector: number
}

// Adoption d'une org, membre par membre (`GET /api/orgs/{id}/monitoring/adoption`) —
// le pendant du funnel à l'échelle d'une équipe. Part des MEMBRES (pas des appels) :
// un membre à 0 appel doit apparaître, c'est justement lui qu'on cherche.
export type OrgMemberAdoption = components['schemas']['AdoptionMember']
export type OrgAdoption = ApiOut<'org_monitoring_adoption_get'>
export type MonitoringUserStat = components['schemas']['UserStat']
export type MonitoringDayStat = components['schemas']['DayStat']
export type MonitoringSummary = ApiOut<'org_monitoring_summary_get'>

// ── usage / déroulés de doctrine (ADR 0017) ──
export type DoctrineRun = components['schemas']['RunRow']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`GapRow` : kind:
//    déclaré optionnel ; kind: déclaré nullable ; intent: déclaré optionnel ; last_at:
//    déclaré optionnel ; last_at: déclaré nullable ; users: déclaré optionnel). Le
//    correctif est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh`
//    ici.
export interface UsageGap {
  kind: string                // missing_tool | missing_doctrine | missing_data | other
  intent: string | null       // ce que l'agent voulait faire
  n: number
  last_at: string
  users: string[]             // emails distincts des rapporteurs (repli sub)
}
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`ToolFeedbackRow` :
//    tool: déclaré optionnel ; kind: déclaré optionnel ; kind: déclaré nullable ; last_at:
//    déclaré optionnel ; last_at: déclaré nullable ; users: déclaré optionnel). Le
//    correctif est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh`
//    ici.
export interface ToolFeedbackAgg {
  tool: string | null
  kind: string                // bug | misleading_doc | wrong_result | praise | other
  n: number
  last_at: string
  users: string[]             // emails distincts des rapporteurs (repli sub)
}
// Un signal d'usage brut (usage_signals) — le détail derrière un agrégat
// tool-quality/gap (le `body` = le texte du feedback/gap).
// ÉCRIT À LA MAIN — `/api/admin/*` est HORS du document OpenAPI servi (GET
//    /api/admin/usage/signals{}) : rien à dériver tant qu'il l'est.
export interface UsageSignal {
  id: number
  created_at: string
  signal: string              // tool_feedback | gap
  kind: string
  target: string | null       // nom d'outil (tool_feedback) ou intent (gap)
  body: string | null
  source: string              // agent | human
  sub: string | null          // rapporteur (null = session anonyme)
  email: string | null        // email du rapporteur (LEFT JOIN users)
  name: string | null
}
// Un appel dans la timeline d'un déroulé (get_doctrine_run) — colonnes brutes
// tool_calls (tool/created_at), distinct du ToolCall aliasé du monitoring.
export type RunCall = components['schemas']['RunCall']

// ── email & envoi de l'org, PAR CONNECTEUR (ADR 0009, carte connecteur ORG) ──
// Adresses expéditrices déclarées par l'org pour `email_send` + fenêtre calme
// (heures où l'envoi est différé) + file d'envois programmés.
export interface EmailSender {
  email: string
  name?: string
  reply_to?: string
  // plus de `transport` : le transport DÉRIVE du connecteur (cf. EmailSettingsBundle.transports).
}
export interface QuietHours {
  tz: string
  start: number   // heure 0..23
  end: number     // heure 0..23 (wrap minuit ok : start=22/end=7)
}
// Réglages email d'UN connecteur (expéditeurs + fenêtre calme propre).
export interface EmailBlock {
  senders: EmailSender[]
  quiet_hours?: QuietHours        // absente = défaut plateforme à l'envoi
}
// Bundle keyé par connecteur (scaleway = hébergé, resend = BYOK) — le transport
// se déduit du connecteur (transports[connector]).
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`EmailSettingsView` :
//    ). Le correctif est côté oto-backend — resserrer l'`Output` — puis `npm run
//    api:refresh` ici.
export interface EmailSettingsBundle {
  org_id: number
  settings: Record<string, EmailBlock>
  connectors: string[]
  transports: Record<string, string>
  quiet_hours_default: QuietHours
  resend_key_set: boolean         // le connecteur resend exige la clé d'org
}
// Colonnes réelles de db.list_scheduled_emails (sans le HTML).
export type ScheduledEmail = components['schemas']['ScheduledEmail']

// MCP endpoint public (config, pas un secret) — affiché tel quel. DÉCOUPLÉ de
// VITE_LOGTO_AUDIENCE : l'URL vitrine est mcp.oto.cx (coexistence multi-domaine,
// le backend accepte les deux audiences) tandis que l'audience OAuth du dashboard
// reste mcp.oto.ninja/mcp.
export const MCP_URL = (import.meta.env.VITE_MCP_PUBLIC_URL as string) || 'https://mcp.oto.cx/mcp'

// ── Billing / abonnement par org (ADR 0043) ──
export type BillingPlan = components['schemas']['Plan']
// ⚠️ ÉCRIT À LA MAIN — le contrat servi est plus LÂCHE que l'écran (`BillingStatus` :
//    plans: déclaré nullable ; plan: déclaré nullable ; currency: déclaré nullable ;
//    interval: déclaré nullable ; status: déclaré nullable ; status: `str` là où l'écran a
//    un ensemble fermé (active|canceled|failed|incomplete|past_due|pending) ; method:
//    déclaré nullable ; method: `str` là où l'écran a un ensemble fermé (card|comp|sepa)).
//    Le correctif est côté oto-backend — resserrer l'`Output` — puis `npm run api:refresh`
//    ici.
export interface BillingStatus {
  subscribed: boolean
  plans?: BillingPlan[]           // présent seulement si pas encore abonné
  plan?: string
  label?: string | null
  amount?: number | null          // prix du palier au catalogue, en centimes HORS TAXES
  currency?: string
  interval?: string
  // 'incomplete'|'active'|'past_due'|'canceled' = statut miroir ; 'pending'|'failed'
  // = états transitoires renvoyés par confirm (polling de l'intent/mandat).
  status?: 'incomplete' | 'active' | 'past_due' | 'canceled' | 'pending' | 'failed'
  method?: 'card' | 'sepa' | 'comp'
  comp?: boolean                  // abonnement forcé par un admin (non payé)
  current_period_end?: string | null
  next_billing_at?: string | null
  grace_until?: string | null
  canceled_at?: string | null
  // Décomposition de la PROCHAINE échéance (#486). ⚠️ Sur un abonnement offert
  // (comp), les cinq champs valent toujours `null` : rien n'y sera jamais prélevé.
  vat_rate_bps?: number | null
  vat_amount?: number | null
  amount_ttc?: number | null      // ce qui sera RÉELLEMENT prélevé, en centimes
  vat_scheme?: VatScheme | null
  vat_blocked?: VatBlocked | null
  // ── Ce qui est OFFERT, et ce qui est consommé (backend `billing_grants`) ──
  // Servis dans les DEUX branches, abonné ou non — et c'est tout le point : la
  // branche « pas d'abonnement » est justement celle qui vendait au bénéficiaire
  // d'un don ce qu'il possédait déjà. `[]` / `null` = rien à montrer.
  granted?: BillingGrant[]
  usage?: BillingUsage | null
}
export type BillingSubscribeResult = ApiOut<'billing_subscribe_post'>
export type BillingPayment = components['schemas']['Payment']

/** Une FACTURE — ou un AVOIR — émise pour un encaissement (oto-backend #488).
 *
 *  ⚠️ ÉCRIT À LA MAIN, mais **pas pour la raison des types juste au-dessus** : ici le
 *  contrat est parfaitement déclaré côté serveur, et servi en production. C'est le
 *  SNAPSHOT commité (`openapi/oto-openapi.json`) qui est antérieur au lot, et le
 *  rafraîchir emporterait tout le reste de la dérive accumulée — un `api:refresh`
 *  est un acte à part, dont le diff est l'information, jamais l'effet de bord d'un
 *  lot d'écran. Les champs ci-dessous ont été relevés un à un sur le document servi
 *  par un serveur vivant, pas recopiés d'une intention.
 *
 *  ⚠️ Une facture n'est PAS une tentative de paiement (ça, c'est `BillingPayment`) :
 *  c'est le document comptable, et c'est lui que les CGV promettent téléchargeable.
 *  Son numéro vient de Pennylane, qui porte la numérotation continue d'Otomata. */
export interface BillingInvoice {
  /** Identifiant local, celui qu'attend la route de téléchargement du PDF. */
  id: number
  /** ⚠️ Le serveur déclare `str` ; l'écran n'en connaît que deux valeurs. Un `kind`
   *  inconnu doit donc se lire comme une facture ordinaire, jamais faire disparaître
   *  la ligne : un document qu'on ne sait pas nommer reste un document dû. */
  kind: 'invoice' | 'credit_note'
  /** 'issued' = émis, numéroté, définitif. 'pending' = l'émission n'a pas encore
   *  abouti — **l'encaissement, lui, a bien eu lieu** et la facture est due ; elle
   *  est rejouée automatiquement. ⚠️ Un `pending` n'est jamais un paiement perdu, et
   *  la copie ne doit pas le laisser croire. */
  status: 'issued' | 'pending'
  /** Attribué par Pennylane à la finalisation. `null` tant que `status='pending'` :
   *  un numéro n'existe pas avant le document. */
  number?: string | null
  currency: string
  /** En CENTIMES. */
  amount_ht?: number | null
  vat_rate_bps?: number | null
  vat_amount?: number | null
  /** Ce qui a été réellement débité, en centimes. ⚠️ **NÉGATIF sur un avoir.** */
  amount_ttc?: number | null
  vat_scheme?: VatScheme | null
  period_start?: string | null
  period_end?: string | null
  /** Date PORTÉE par le document — celle de l'encaissement, pas celle de son
   *  émission technique. */
  issued_at?: string | null
  /** `false` avec `status='issued'` = document bien émis dont le fichier n'a pas
   *  encore été récupéré chez le fournisseur ; la reprise le fera. */
  has_pdf: boolean
  /** Chemin REST du PDF, à préfixer de la base d'API — **ce n'est pas une URL
   *  publique** : la route exige le même jeton que le reste de `/api/me`. `null`
   *  quand `has_pdf` est faux, et le serveur ne le sert QUE s'il y a quelque chose
   *  au bout : un lien vers une 404 se subit au clic. */
  pdf_path?: string | null
  /** Envoi au contact de facturation. `null` = non envoyé — le document reste
   *  téléchargeable, l'e-mail n'en conditionne rien. */
  emailed_at?: string | null
  created_at: string
}

/** Un avantage payant OFFERT par Otomata (don d'option, couche 3 d'ADR 0043).
 *
 *  ⚠️ ÉCRIT À LA MAIN, pour la même raison que `BillingStatus` juste au-dessus :
 *  `/api/me/billing` ne déclare pas d'`Output`, donc rien de tout cela n'existe
 *  dans le document OpenAPI et `api:gen` ne peut pas le dériver. Le correctif de
 *  fond est côté oto-backend (déclarer l'`Output`), puis `npm run api:refresh` ici.
 *  D'ici là le champ reste OPTIONNEL côté `BillingStatus`, avec sa conduite de
 *  repli à l'écran (`v-if`) : un backend antérieur ne sert rien, et l'écran se
 *  contente de ne pas afficher le bloc.
 *
 *  ⚠️ Purement DESCRIPTIF : il n'ouvre aucun droit, l'entitlement reste au serveur.
 *  Le backend ne rend que les options qui figurent dans un palier vendu — un
 *  drapeau de population n'a pas de prix, donc n'est jamais présenté comme un
 *  cadeau. */
export interface BillingGrant {
  option: string
  /** NOMME l'avantage. Il n'y a pas que la messagerie qui coûte : l'écran affiche
   *  ce libellé, jamais un « offert par Otomata » seul qui deviendrait faux le jour
   *  où un second avantage s'offre. */
  label: string
  detail: string | null
  /** 'org' = ouvert à toute l'organisation | 'user' = à CE compte, qui l'emporte
   *  avec lui dans toutes ses organisations. */
  scope: 'org' | 'user'
  granted_at: string | null
  /** `null` = sans terme. */
  expires_at: string | null
  /** `null` si sans terme. **NÉGATIF quand l'échéance est passée** : le serveur ne
   *  le borne pas à zéro exprès, un don échu doit se lire comme échu et non comme
   *  « expire aujourd'hui ». */
  days_left: number | null
  /** Centimes HORS TAXES — ce qu'il faudrait payer pour l'avoir (prix du palier le
   *  moins cher qui l'inclut). */
  value_amount: number | null
  currency: string | null
  interval: string | null
}

/** Les appels d'outil d'agent du MOIS EN COURS, et ce qui est inclus.
 *
 *  ⚠️ **Aucun ratio n'est servi, et aucun ne doit être calculé ici.** À une médiane
 *  de 25 appels sur 1000 inclus, une barre de progression ou un pourcentage dit
 *  « c'est gratuit et sans fin » — l'inverse exact de ce que ce bloc existe pour
 *  faire comprendre. On affiche le nombre et le plafond, jamais leur division ;
 *  `over` est le seul discriminant de ton.
 *
 *  ⚠️ Fenêtre = mois en cours SEULEMENT. La rétention du journal ne permet pas de
 *  comparaison au mois précédent : ne rien bâtir dessus. */
export interface BillingUsage {
  calls: number
  included: number
  period_start: string
  /** Servi par le serveur, jamais dérivé. N'entraîne AUCUN refus ni surfacturation :
   *  le dépassement s'affiche, il ne coupe pas. */
  over: boolean
}

// ── Identité de facturation, TVA et consentement d'achat (#486/#487, tunnel #128) ──
// Le régime fiscal servi par l'API. Le front ne le CALCULE pas : il l'affiche.
export type VatScheme = 'fr_ttc' | 'reverse_charge' | 'export'
// Pourquoi aucun régime n'est calculable — donc pourquoi il n'y a pas de TTC à
// annoncer. `vat_consumer_unsupported` (Union hors France sans n° de TVA) ferme la
// souscription en ligne : le guichet OSS n'est pas en place.
export type VatBlocked = 'billing_identity_required' | 'vat_consumer_unsupported'

export type BillingIdentity = components['schemas']['BillingIdentity']
/** L'identité, ce qui lui manque, et le régime qu'elle produirait. Forme COMMUNE à
 *  la lecture et à l'écriture : `set` rend l'état rafraîchi, pas un accusé. */
export type BillingIdentityView = ApiOut<'me_billing_identity_get_get'>
/** La fiche POSTÉE ENTIÈRE (la capacité remplace, elle ne fusionne pas). */
export type BillingIdentityInput = ApiIn<'me_billing_identity_set_put'>
/** Avancement du premier paiement — quatre branches discriminées par `status`,
 *  toutes en 200. ⚠️ `pending_mandate` = ENCAISSÉ, mandat pas encore né : une
 *  ATTENTE, jamais un échec (#127). */
export type BillingConfirmResult = ApiOut<'billing_confirm_post'>
export type LegalDocument = components['schemas']['LegalDocument']
export type LegalContext = components['schemas']['LegalContext']
export type LegalStatus = ApiOut<'me_legal_get_get'>

// Accepte les timestamps PG ("YYYY-MM-DD HH:MM:SS", UTC implicite) ET les ISO
// portant déjà un offset/Z (ex. granted_at = datetime.isoformat() → "…+00:00").
// On n'ajoute "Z" que si la chaîne n'a pas déjà de zone, sinon "…+00:00Z" = invalide.
function parseTs(iso: string): Date {
  const s = iso.replace(' ', 'T')
  return new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + 'Z')
}
export function fmtDate(iso: string | null | undefined): string | null {
  return iso ? parseTs(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
}
export function fmtDateTime(iso: string | null | undefined): string | null {
  return iso ? parseTs(iso).toLocaleString('en-US') : null
}

/** Une date FRANÇAISE avec son JOUR — « 31 octobre 2026 ».
 *
 *  Distincte de `fmtDate`, qui rend « Oct 2026 » (en-US, mois + année) et reste
 *  telle quelle pour les usages où seul le mois compte. Pour une ÉCHÉANCE, le jour
 *  EST l'information : « offert jusqu'à Oct 2026 » ne dit pas à un bénéficiaire
 *  s'il lui reste un jour ou trente. */
export function fmtDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = parseTs(iso)
  const s = d.toLocaleDateString('fr-FR',
    { day: 'numeric', month: 'long', year: 'numeric' })
  // En français, seul le premier du mois s'ordinalise (« 1er octobre ») ; les autres
  // restent cardinaux. `Intl` ne le fait pas et rend « 1 octobre » — or le début de
  // période d'usage tombe TOUJOURS un 1er, donc la faute se lirait tous les mois.
  return d.getDate() === 1 ? s.replace(/^1\b/, '1er') : s
}

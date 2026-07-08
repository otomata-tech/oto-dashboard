// Contrat d'UNIFICATION de la gestion des connecteurs (ADR 0022/0038/0044).
//
// Une seule vue `ConnectorScopeView` rend les QUATRE surfaces (user/team/org/
// plateforme) ; ce qui change d'un scope à l'autre est encapsulé dans un
// ADAPTATEUR. Le socle (liste `ConnectorList` + drawer `ConnectorModal`) est
// réutilisé tel quel. Les leviers sont OPTIONNELS : un levier absent ⇒ colonne/
// onglet non rendu (règle DESIGN.md « jamais de levier inerte » — on omet, on ne
// grise pas). Les écritures restent divergentes par scope : chaque adaptateur
// mappe les mêmes opérations vers les bonnes fonctions `api/console.ts`.
import type { Ref } from 'vue'
import type {
  ConnectorMeta, CredentialField, VerifyResult,
  ConnectorFieldSchema, FieldRule, FieldFilterTemplate, FieldActionSchema,
  EmailBlock, QuietHours,
} from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'
import type { FormDialogConfig } from '@/composables/useFormDialog'
import type { ConfirmConfig } from '@/composables/usePrompt'

export type ConnectorScope = 'user' | 'team' | 'org' | 'platform'
export type TagTone = 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'

// View-model d'une cellule de colonne (une surface décide dot/tag/label/sub, le
// template de ligne partagé les rend sans logique par-scope).
export interface CellVM {
  dot?: DotTone
  tag?: { tone?: TagTone; text: string }
  label?: string
  sub?: string
  muted?: boolean
}

export interface Column { key: string; label: string; width?: string; num?: boolean }
export interface DrawerTab { key: string; label: string; badge?: string }

// ── leviers (tous optionnels) ────────────────────────────────────────────────

// Disponibilité : 4 variantes de contrôle selon le scope.
//  exposure3 (user) : off/muted/live · binary (org, team) : coupé/dispo ·
//  master (plateforme) : master switch · readonly : statut hérité, pas de contrôle.
export type AvailabilityVariant = 'exposure3' | 'binary' | 'master' | 'readonly'
export type ExposureState = 'off' | 'muted' | 'live'
export interface AvailabilityState {
  label: string
  tone: DotTone
  on: boolean
  muted?: boolean
  exposure?: ExposureState   // renseigné en variant exposure3
  note?: string              // ex. « borné par l'org » / « hérité de l'org »
}
export interface AvailabilityLever<R> {
  variant: AvailabilityVariant
  title: string
  state(r: R): AvailabilityState
  canEdit(r: R): boolean
  set(r: R, next: boolean | ExposureState): Promise<void>
}

// Credential = l'instance possédée à CE scope (clé perso/équipe/org/plateforme).
export interface CredentialState { present: boolean; label: string; sub?: string }
// Item d'une instance multi-clés (plateforme : N clés/labels par provider).
export interface CredentialItem { key: string; label: string; sub?: string }
export interface CredentialLever<R> {
  title: string
  state(r: R): CredentialState
  canEdit(r: R): boolean
  edit(r: R): void            // ajoute/rotate (ouvre FormDialog ou CredentialFieldsDialog)
  remove?(r: R): void         // retrait single-instance
  verify?(r: R): Promise<VerifyResult>
  // multi-instance (plateforme). Si `items` présent, le panneau liste ces items
  // (chacun retirable via `removeItem`) + un bouton « ajouter » (edit). Sinon single.
  items?(r: R): CredentialItem[]
  removeItem?(r: R, key: string): void
}

// Accès (RBAC connecteur, ADR 0025 — org : réserver à des principals ; team B2 à venir).
export interface AclPrincipal { type: string; id: string; label: string }
export interface AccessLever<R> {
  restricted(r: R): boolean
  principals(r: R): AclPrincipal[]
  canEdit(r: R): boolean
  add(r: R): void
  remove(r: R, type: string, id: string): void
  force?(r: R): void          // pousser le connecteur à un membre (org)
}

// Rédaction de champs (org) : props typées pour `ConnectorTransforms`, montées par le drawer.
export interface RedactionPanel {
  service: string
  fields: ConnectorFieldSchema[]
  rules: FieldRule[]
  defaultRules: FieldRule[]
  templates?: Record<string, FieldFilterTemplate>
  actionSchema: FieldActionSchema[]
  customized: boolean
  orgId: number | null
  isOrgAdmin: boolean
}
export interface RedactionLever<R> { props(r: R): RedactionPanel; onChanged(): void }

// Email par connecteur (org, connecteurs d'envoi) : props typées pour `ConnectorEmail`.
export interface EmailPanel {
  connector: string
  block: EmailBlock | null
  transport: string
  quietDefault: QuietHours
  resendKeySet: boolean
  orgId: number
  isOrgAdmin: boolean
}
export interface EmailLever<R> { visible(r: R): boolean; props(r: R): EmailPanel; onChanged(): void }

// L'adaptateur : tout ce dont `ConnectorScopeView` a besoin, dérivé du scope.
export interface ConnectorScopeAdapter<R = unknown> {
  scope: ConnectorScope
  // données
  rows: Ref<R[]>
  ready: Ref<boolean>
  error: Ref<string | null>
  load(): Promise<void>
  reload(): Promise<void>
  // présentation liste
  listTitle: string
  listSub: string
  searchPlaceholder?: string
  emptyText: string
  key(r: R): string
  meta(r: R): ConnectorMeta | undefined
  label(r: R): string
  category(r: R): string
  searchText(r: R): string
  sortRank(r: R): number
  categoryValues?(): string[]
  columns: Column[]
  cell(r: R, colKey: string): CellVM | undefined
  // drawer
  hasDrawer: boolean
  tabs(r: R): DrawerTab[]
  // leviers (absents ⇒ colonne/onglet non rendu)
  availability?: AvailabilityLever<R>
  credential?: CredentialLever<R>
  access?: AccessLever<R>
  redaction?: RedactionLever<R>
  email?: EmailLever<R>
}

// Édition d'un credential = formulaire dynamique `CredentialFieldsDialog` (vee-validate),
// distinct du FormDialog. La vue héberge le dialog, l'adaptateur l'ouvre via `openCredential`.
export interface CredentialDialogSpec {
  label: string
  fields: CredentialField[]
  single: boolean
  onConfirm: (values: Record<string, string>) => Promise<void>
  verify?: () => Promise<VerifyResult>
}

// Services partagés injectés par la vue (une seule instance de FormDialog / prompt /
// toast / CredentialFieldsDialog rendue par `ConnectorScopeView`, réutilisée par
// l'adaptateur actif).
export interface ScopeCtx {
  openForm: (spec: FormDialogConfig) => void
  openCredential: (spec: CredentialDialogSpec) => void
  confirmAction: (spec: ConfirmConfig) => Promise<boolean>
  toast: (msg: string) => void
}

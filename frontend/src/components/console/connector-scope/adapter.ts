// Contrat d'UNIFICATION de la gestion des connecteurs (ADR 0022/0038/0044).
//
// Une seule vue `ConnectorScopeView` rend les TROIS surfaces (user/org/
// plateforme) ; ce qui change d'un scope à l'autre est encapsulé dans un
// ADAPTATEUR. Le socle (liste `ConnectorList` + drawer `ConnectorModal`) est
// réutilisé tel quel. Les leviers sont OPTIONNELS : un levier absent ⇒ colonne/
// onglet non rendu (règle DESIGN.md « jamais de levier inerte » — on omet, on ne
// grise pas). Les écritures restent divergentes par scope : chaque adaptateur
// mappe les mêmes opérations vers les bonnes fonctions `api/console.ts`.
import type { Ref } from 'vue'
import type {
  ConnectorMeta, CredentialField, DocSection, VerifyResult,
  ConnectorFieldSchema, FieldRule, FieldActionSchema,
} from '@/types/api'
import type { DotTone } from '@/lib/consoleTypes'
import type { FormDialogConfig } from '@/composables/useFormDialog'
import type { ConfirmConfig } from '@/composables/usePrompt'

export type ConnectorScope = 'user' | 'org' | 'platform' | 'team'
export type TagTone = 'olive' | 'saffron' | 'terra' | 'cobalt' | 'ink'

// View-model d'une cellule de colonne (une surface décide dot/tag/label/sub, le
// template de ligne partagé les rend sans logique par-scope).
export interface CellVM {
  dot?: DotTone
  tag?: { tone?: TagTone; text: string }
  label?: string
  sub?: string
  muted?: boolean
  bar?: { pct: number }   // barre de progression (ex. outils actifs/total, scope user)
  badge?: { tone?: TagTone; text: string }   // badge APRÈS le libellé (provenance, scope user)
}

export interface Column { key: string; label: string; width?: string; num?: boolean }
export interface DrawerTab { key: string; label: string; badge?: string }
// Lentille = pré-filtre optionnel (segmented au-dessus de la liste) — spécificité USER
// (all/connected/available/shared). La vue en dérive les compteurs + filtre les lignes.
export interface Lens<R> { key: string; label: string; match(r: R): boolean }

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
  // `account` (comptes nommés au palier org) : la sonde vise CETTE instance ; sans lui,
  // la ligne anonyme — qui n'existe plus dès le premier compte nommé.
  verify?(r: R, account?: string): Promise<VerifyResult>
  // « tester » est un POST sans `op` : en consultation, le serveur le refuse comme une écriture
  // (oto#211). Le levier dit s'il l'offre ; absent, il est offert dès qu'une clé est posée.
  canVerify?(r: R): boolean
  // multi-instance (plateforme). Si `items` présent, le panneau liste ces items
  // (chacun retirable via `removeItem`) + un bouton « ajouter » (edit). Sinon single.
  items?(r: R): CredentialItem[]
  removeItem?(r: R, key: string): void
  // Geste hors formulaire qui COMPLÈTE le credential — un consentement OAuth ne se
  // colle pas dans un champ. Sans lui, une surface peut faire POSER les prérequis
  // sans laisser les activer : c'est l'état dans lequel /org/connectors a laissé un
  // org_admin le 02/08, application enregistrée et aucun bouton pour consentir.
  connect?: ConnectCta<R>
  // Comptes NOMMÉS au palier de CE levier (#121) — une clé PayFit par société d'un
  // groupe. Même geste que `ConnectionLever.addAccount` (le dialogue est commun,
  // `addAccount.ts`) ; `accountScope` dit à quel palier la liste servie se lit et se
  // retire. Absents = ce scope ne gère pas de comptes nommés : ni liste ni ajout.
  accountScope?: 'org'
  addAccount?(r: R, existing: string[]): void
}

export interface ConnectCta<R> {
  label(r: R): string           // libellé DÉCLARÉ par le connecteur, jamais écrit ici
  available(r: R): boolean      // ce geste a un sens pour cette ligne
  start(r: R): Promise<void>
}

// Accès PLATEFORME (ADR 0044 §H, scope plateforme) : « qui, au niveau plateforme, a
// droit à ce connecteur » = grant de clé (couche 2) ∪ option comp (couche 3), en un acte.
// Le panneau est autonome (fetch/grant/revoke via l'API) ; le levier ne porte que le
// provider ciblé + le droit d'écrire (super_admin).
export interface PlatformAccessLever<R> {
  provider(r: R): string
  isSuperAdmin: boolean
}

// Rédaction de champs : props typées pour `ConnectorTransforms`, montées par le drawer.
// Lecture seule depuis oto#192 : la règle et le banc de test ont quitté le dashboard.
export interface RedactionPanel {
  service: string
  fields: ConnectorFieldSchema[]
  rules: FieldRule[]
  actionSchema: FieldActionSchema[]
  customized: boolean
  orgId: number | null
  scopeNote?: 'personal' | 'org-wide' | 'readonly'
}
export interface RedactionLever<R> { props(r: R): RedactionPanel; onChanged(): void }

// Connexion (USER) : la couche d'authentification (ADR 0024) — widgets dérivés de la
// méthode d'auth (clé/oauth/session/hosted/fédéré). Le panneau lit lui-même l'état résolu
// (`me.providers`) ; l'adaptateur ne porte que les ACTIONS de la clé keyée.
export interface ConnectionLever<R> {
  configureKey(r: R): void   // ouvre CredentialFieldsDialog (clé keyée)
  // Multi-compte (#121) : poser un compte NOMMÉ de plus, à côté de l'existant — un
  // second workspace Slack, une seconde organisation Zoho. `existing` = les comptes
  // déjà posés (le dialog refuse un doublon avant l'aller-retour serveur). Absent =
  // ce scope ne sait pas encore ajouter un compte ; l'écran n'affiche alors rien.
  // Le même geste existe au palier org (`CredentialLever.addAccount`).
  addAccount?(r: R, existing: string[]): void
  // `note` = phrase honnête sur le relais (calculée par la pile : ce qui prendrait
  // la suite, ou l'avertissement « rien ne prendra le relais ») — CDC P8.
  removeKey(r: R, note?: string): void
  verify?(r: R): Promise<VerifyResult>
}

// Outils (USER) : la liste des outils d'un connecteur et leur état, en lecture — masquer un
// outil a quitté le dashboard (oto#192).
export interface ToolsLever<R> {
  list(r: R): ToolRow[]
}
export interface ToolRow { name: string; enabled: boolean; protected?: boolean; description?: string }

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
  lenses?: Lens<R>[]        // pré-filtres segmentés (USER) ; absent ⇒ pas de segmented
  columns: Column[]
  cell(r: R, colKey: string): CellVM | undefined
  // badge de la fiche, dans son en-tête (ex. provenance de l'installation) ; absent ⇒ rien
  badge?(r: R): { tone?: TagTone; text: string } | null
  // drawer
  hasDrawer: boolean
  tabs(r: R): DrawerTab[]
  // leviers (absents ⇒ colonne/onglet non rendu)
  availability?: AvailabilityLever<R>
  credential?: CredentialLever<R>
  platformAccess?: PlatformAccessLever<R>
  redaction?: RedactionLever<R>
  connection?: ConnectionLever<R>
  tools?: ToolsLever<R>
}

// Édition d'un credential = formulaire dynamique `CredentialFieldsDialog` (vee-validate),
// distinct du FormDialog. La vue héberge le dialog, l'adaptateur l'ouvre via `openCredential`.
export interface CredentialDialogSpec {
  label: string
  fields: CredentialField[]
  single: boolean
  // `values` porte les champs déclarés ; `account` le NOM du compte visé quand le
  // connecteur en gère plusieurs ('' = le compte mono historique).
  onConfirm: (values: Record<string, string>, account: string) => Promise<void>
  // Sonde après la pose ; reçoit le NOM du compte que la pose vient d'écrire (multi-compte),
  // pour viser cette instance-là et non la ligne anonyme.
  verify?: (account: string) => Promise<VerifyResult>
  // Multi-compte (oto-dashboard#121) — le GESTE dit quoi faire du nom, jamais une
  // heuristique du dialog :
  //  · 'none'  = pose ordinaire (premier credential, ou connecteur mono-compte) —
  //              aucun champ, aucune friction ajoutée ;
  //  · 'new'   = on AJOUTE un compte à côté d'un existant — le nom est obligatoire,
  //              parce que le serveur refuse une seconde pose anonyme (il migre la
  //              ligne anonyme vers un libellé au premier compte nommé) ;
  //  · 'fixed' = on repose SUR un compte donné (remplacer) — pas de champ, `account`
  //              est transmis tel quel.
  accountMode?: 'none' | 'new' | 'fixed'
  account?: string            // 'fixed' : le compte visé
  accountNoun?: string        // le mot du fournisseur, servi par le registre
  accountNames?: string[]     // déjà posés — refuser un doublon à la saisie
  // Le champ dont la valeur SÉLECTIONNE les autres (`auth_mode` chez `http`), déclaré
  // par le connecteur (`auth.field_discriminator`) — le dialogue n'affiche alors que
  // les champs que ce mode rend pertinents (oto-dashboard#126).
  fieldDiscriminator?: string
  // Ce qui est déjà au coffre à ce palier, pour pré-remplir : les champs révélables
  // seulement. Un secret ne se relit jamais, à aucun palier.
  initialValues?: Record<string, string>
  // Un credential existe-t-il déjà ici ? Un champ secret laissé vide est alors OMIS
  // du corps — le serveur conserve ce qu'il a. À ne pas poser sur un connecteur à clé
  // unique : il n'y a rien à y conserver, la reposer, c'est la retaper.
  existing?: boolean
  // La doc « how-to » du connecteur (prérequis + mise en route), rendue DANS le
  // dialogue : c'est là qu'on colle, donc là qu'il faut savoir quoi créer et où.
  docs?: DocSection[]
  // Le PALIER que cette pose vise ('member' par défaut). Le dialogue le DIT :
  // « tes identifiants … utilisés pour agir en ton nom » et « la clé de ton org,
  // héritée par tous tes membres » ne se relisent pas pareil, et jusqu'ici les
  // surfaces org et équipe servaient la première phrase pour poser la seconde clé.
  // Ce n'est pas un réglage offert à l'utilisateur : le geste sait déjà où il pose.
  scope?: 'member' | 'group' | 'org'
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

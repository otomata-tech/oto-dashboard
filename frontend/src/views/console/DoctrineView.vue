<script setup lang="ts">
// Écran procédures (ADR 0014, unbundle 2026-07) : les procédures de l'org (ex-skills /
// doctrines nommées) comme objets structurés et vivants — en-tête + résumé · content
// markdown à chips d'outils · manifeste « outils référencés » résolu contre le registre ·
// gouvernance (usage + versions). L'ex-« doctrine de base » N'EST PAS une procédure :
// c'est l'agent readme (injecté à chaque session), édité sur /org (org) et /account (user).
// LECTURE SEULE depuis oto#192 (12/09/2026) : créer, publier une version, restaurer, supprimer
// et publier en bibliothèque ont quitté l'écran (0 écriture en 45 jours, 32 lectures) — une
// procédure s'écrit par l'agent (`oto_procedure`). Reste le partage, geste d'administration.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getDoctrine, getGuideById, getInstruction, getInstructionVersions, getToolRegistry, getInstructionUsage, getOrg,
} from '@/api/console'
import type { DoctrineBundle, GuideById, InstructionUsage, InstructionVersion, OrgMember } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { accountLabel } from '@/lib/accountLabel'
import {
  procedureRefusal, procedureTarget, targetKey, type ProcedureRefusal, type ProcedureTarget,
} from '@/lib/procedureTarget'
import { buildReg, hasDead, refNames, type ToolReg } from '@/components/console/doctrine/tools'
import DoctrineContent from '@/components/console/doctrine/DoctrineContent.vue'
import ReferencedTools from '@/components/console/doctrine/ReferencedTools.vue'
import UsageCard from '@/components/console/doctrine/UsageCard.vue'
import RunnerTriggersCard from '@/components/console/RunnerTriggersCard.vue'
import SharePrincipalDialog from '@/components/console/SharePrincipalDialog.vue'

const router = useRouter()

const bundle = ref<DoctrineBundle | null>(null)
const reg = ref<ToolReg>(new Map())
// Procédure active portée par le CHEMIN `/procedures/:id` (URL = source de vérité,
// ADR 0032 — « stop using slug »). Le paramètre est un id OU un slug (back-compat des
// liens/bookmarks slug + `?doc=`). Sa résolution — liste, lecture par id, ou refus dit —
// vit dans `lib/procedureTarget.ts` et ne substitue JAMAIS une autre procédure (oto#201).
// Sans paramètre : la première procédure, puis l'URL normalisée vers son id.
const route = useRoute()
const routeParam = computed<string | null>(() => {
  const p = route.params.id
  if (typeof p === 'string' && p) return p
  const q = route.query.doc
  return typeof q === 'string' && q ? q : null
})
const target = ref<ProcedureTarget>({ kind: 'first' })
const listed = computed(() => target.value.kind === 'listed')
// La procédure lue par son id quand elle n'est pas dans la liste (autre équipe, partage).
const outside = ref<GuideById | null>(null)
const opening = ref(false)
// Ce qui a empêché d'ouvrir la procédure DEMANDÉE — rien ne s'affiche à sa place.
const refus = ref<ProcedureRefusal | null>(null)
watch(routeParam, () => {
  if (!bundle.value) return   // `loadAll` lira le paramètre courant quand la liste arrive
  const t = procedureTarget(routeParam.value, docs.value)
  if (targetKey(t) !== targetKey(target.value)) void open(t)
})
const body = ref('')           // corps publié (lecture)
const saved = ref('')          // corps affiché
const summary = ref('')        // description = résumé
const versions = ref<InstructionVersion[]>([])
const usage = ref<InstructionUsage | null>(null)
const usageLoading = ref(false)
const shareOpen = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const bodyCache = reactive<Record<string, string>>({})
// Roster de l'org consultée (bundle.org_id, ADR 0023) — résout `set_by` (un sub) en
// nom/email dans l'historique des versions (oto-dashboard#143). `org.get` est ouvert
// à tout membre de l'org, pas seulement à un admin : aucun appel au-delà de ceux que
// cet écran fait déjà pour son propre contenu.
const orgMembers = ref<OrgMember[]>([])
async function loadOrgMembers(orgId: number) {
  try { orgMembers.value = (await getOrg(orgId)).members ?? [] }
  catch { orgMembers.value = [] }
}
function authorLabel(v: InstructionVersion): string {
  return accountLabel(v.set_by, orgMembers.value)
}

// `canAdmin` (droit d'ADMINISTRER) gouverne le seul geste qui reste ici : partager à un tiers.
const canAdmin = computed(() => bundle.value?.can_edit ?? false)
const noOrg = computed(() => bundle.value?.org_id == null)

// Les procédures de l'org (l'agent readme n'en fait pas partie).
const docs = computed(() =>
  (bundle.value?.instructions ?? []).map((i) => ({
    id: i.id, slug: i.slug, title: i.title,
    description: i.description, version: i.version, exists: true,
  })))
// La procédure affichée : prise dans la liste (cache), ou lue par son id — jamais une autre.
const activeDoc = computed(() => {
  const t = target.value
  if (t.kind === 'listed') return docs.value.find((d) => d.id === t.id)
  const g = outside.value
  if (t.kind !== 'by-id' || !g) return undefined
  return { id: t.id, slug: g.slug ?? '', title: g.title ?? '', description: g.description ?? '', version: g.version ?? 0, exists: true }
})
const activeSlug = computed(() => activeDoc.value?.slug ?? '')
const curVersion = computed(() => activeDoc.value?.version ?? 0)

// Aperçu d'une ANCIENNE version : on LIT une version de l'historique. `viewing` = version consultée (null = la version courante).
const viewing = ref<number | null>(null)
const viewingBody = ref('')
const viewLoading = ref(false)
async function viewVersion(v: number) {
  if (v === curVersion.value) { viewing.value = null; return }
  viewLoading.value = true
  try {
    const doc = await getInstruction(activeSlug.value, v)
    viewingBody.value = doc.body_md
    viewing.value = v
  } catch (e) { refus.value = procedureRefusal(`« ${activeSlug.value} » v${v}`, e) }
  finally { viewLoading.value = false }
}
function backToCurrent() { viewing.value = null; viewingBody.value = '' }

const deadRefs = computed(() => refNames(saved.value).filter((n) => !reg.value.has(n)))

// pastille de drift par procédure (depuis le corps en cache si visitée).
function docDot(slug: string): string {
  const b = bodyCache[slug]
  return b !== undefined && hasDead(reg.value, b) ? 'var(--color-terra)' : 'var(--color-olive)'
}

async function loadAll() {
  loading.value = true
  error.value = null
  try {
    const [b, r] = await Promise.all([getDoctrine(), getToolRegistry().catch(() => ({ tools: [] }))])
    bundle.value = b
    reg.value = buildReg(r.tools)
    if (b.org_id != null) void loadOrgMembers(b.org_id)
    await open(procedureTarget(routeParam.value, docs.value))
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loading.value = false
  }
}
onMounted(loadAll)

// Choisir dans la liste = changer d'adresse ; le `watch` ouvre ce que l'adresse demande.
// Préfixe de consultation de l'URL courante (`/o/:orgId[/g/:groupId]/…`) conservé —
// sinon la garde routeur re-préfixe à chaque sélection (navigation dupliquée) ou
// l'équipe consultée tombe de l'URL.
function pick(id: number) {
  const o = route.params.orgId, g = route.params.groupId
  const to = `${o ? `/o/${o}${g ? `/g/${g}` : ''}` : ''}/procedures/${id}`
  if (route.path !== to) void router.replace(to)
}

// Jeton de la dernière ouverture : une réponse arrivée après un changement d'adresse
// n'écrase pas la procédure que l'adresse demande désormais.
let seq = 0
async function open(requested: ProcedureTarget) {
  const mine = ++seq
  const first = docs.value[0]
  const t: ProcedureTarget = requested.kind === 'first' && first
    ? { kind: 'listed', id: first.id, slug: first.slug }   // l'entrée du menu, par choix
    : requested
  target.value = t
  outside.value = null
  refus.value = null
  summary.value = activeDoc.value?.description ?? ''
  body.value = ''
  saved.value = ''
  versions.value = []
  viewing.value = null
  viewingBody.value = ''
  usage.value = null
  if (t.kind === 'listed') {
    pick(t.id)   // un slug ou l'absence de paramètre se normalisent vers l'id
    await openListed(t.slug, mine)
  } else if (t.kind === 'by-id') {
    await openById(t.id, mine)
  } else if (t.kind === 'unknown') {
    refus.value = { what: `« ${t.raw} »`, code: null, detail: 'aucune procédure de ce nom parmi celles listées ici.' }
  }
}

async function openListed(slug: string, mine: number) {
  usageLoading.value = true
  try {
    const doc = await getInstruction(slug)
    if (mine !== seq) return
    body.value = doc.body_md
    saved.value = doc.body_md
    summary.value = doc.description ?? ''
    bodyCache[slug] = doc.body_md
    const v = (await getInstructionVersions(slug).catch(() => ({ versions: [] }))).versions
    if (mine === seq) versions.value = v
  } catch (e) {
    if (mine === seq) refus.value = procedureRefusal(`« ${slug} »`, e)
  }
  try {
    const u = await getInstructionUsage(slug)
    if (mine === seq) usage.value = u
  } catch {
    if (mine === seq) usage.value = null
  } finally {
    if (mine === seq) usageLoading.value = false
  }
}

async function openById(id: number, mine: number) {
  opening.value = true
  try {
    const g = await getGuideById(id)
    if (g.guide_id !== id) throw new Error(`le serveur a rendu la procédure #${g.guide_id}`)
    if (mine !== seq) return
    outside.value = g
    body.value = g.body_md ?? ''
    saved.value = g.body_md ?? ''
    summary.value = g.description ?? ''
  } catch (e) {
    if (mine === seq) refus.value = procedureRefusal(`#${id}`, e)
  } finally {
    if (mine === seq) opening.value = false
  }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="err">{{ error }}</p>

    <!-- vide / pas d'org (sans procédure demandée : un lien, lui, s'ouvre quand même) -->
    <div v-if="noOrg && !loading && target.kind === 'first'" class="empty-state">
      <span class="o-medallion o-medallion-lg">o</span>
      <div class="empty-title">aucune procédure <span class="squiggle">encore</span>.</div>
      <div class="empty-sub">
        les procédures sont rattachées à votre organisation active. rejoignez ou basculez sur une org pour les consulter.
      </div>
    </div>

    <!-- org sans procédure : dire qui l'écrit -->
    <div v-else-if="!loading && target.kind === 'first' && !docs.length" class="empty-state">
      <span class="o-medallion o-medallion-lg">o</span>
      <div class="empty-title">aucune procédure <span class="squiggle">encore</span>.</div>
      <div class="empty-sub">
        une procédure = un déroulé opératoire nommé que l'agent charge à la demande.
        votre agent l'écrit pour vous (<code>oto_procedure</code>).
        <br />l'agent readme (injecté à chaque session), lui, s'édite sur
        <RouterLink to="/org">/org</RouterLink> et <RouterLink to="/account">/account</RouterLink>.
      </div>
    </div>

    <div v-else-if="!loading" class="doc-grid">
      <!-- ─────── colonne gauche ─────── -->
      <div class="col">
        <!-- la procédure demandée ne s'ouvre pas : le dire, avec le code, et rien à sa place (oto#201) -->
        <div v-if="refus" class="card proc-refus" role="alert">
          <div class="proc-refus__t">impossible d'ouvrir la procédure {{ refus.what }}</div>
          <code v-if="refus.code" class="proc-refus__code">{{ refus.code }}</code>
          <div v-if="refus.detail" class="proc-refus__d">{{ refus.detail }}</div>
        </div>
        <p v-else-if="opening" class="dim">chargement de la procédure…</p>

        <!-- bandeau dead-ref -->
        <div v-if="deadRefs.length" class="warn">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-terra)" stroke-width="1.9"
            stroke-linecap="round" stroke-linejoin="round" class="warn__i"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
          <div class="warn__t">
            <strong>{{ deadRefs.length }} référence{{ deadRefs.length > 1 ? 's' : '' }} d'outil non résolue{{ deadRefs.length > 1 ? 's' : '' }}</strong>
            — <code>{{ deadRefs[0] }}</code> n'existe plus dans le registre. l'agent garde le contexte, mais l'appel
            échouera en silence. corrigez la référence depuis votre agent (<code>oto_procedure</code>).
          </div>
        </div>

        <template v-if="activeDoc">
          <!-- ZONE 1 · en-tête -->
          <div class="card hdr">
            <div class="hdr__tags">
              <span class="tag tag--skill">procédure</span>
              <span v-if="curVersion" class="tag tag--ver">v{{ curVersion }}</span>
              <span class="slug">{{ activeDoc.slug }}</span>
              <button v-if="canAdmin && listed && activeDoc.id > 0"
                type="button" class="btn-edit" @click="shareOpen = true">
                Partager
              </button>
            </div>

            <div class="hdr__title">{{ activeDoc.title }}</div>

            <div class="hdr__eyebrow">
              <span class="squiggle-sm">résumé</span>
              <span class="hdr__hint">— ce que fait ce process, et quand le charger</span>
            </div>
            <div class="hdr__summary">{{ summary || '—' }}</div>

            <div class="hdr__meta">
              <span v-if="listed">chargée {{ usage?.count ?? 0 }}×</span>
              <span v-else>hors de ta liste de procédures — versions et usage non affichés ici</span>
            </div>
          </div>

          <!-- ZONE 2 · content -->
          <div v-if="!refus" class="card">
            <div class="card__head">
              <span class="eyebrow">content</span>
              <span class="dim">markdown</span>
            </div>

            <div v-if="viewing !== null" class="vbanner">
              <span>Tu consultes la version <strong>v{{ viewing }}</strong> — lecture seule.</span>
              <button type="button" class="btn-ghost-xs" @click="backToCurrent">Revenir à l'actuelle</button>
            </div>
            <DoctrineContent :text="viewing !== null ? viewingBody : saved" :reg="reg" />
          </div>

          <!-- ZONE 3 · outils référencés -->
          <ReferencedTools v-if="!refus" :text="saved" :reg="reg" />
        </template>
      </div>

      <!-- ─────── colonne droite ─────── -->
      <div class="col">
        <!-- procédures -->
        <div v-if="docs.length" class="card pad-sm">
          <div class="card__head">
            <span class="eyebrow">procédures</span>
          </div>
          <div class="doclist">
            <button v-for="d in docs" :key="d.slug" type="button" class="docrow"
              :class="{ on: listed && d.id === activeDoc?.id }" @click="pick(d.id)">
              <div class="docrow__top">
                <span class="docrow__dot" :style="{ background: docDot(d.slug) }" />
                <span class="docrow__title">{{ d.title }}</span>
                <span class="docrow__v">v{{ d.version }}</span>
              </div>
              <div class="docrow__bot">
                <span class="docrow__slug">{{ d.slug }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- usage, déclencheurs et versions se lisent par slug DANS le palier actif : pour une
             procédure hors liste, ce slug désignerait un homonyme, ou rien — ils sont omis. -->
        <UsageCard v-if="listed" :usage="usage" :loading="usageLoading" />

        <!-- Agent programmé (#860 ①) — « celle-ci tourne-t-elle toute seule ? ».
             L'agent autonome est une PROPRIÉTÉ de l'objet, pas un objet déclaré à
             côté : il se lit donc DEPUIS l'objet, filtré côté serveur sur cette
             procédure. Ne se monte que sur une procédure qui EXISTE — un
             déclencheur ne peut pas pointer un slug qui n'a pas encore de corps. -->
        <RunnerTriggersCard v-if="listed && activeDoc" :key="activeSlug"
                            :procedure="activeSlug" />

        <!-- versions -->
        <div v-if="listed" class="card pad-sm">
          <span class="eyebrow">versions</span>
          <div class="vlist">
            <div v-for="v in versions" :key="v.version" class="vrow">
              <span class="vrow__dot" :class="{ cur: v.version === curVersion }" />
              <span class="vrow__v">v{{ v.version }}</span>
              <div class="vrow__meta">{{ authorLabel(v) }} · {{ fmtDate(v.created_at) }}</div>
              <span v-if="v.version === curVersion" class="tag tag--ver">actuelle</span>
              <template v-else>
                <button type="button" class="btn-ghost-xs" :disabled="viewLoading"
                  @click="viewVersion(v.version)">Voir</button>
              </template>
            </div>
            <div v-if="!versions.length" class="dim">aucun historique.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Partage ciblé d'une procédure (oto_resource, modèle licence → lecture seule).
         Le destinataire lit cross-org par id (oto_get_doctrine doctrine_id). -->
    <SharePrincipalDialog v-if="listed && activeDoc && activeDoc.id > 0" :open="shareOpen"
      resource-type="doctrine" :resource-id="String(activeDoc.id)"
      :resource-label="activeDoc.title" :roles="['viewer']" @close="shareOpen = false" />
  </div>
</template>

<style scoped>
.err { color: var(--color-terra-ink); font-size: 13px; }
.doc-grid { max-width: 1280px; margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) 322px; gap: 18px; align-items: start; }
@media (max-width: 1120px) { .doc-grid { grid-template-columns: 1fr; } }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 14px; padding: 18px 20px; }
.card.hdr { padding: 20px 22px; }
.card.pad-sm { padding: 16px 17px; }
.card__head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.eyebrow { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-mute); }
.dim { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); }

/* refus d'ouverture (oto#201) */
.proc-refus { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; background: var(--color-terra-soft); border-color: var(--color-terra); }
.proc-refus__t { font-size: 14px; font-weight: 700; color: var(--color-terra-ink); }
.proc-refus__code { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-terra-ink); }
.proc-refus__d { font-size: 12.5px; line-height: 1.55; color: var(--color-terra-ink); }

/* en-tête */
.hdr__tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hdr__title { font-size: 23px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; color: var(--color-ink); margin-top: 13px; }
.hdr__eyebrow { display: flex; align-items: center; gap: 8px; margin-top: 14px; margin-bottom: 7px; }
.hdr__hint { font-family: var(--font-mono); font-size: 9.5px; color: var(--color-faint); }
.hdr__summary { font-size: 16.5px; font-style: italic; font-weight: 500; line-height: 1.5; color: var(--color-ink-soft); text-wrap: pretty; max-width: 60ch; }
.hdr__meta {
  display: flex; align-items: center; gap: 8px; margin-top: 15px; padding-top: 13px;
  border-top: 1px solid var(--color-hair-soft); font-family: var(--font-mono); font-size: 10.5px; color: var(--color-faint);
}

/* tags */
.tag { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 2.5px 9px; border-radius: 999px; }
.tag--skill { background: var(--color-cobalt-soft); color: var(--color-cobalt-ink); }
.tag--ver { background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.slug { font-family: var(--font-mono); font-size: 11px; color: var(--color-faint); }

.btn-edit { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; background: var(--color-surface); color: var(--color-ink-soft); border: 1px solid var(--color-hair); border-radius: 999px; padding: 5px 13px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-ghost-xs { font-size: 11px; font-weight: 600; color: var(--color-ink-soft); background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 999px; padding: 3px 11px; cursor: pointer; }

/* version consultée */
.vbanner {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px;
  padding: 8px 12px; border-radius: var(--radius-md);
  background: var(--color-saffron-soft); color: var(--color-saffron-ink); font-size: 12px;
}

/* warning */
.warn { display: flex; align-items: flex-start; gap: 11px; background: var(--color-terra-soft); border: 1px solid #eeb39c; border-radius: 12px; padding: 12px 14px; }
.warn__i { flex: none; margin-top: 1px; }
.warn__t { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.55; color: var(--color-terra-ink); }
.warn__t strong { color: var(--color-terra-ink); font-weight: 700; }
.warn__t code { font-family: var(--font-mono); font-size: 11.5px; background: rgba(255, 255, 255, 0.5); padding: 1px 5px; border-radius: 4px; }

/* procédures */
.doclist { display: flex; flex-direction: column; gap: 3px; }
.docrow { display: flex; flex-direction: column; width: 100%; text-align: left; border: 1px solid transparent; border-radius: 10px; padding: 8px 10px; cursor: pointer; background: transparent; }
.docrow:hover { background: var(--color-paper-2); }
.docrow.on { background: var(--color-paper-2); border-color: var(--color-hair); }
.docrow__top { display: flex; align-items: center; gap: 8px; width: 100%; }
.docrow__dot { width: 7px; height: 7px; border-radius: 999px; flex: none; }
.docrow__title { font-size: 13px; font-weight: 600; color: var(--color-ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.docrow__v { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); flex: none; }
.docrow__bot { display: flex; align-items: center; gap: 7px; width: 100%; padding-left: 15px; margin-top: 3px; }
.docrow__slug { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* versions */
.vlist { display: flex; flex-direction: column; margin-top: 9px; }
.vrow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--color-hair-soft); }
.vrow__dot { width: 7px; height: 7px; border-radius: 999px; flex: none; background: var(--color-faint); }
.vrow__dot.cur { background: var(--color-saffron); }
.vrow__v { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--color-ink); flex: none; }
.vrow__meta { flex: 1; min-width: 0; font-size: 11.5px; color: var(--color-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Auteur non résolu : ce qui s'affiche est un identifiant de compte, et ça se voit. */
.vrow__meta .raw { font-family: var(--font-mono); font-size: 10.5px; color: var(--color-faint); }

/* empty */
.empty-state { max-width: 520px; margin: 64px auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px; }
.empty-title { font-size: 25px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-ink); }
.empty-sub { font-size: 13.5px; color: var(--color-mute); line-height: 1.65; max-width: 420px; }
.empty-sub a { color: var(--color-cobalt-ink); }
.squiggle, .squiggle-sm { position: relative; font-style: italic; white-space: nowrap; }
.squiggle::after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 6px; background: no-repeat center / 100% 100% url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='62' height='8' viewBox='0 0 62 8' fill='none' preserveAspectRatio='none'%3E%3Cpath d='M2 5 Q16 1, 31 4.5 T60 4' stroke='%23f0b41e' stroke-width='2.4' stroke-linecap='round' fill='none'/%3E%3C/svg%3E"); }
.squiggle-sm { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-mute); }
.squiggle-sm::after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 5px; background: no-repeat center / 100% 100% url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='6' viewBox='0 0 46 6' fill='none' preserveAspectRatio='none'%3E%3Cpath d='M2 3.5 Q12 1, 23 3 T44 2.8' stroke='%23f0b41e' stroke-width='1.7' stroke-linecap='round' fill='none'/%3E%3C/svg%3E"); }
</style>

<script setup lang="ts">
// Écran doctrine (ADR 0014) : la doctrine comme objet structuré et vivant —
// en-tête + résumé · content markdown à chips d'outils · manifeste « outils
// référencés » résolu contre le registre · gouvernance (usage + versions).
import { computed, onMounted, reactive, ref } from 'vue'
import {
  getDoctrine, getInstruction, putInstruction, deleteInstruction,
  getInstructionVersions, revertInstruction, getToolRegistry, getInstructionUsage,
} from '@/api/console'
import type { DoctrineBundle, InstructionUsage, InstructionVersion } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { buildReg, hasDead, refNames, type ToolReg } from '@/components/console/doctrine/tools'
import DoctrineContent from '@/components/console/doctrine/DoctrineContent.vue'
import ReferencedTools from '@/components/console/doctrine/ReferencedTools.vue'
import DoctrineEditor from '@/components/console/doctrine/DoctrineEditor.vue'
import UsageCard from '@/components/console/doctrine/UsageCard.vue'
import CreateSkillModal from '@/components/console/doctrine/CreateSkillModal.vue'

const BASE_SLUG = 'claude_md'
const { toast } = useToast()
const { confirmAction } = usePrompt()

const bundle = ref<DoctrineBundle | null>(null)
const reg = ref<ToolReg>(new Map())
const activeSlug = ref(BASE_SLUG)
const body = ref('')           // corps publié (lecture)
const saved = ref('')          // miroir de body, pour le dirty
const draft = ref('')          // brouillon (édition)
const summary = ref('')        // description = résumé
const draftSummary = ref('')
const versions = ref<InstructionVersion[]>([])
const usage = ref<InstructionUsage | null>(null)
const usageLoading = ref(false)
const editing = ref(false)
const modalOpen = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const bodyCache = reactive<Record<string, string>>({})

const canEdit = computed(() => bundle.value?.can_edit ?? false)
const noOrg = computed(() => bundle.value?.org_id == null)
const isBase = computed(() => activeSlug.value === BASE_SLUG)
const isEdit = computed(() => editing.value && canEdit.value)
const isReadonly = computed(() => !canEdit.value)

// base en tête, puis skills — vue unifiée des documents.
const docs = computed(() => {
  const b = bundle.value
  const base = {
    slug: BASE_SLUG, title: 'doctrine de base', type: 'base' as const,
    description: 'le socle que l\'agent charge en premier.',
    version: b?.doctrine.version ?? 0, exists: b?.doctrine.exists ?? false,
  }
  const skills = (b?.instructions ?? []).map((i) => ({
    slug: i.slug, title: i.title, type: 'skill' as const,
    description: i.description, version: i.version, exists: true,
  }))
  return [base, ...skills]
})
const activeDoc = computed(() => docs.value.find((d) => d.slug === activeSlug.value) ?? docs.value[0])
const curVersion = computed(() => activeDoc.value?.version ?? 0)
const nextVersion = computed(() => `v${curVersion.value + 1}`)

const editorContent = computed(() => (isEdit.value ? draft.value : saved.value))
const dirty = computed(() => isEdit.value && draft.value !== saved.value)
const deadRefs = computed(() => refNames(editorContent.value).filter((n) => !reg.value.has(n)))

// pastille de drift par document (depuis le corps en cache si visité).
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
    if (b.org_id != null) await selectDoc(activeSlug.value)
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loading.value = false
  }
}
onMounted(loadAll)

async function selectDoc(slug: string) {
  activeSlug.value = slug
  editing.value = false
  const doc = docs.value.find((d) => d.slug === slug)
  summary.value = doc?.description ?? ''
  body.value = ''
  saved.value = ''
  draft.value = ''
  versions.value = []
  usage.value = null
  if (!doc?.exists) return
  usageLoading.value = true
  try {
    const d = await getInstruction(slug)
    body.value = d.body_md
    saved.value = d.body_md
    summary.value = d.description ?? ''
    bodyCache[slug] = d.body_md
    versions.value = (await getInstructionVersions(slug).catch(() => ({ versions: [] }))).versions
  } catch (e) {
    toast(humanize(e))
  }
  try {
    usage.value = await getInstructionUsage(slug)
  } catch {
    usage.value = null
  } finally {
    usageLoading.value = false
  }
}

function onEdit() {
  draft.value = saved.value
  draftSummary.value = summary.value
  editing.value = true
}
function onDiscard() {
  editing.value = false
  draft.value = saved.value
  toast('brouillon abandonné')
}

async function onPublish() {
  if (!dirty.value && draftSummary.value === summary.value) {
    toast('aucune modification à publier')
    return
  }
  try {
    const r = await putInstruction(
      activeSlug.value, draft.value,
      isBase.value ? 'doctrine de base' : activeDoc.value?.title,
      isBase.value ? undefined : draftSummary.value,
    )
    // Warning serveur (ADR 0014) : refs d'outils non résolues à la publication.
    const dead = r.unresolved_tools ?? []
    toast(dead.length
      ? `publié v${r.version} — ${dead.length} réf. d'outil non résolue${dead.length > 1 ? 's' : ''}`
      : `publié v${r.version}`)
    editing.value = false
    await loadAll()
    await selectDoc(activeSlug.value)
  } catch (e) {
    toast(humanize(e))
  }
}

async function restore(v: number) {
  if (!await confirmAction({
    title: 'restaurer une version', confirmLabel: 'restaurer',
    message: `restaurer v${v} comme nouvelle version courante ? l'historique est conservé.`,
  })) return
  try {
    await revertInstruction(activeSlug.value, v)
    toast(`restauré v${v}`)
    await loadAll()
    await selectDoc(activeSlug.value)
  } catch (e) {
    toast(humanize(e))
  }
}

async function createSkill(p: { title: string; slug: string; summary: string }) {
  if (p.slug === BASE_SLUG) {
    toast('claude_md est réservé à la doctrine de base')
    return
  }
  try {
    await putInstruction(p.slug, `## résumé\n${p.summary || 'à compléter.'}\n\n## étapes\ncommence par <tool:fr_get>, puis enchaîne les outils du registre avec @.`, p.title, p.summary)
    toast(`skill « ${p.title} » créé`)
    modalOpen.value = false
    await loadAll()
    await selectDoc(p.slug)
  } catch (e) {
    toast(humanize(e))
  }
}

async function removeSkill(slug: string, label: string) {
  if (!await confirmAction({
    title: 'supprimer le skill', danger: true, confirmLabel: 'supprimer',
    message: `supprimer « ${label} » et tout son historique ?`,
  })) return
  try {
    await deleteInstruction(slug)
    toast('skill supprimé')
    if (activeSlug.value === slug) activeSlug.value = BASE_SLUG
    await loadAll()
    await selectDoc(activeSlug.value)
  } catch (e) {
    toast(humanize(e))
  }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="err">{{ error }}</p>

    <!-- vide / pas d'org -->
    <div v-if="noOrg && !loading" class="empty-state">
      <span class="o-medallion o-medallion-lg">o</span>
      <div class="empty-title">aucune doctrine <span class="squiggle">encore</span>.</div>
      <div class="empty-sub">
        la doctrine est rattachée à votre organisation active. rejoignez ou basculez sur une org pour l'éditer.
      </div>
    </div>

    <div v-else-if="!loading" class="doc-grid">
      <!-- ─────── colonne gauche ─────── -->
      <div class="col">
        <!-- bandeau dead-ref -->
        <div v-if="deadRefs.length" class="warn">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--color-terra)" stroke-width="1.9"
            stroke-linecap="round" stroke-linejoin="round" class="warn__i"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
          <div class="warn__t">
            <strong>{{ deadRefs.length }} référence{{ deadRefs.length > 1 ? 's' : '' }} d'outil non résolue{{ deadRefs.length > 1 ? 's' : '' }}</strong>
            — <code>{{ deadRefs[0] }}</code> n'existe plus dans le registre. l'agent garde le contexte, mais l'appel
            échouera en silence. corrigez la référence avant de republier.
          </div>
        </div>

        <!-- ZONE 1 · en-tête -->
        <div class="card hdr">
          <div class="hdr__tags">
            <span class="tag" :class="isBase ? 'tag--base' : 'tag--skill'">{{ isBase ? 'doctrine de base' : 'skill' }}</span>
            <span v-if="curVersion" class="tag tag--ver">v{{ curVersion }}</span>
            <span class="slug">{{ activeDoc?.slug }}</span>
            <span v-if="isReadonly" class="tag tag--ro">lecture seule</span>
            <button v-if="!isEdit && canEdit" type="button" class="btn-edit" @click="onEdit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17v3z" /></svg>
              éditer
            </button>
          </div>

          <div class="hdr__title">{{ activeDoc?.title }}</div>

          <div class="hdr__eyebrow">
            <span class="squiggle-sm">résumé</span>
            <span class="hdr__hint">— ce que fait ce process, et quand le charger</span>
          </div>
          <textarea v-if="isEdit && !isBase" v-model="draftSummary" rows="2" class="summary-edit"
            placeholder="quand le charger, ce qu'il fait." />
          <div v-else class="hdr__summary">{{ summary || '—' }}</div>

          <div v-if="activeDoc?.exists" class="hdr__meta">
            <span>chargé {{ usage?.count ?? 0 }}×</span>
          </div>
        </div>

        <!-- ZONE 2 · content -->
        <div class="card">
          <div class="card__head">
            <span class="eyebrow">content</span>
            <span class="dim">markdown · @ pour citer un outil</span>
            <div v-if="isEdit" class="card__actions">
              <button type="button" class="btn-ghost-sm" @click="onDiscard">abandonner</button>
              <button type="button" class="btn-ink-sm" @click="onPublish">publier {{ nextVersion }}</button>
            </div>
          </div>

          <div v-if="dirty" class="draft">
            <span class="draft__dot" />
            modifications non publiées — publier crée la version <strong>{{ nextVersion }}</strong>.
          </div>

          <DoctrineEditor v-if="isEdit" v-model="draft" :reg="reg" />
          <DoctrineContent v-else :text="saved" :reg="reg" />
        </div>

        <!-- ZONE 3 · outils référencés -->
        <ReferencedTools :text="editorContent" :reg="reg" />
      </div>

      <!-- ─────── colonne droite ─────── -->
      <div class="col">
        <!-- documents -->
        <div class="card pad-sm">
          <div class="card__head">
            <span class="eyebrow">documents</span>
            <button v-if="canEdit" type="button" class="btn-ghost-sm" @click="modalOpen = true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              skill
            </button>
          </div>
          <div class="doclist">
            <button v-for="d in docs" :key="d.slug" type="button" class="docrow"
              :class="{ on: d.slug === activeSlug }" @click="selectDoc(d.slug)">
              <div class="docrow__top">
                <span class="docrow__dot" :style="{ background: docDot(d.slug) }" />
                <span class="docrow__title">{{ d.title }}</span>
                <span class="docrow__v">v{{ d.version }}</span>
              </div>
              <div class="docrow__bot">
                <span class="tag tag--mini" :class="d.type === 'base' ? 'tag--base' : 'tag--skill'">{{ d.type }}</span>
                <span class="docrow__slug">{{ d.slug }}</span>
                <span v-if="canEdit && d.slug !== BASE_SLUG" class="docrow__del" title="supprimer"
                  @click.stop="removeSkill(d.slug, d.title)">supprimer</span>
              </div>
            </button>
          </div>
        </div>

        <!-- usage -->
        <UsageCard v-if="activeDoc?.exists" :usage="usage" :loading="usageLoading" />

        <!-- versions -->
        <div class="card pad-sm">
          <span class="eyebrow">versions</span>
          <div class="vlist">
            <div v-for="(v, i) in versions" :key="v.version" class="vrow">
              <span class="vrow__dot" :class="{ cur: v.version === curVersion }" />
              <span class="vrow__v">v{{ v.version }}</span>
              <div class="vrow__meta">{{ v.set_by ?? '—' }} · {{ fmtDate(v.created_at) }}</div>
              <span v-if="v.version === curVersion" class="tag tag--ver">actuelle</span>
              <button v-else-if="canEdit" type="button" class="btn-ghost-xs" @click="restore(v.version)">restaurer</button>
            </div>
            <div v-if="!versions.length" class="dim">aucun historique.</div>
          </div>
        </div>
      </div>
    </div>

    <CreateSkillModal :open="modalOpen" @close="modalOpen = false" @create="createSkill" />
  </div>
</template>

<style scoped>
.err { color: var(--color-terra-ink); font-size: 13px; }
.doc-grid { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 322px; gap: 18px; align-items: start; }
@media (max-width: 1120px) { .doc-grid { grid-template-columns: 1fr; } }
.col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 14px; padding: 18px 20px; }
.card.hdr { padding: 20px 22px; }
.card.pad-sm { padding: 16px 17px; }
.card__head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.card__actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.eyebrow { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-mute); }
.dim { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); }

/* en-tête */
.hdr__tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hdr__title { font-size: 23px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; color: var(--color-ink); margin-top: 13px; }
.hdr__eyebrow { display: flex; align-items: center; gap: 8px; margin-top: 14px; margin-bottom: 7px; }
.hdr__hint { font-family: var(--font-mono); font-size: 9.5px; color: var(--color-faint); }
.hdr__summary { font-size: 16.5px; font-style: italic; font-weight: 500; line-height: 1.5; color: var(--color-ink-soft); text-wrap: pretty; max-width: 60ch; }
.summary-edit {
  width: 100%; box-sizing: border-box; font-family: var(--font-sans); font-size: 15px; font-style: italic;
  line-height: 1.5; color: var(--color-ink-soft); background: var(--color-bg); border: 1px solid var(--color-hair);
  border-radius: 9px; padding: 8px 11px; outline: none; resize: vertical;
}
.hdr__meta {
  display: flex; align-items: center; gap: 8px; margin-top: 15px; padding-top: 13px;
  border-top: 1px solid var(--color-hair-soft); font-family: var(--font-mono); font-size: 10.5px; color: var(--color-faint);
}

/* tags */
.tag { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 2.5px 9px; border-radius: 999px; }
.tag--mini { font-size: 9px; padding: 1.5px 7px; }
.tag--base { background: var(--color-ink); color: var(--color-bg); }
.tag--skill { background: var(--color-cobalt-soft); color: var(--color-cobalt-ink); }
.tag--ver { background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.tag--ro { border: 1px solid var(--color-hair); color: var(--color-mute); }
.slug { font-family: var(--font-mono); font-size: 11px; color: var(--color-faint); }

.btn-edit { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; background: var(--color-surface); color: var(--color-ink-soft); border: 1px solid var(--color-hair); border-radius: 999px; padding: 5px 13px; font-size: 12px; font-weight: 600; text-transform: lowercase; cursor: pointer; }
.btn-ink-sm { display: inline-flex; align-items: center; gap: 6px; background: var(--color-ink); color: var(--color-bg); border: 1px solid var(--color-ink); border-radius: 999px; padding: 5px 14px; font-size: 12px; font-weight: 600; text-transform: lowercase; cursor: pointer; }
.btn-ghost-sm { display: inline-flex; align-items: center; gap: 5px; background: var(--color-surface); color: var(--color-ink-soft); border: 1px solid var(--color-hair); border-radius: 999px; padding: 4px 11px; font-size: 11.5px; font-weight: 600; text-transform: lowercase; cursor: pointer; }
.btn-ghost-xs { font-size: 11px; font-weight: 600; color: var(--color-ink-soft); background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 999px; padding: 3px 11px; text-transform: lowercase; cursor: pointer; }

/* draft indicator */
.draft { display: flex; align-items: center; gap: 9px; background: var(--color-saffron-soft); border: 1px solid #ecd28a; border-radius: 9px; padding: 8px 12px; margin-bottom: 13px; font-size: 12px; color: var(--color-saffron-ink); }
.draft__dot { width: 7px; height: 7px; border-radius: 999px; background: var(--color-saffron); display: inline-block; animation: oto-pulse 1.4s ease-in-out infinite; flex: none; }
.draft strong { font-family: var(--font-mono); color: var(--color-saffron-ink); }

/* warning */
.warn { display: flex; align-items: flex-start; gap: 11px; background: var(--color-terra-soft); border: 1px solid #eeb39c; border-radius: 12px; padding: 12px 14px; }
.warn__i { flex: none; margin-top: 1px; }
.warn__t { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.55; color: var(--color-terra-ink); }
.warn__t strong { color: var(--color-terra-ink); font-weight: 700; }
.warn__t code { font-family: var(--font-mono); font-size: 11.5px; background: rgba(255, 255, 255, 0.5); padding: 1px 5px; border-radius: 4px; }

/* documents */
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
.docrow__del { margin-left: auto; font-family: var(--font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-terra); opacity: 0; transition: opacity 0.12s; }
.docrow:hover .docrow__del { opacity: 1; }

/* versions */
.vlist { display: flex; flex-direction: column; margin-top: 9px; }
.vrow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--color-hair-soft); }
.vrow__dot { width: 7px; height: 7px; border-radius: 999px; flex: none; background: var(--color-faint); }
.vrow__dot.cur { background: var(--color-saffron); }
.vrow__v { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--color-ink); flex: none; }
.vrow__meta { flex: 1; min-width: 0; font-size: 11.5px; color: var(--color-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* empty */
.empty-state { max-width: 520px; margin: 64px auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px; }
.empty-title { font-size: 25px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-ink); }
.empty-sub { font-size: 13.5px; color: var(--color-mute); line-height: 1.65; max-width: 420px; }
.squiggle, .squiggle-sm { position: relative; font-style: italic; white-space: nowrap; }
.squiggle::after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 6px; background: no-repeat center / 100% 100% url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='62' height='8' viewBox='0 0 62 8' fill='none' preserveAspectRatio='none'%3E%3Cpath d='M2 5 Q16 1, 31 4.5 T60 4' stroke='%23f0b41e' stroke-width='2.4' stroke-linecap='round' fill='none'/%3E%3C/svg%3E"); }
.squiggle-sm { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-mute); }
.squiggle-sm::after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 5px; background: no-repeat center / 100% 100% url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='6' viewBox='0 0 46 6' fill='none' preserveAspectRatio='none'%3E%3Cpath d='M2 3.5 Q12 1, 23 3 T44 2.8' stroke='%23f0b41e' stroke-width='1.7' stroke-linecap='round' fill='none'/%3E%3C/svg%3E"); }
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import {
  getDoctrine, getInstruction, putInstruction, deleteInstruction,
  getInstructionVersions, revertInstruction,
} from '@/api/console'
import type { DoctrineBundle, InstructionVersion } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'

const BASE_SLUG = 'claude_md'
const { toast } = useToast()
const { promptForm, confirmAction } = usePrompt()

const bundle = ref<DoctrineBundle | null>(null)
const activeSlug = ref(BASE_SLUG)
const body = ref('')
const saved = ref('')
const title = ref('')
const description = ref('')
const versions = ref<InstructionVersion[]>([])
const error = ref<string | null>(null)
const loading = ref(true)

const dirty = computed(() => body.value !== saved.value)
const canEdit = computed(() => bundle.value?.can_edit ?? false)
const noOrg = computed(() => bundle.value?.org_id == null)
const isBase = computed(() => activeSlug.value === BASE_SLUG)

// Liste unifiée : la doctrine de base en tête, puis les skills nommées.
const docs = computed(() => {
  const base = {
    slug: BASE_SLUG, title: 'doctrine de base',
    description: 'served to every agent before it acts',
    version: bundle.value?.doctrine.version ?? 0, exists: bundle.value?.doctrine.exists ?? false,
  }
  const skills = (bundle.value?.instructions ?? []).map((i) => ({
    slug: i.slug, title: i.title, description: i.description, version: i.version, exists: true,
  }))
  return [base, ...skills]
})
const activeDoc = computed(() => docs.value.find((d) => d.slug === activeSlug.value) ?? docs.value[0])
const curVersion = computed(() => activeDoc.value?.version ?? 0)

async function loadBundle() {
  loading.value = true
  try {
    bundle.value = await getDoctrine()
    if (bundle.value.org_id != null) await selectDoc(activeSlug.value)
  } catch (e) { error.value = humanize(e) }
  finally { loading.value = false }
}
onMounted(loadBundle)

async function selectDoc(slug: string) {
  activeSlug.value = slug
  const doc = docs.value.find((d) => d.slug === slug)
  title.value = doc?.title ?? ''
  description.value = doc?.description ?? ''
  body.value = ''
  saved.value = ''
  versions.value = []
  if (!doc?.exists) return
  try {
    const d = await getInstruction(slug)
    body.value = d.body_md
    saved.value = d.body_md
    versions.value = (await getInstructionVersions(slug).catch(() => ({ versions: [] }))).versions
  } catch (e) { toast(humanize(e)) }
}

function discardDraft() { body.value = saved.value; toast('draft discarded') }

async function publish() {
  if (!dirty.value) { toast('no changes to save'); return }
  try {
    // La doctrine de base n'a pas de description (servie d'office) ; les skills si.
    const r = await putInstruction(
      activeSlug.value, body.value,
      isBase.value ? 'doctrine de base' : title.value,
      isBase.value ? undefined : description.value,
    )
    saved.value = body.value
    toast(`published v${r.version}`)
    await loadBundle()
  } catch (e) { toast(humanize(e)) }
}

async function newSkill() {
  const r = await promptForm({
    title: 'new skill', description: 'a modular instruction agents pull by name, on top of the base doctrine.',
    fields: [
      { key: 'title', label: 'title', required: true, placeholder: 'e.g. Process avoir GoCardless' },
      { key: 'description', label: 'when to use it', placeholder: 'one line shown in the index' },
      { key: 'slug', label: 'slug', required: true, placeholder: 'process-avoir', hint: 'lowercase, [a-z0-9_-]' },
    ],
    submitLabel: 'create',
  })
  if (!r) return
  if (r.slug === BASE_SLUG) { toast('claude_md is reserved for the base doctrine'); return }
  try {
    await putInstruction(r.slug ?? '', `# ${r.title}\n\n`, r.title, r.description)
    toast(`skill "${r.title}" created`)
    await loadBundle()
    await selectDoc((r.slug ?? '').toLowerCase())
  } catch (e) { toast(humanize(e)) }
}

async function removeSkill(slug: string, label: string) {
  if (!await confirmAction({ title: 'delete skill', danger: true, confirmLabel: 'delete',
    message: `delete "${label}" and its full history?` })) return
  try {
    await deleteInstruction(slug)
    toast('skill deleted')
    if (activeSlug.value === slug) activeSlug.value = BASE_SLUG
    await loadBundle()
  } catch (e) { toast(humanize(e)) }
}

async function restore(v: number) {
  if (!await confirmAction({ title: 'restore version', confirmLabel: 'restore', message: `restore v${v} as a new draft? it becomes the new current version.` })) return
  try { await revertInstruction(activeSlug.value, v); toast(`restored v${v}`); await selectDoc(activeSlug.value); await loadBundle() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="noOrg && !loading" title="no active org">
      <div class="helptext">doctrine is scoped to your active organization. join or switch to an org to edit it.</div>
    </ConsoleCard>

    <div v-else class="grid23">
      <ConsoleCard
        :sub="`served to every agent in ${bundle?.org_name ?? '…'} before it acts. markdown, versioned.${activeDoc?.exists ? '' : ' — new document, not published yet.'}`">
        <template #title>
          {{ activeDoc?.title }} <Tag v-if="curVersion" tone="saffron">v{{ curVersion }}</Tag>
          <Tag v-if="!isBase" tone="cobalt">skill</Tag>
        </template>
        <template #actions>
          <Btn v-if="canEdit && dirty" kind="mini" @click="discardDraft">discard draft</Btn>
          <Btn v-if="canEdit" @click="publish">publish</Btn>
          <Tag v-else>read only</Tag>
        </template>
        <input v-if="canEdit && !isBase" v-model="description" class="inp" style="margin-bottom: 8px"
          placeholder="when to use this skill (shown in the index)" />
        <textarea v-model="body" class="doc-editor" :spellcheck="false" :readonly="!canEdit"
          :placeholder="canEdit ? '# write markdown…' : ''"></textarea>
        <div v-if="dirty" class="helptext" style="margin-top: 8px; color: var(--color-saffron-ink)">
          unsaved draft — publishing creates a new version, previous ones stay restorable.
        </div>
      </ConsoleCard>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <ConsoleCard title="documents" sub="base doctrine + modular skills agents pull by name.">
          <template #actions>
            <Btn v-if="canEdit" kind="mini" icon="plus" @click="newSkill">new skill</Btn>
          </template>
          <div class="rowlist">
            <div v-for="d in docs" :key="d.slug" class="doc-item" :class="{ on: d.slug === activeSlug }"
              @click="selectDoc(d.slug)">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px">
                  {{ d.title }}
                  <span v-if="d.version" style="font-family: var(--font-mono); font-size: 9.5px; color: var(--color-faint)">v{{ d.version }}</span>
                  <Tag v-if="!d.exists" tone="saffron">draft</Tag>
                </div>
                <div style="font-size: 11.5px; color: var(--color-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ d.description }}</div>
              </div>
              <Btn v-if="canEdit && d.slug !== BASE_SLUG" kind="danger" @click.stop="removeSkill(d.slug, d.title)">delete</Btn>
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard title="versions" sub="every publish is kept. restore any of them.">
          <div class="rowlist">
            <div v-for="v in versions" :key="v.version" class="rowitem">
              <span class="ver-dot" :class="{ cur: v.version === curVersion }"></span>
              <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 600">v{{ v.version }}</span>
              <span style="font-size: 12px; color: var(--color-mute)">{{ v.set_by ?? '—' }} · {{ fmtDate(v.created_at) }}</span>
              <span v-if="v.version !== curVersion && canEdit" style="margin-left: auto">
                <Btn kind="mini" @click="restore(v.version)">restore</Btn>
              </span>
              <span v-else-if="v.version === curVersion" style="margin-left: auto"><Tag tone="saffron">current</Tag></span>
            </div>
            <div v-if="!versions.length" class="helptext">no history yet.</div>
          </div>
        </ConsoleCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
  cursor: pointer; border: 1px solid transparent; transition: background .12s, border-color .12s;
}
.doc-item:hover { background: var(--color-paper-2); }
.doc-item.on { background: var(--color-paper-2); border-color: var(--color-hair); }
</style>

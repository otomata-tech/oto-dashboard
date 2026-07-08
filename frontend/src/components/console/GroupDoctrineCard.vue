<script setup lang="ts">
// Agent readme & procédures d'un groupe (ADR 0012). Lecture = membre, écriture = chef
// (prop can-edit, le backend re-vérifie). L'agent readme d'équipe (slug claude_md) est
// INJECTÉ à chaque session des membres du groupe actif, cumulé APRÈS celui de l'org ;
// les procédures d'équipe = progressive disclosure (chargées à la demande).
import { ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import {
  getGroupInstructions, getGroupInstruction, putGroupInstruction, deleteGroupInstruction,
} from '@/api/console'
import type { GroupInstructionsBundle } from '@/types/api'
import { humanize } from '@/lib/errors'

// `section` : 'all' = readme + procédures (défaut) ; 'procedures' = procédures seules
// (le readme s'édite ailleurs, p.ex. /team/context). Diff minimal, zéro backend.
const props = withDefaults(
  defineProps<{ groupId: number; canEdit: boolean; section?: 'all' | 'procedures' }>(),
  { section: 'all' },
)
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const bundle = ref<GroupInstructionsBundle | null>(null)

async function load() {
  try { bundle.value = await getGroupInstructions(props.groupId) }
  catch (e) { toast(humanize(e)); bundle.value = null }
}
watch(() => props.groupId, load, { immediate: true })

function editDoctrine() {
  openForm({
    title: 'agent readme · équipe',
    description: 'injected into every session of this team\'s members, right after the org readme.',
    fields: [{ key: 'body', label: 'markdown', type: 'textarea', initial: bundle.value?.doctrine || '' }],
    submitLabel: 'save',
    onConfirm: async (v) => {
      const body = (v.body || '').trim()
      if (!body) { toast('readme is empty — nothing saved'); throw new Error('empty readme') }
      try { await putGroupInstruction(props.groupId, 'claude_md', body); toast('agent readme saved'); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function editSkill(slug?: string) {
  let body = '', title = '', description = ''
  if (slug) {
    try { const i = await getGroupInstruction(props.groupId, slug); body = i.body_md; title = i.title; description = i.description }
    catch (e) { toast(humanize(e)); return }
  }
  openForm({
    title: slug ? `edit procedure: ${slug}` : 'new procedure',
    description: 'a named instruction loaded on demand by the agent (progressive disclosure).',
    fields: [
      ...(slug ? [] : [{ key: 'slug', label: 'slug', placeholder: 'invoicing-flow', required: true }]),
      { key: 'title', label: 'title', initial: title },
      { key: 'description', label: 'when to use', initial: description, placeholder: 'shown in the index' },
      { key: 'body', label: 'markdown', type: 'textarea' as const, initial: body, required: true },
    ],
    submitLabel: 'save',
    onConfirm: async (v) => {
      const newBody = (v.body || '').trim()
      if (!newBody) throw new Error('empty body')
      const targetSlug = slug || v.slug
      if (!targetSlug) throw new Error('missing slug')
      try { await putGroupInstruction(props.groupId, targetSlug, newBody, v.title || undefined, v.description || undefined); toast('procedure saved'); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function removeSkill(slug: string) {
  if (!await confirmAction({ title: 'delete procedure', danger: true, confirmLabel: 'Delete', message: `delete the "${slug}" procedure and its history?` })) return
  try { await deleteGroupInstruction(props.groupId, slug); toast('procedure deleted'); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard
    :title="section === 'procedures' ? 'procédures · équipe' : 'agent readme & procédures · équipe'"
    :sub="section === 'procedures'
      ? 'the team\'s procedures (named instructions, loaded on demand). the team readme is edited under « context ».'
      : 'the team\'s agent readme (injected each session, after the org\'s) + its procedures (loaded on demand).'">
    <template #actions v-if="canEdit">
      <Btn v-if="section !== 'procedures'" kind="mini" @click="editDoctrine">Edit readme</Btn>
      <Btn kind="mini" icon="plus" @click="editSkill()">Procedure</Btn>
    </template>
    <div v-if="bundle">
      <div v-if="section !== 'procedures'" class="rowitem" style="gap: 10px; padding-bottom: 8px">
        <Tag tone="saffron">readme</Tag>
        <span class="dim" style="font-size: 12px">{{ bundle.doctrine ? 'injecté à chaque session' : 'no team readme yet' }}</span>
      </div>
      <div class="rowlist">
        <div v-for="i in bundle.instructions" :key="i.slug" class="rowitem" style="gap: 10px">
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px">{{ i.title || i.slug }} <span class="dim" style="font-weight: 400">· {{ i.slug }} · v{{ i.version }}</span></div>
            <div v-if="i.description" style="font-size: 11.5px; color: var(--color-mute)">{{ i.description }}</div>
          </div>
          <template v-if="canEdit">
            <Btn kind="mini" @click="editSkill(i.slug)">Edit</Btn>
            <Btn kind="danger" @click="removeSkill(i.slug)">Delete</Btn>
          </template>
        </div>
        <div v-if="!bundle.instructions.length" class="helptext">no procedures yet.</div>
      </div>
    </div>
    <div v-else class="helptext">loading…</div>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </ConsoleCard>
</template>

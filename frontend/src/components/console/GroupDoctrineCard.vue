<script setup lang="ts">
// Doctrine & skills d'un groupe (ADR 0012). Lecture = membre, écriture = chef
// (prop can-edit, le backend re-vérifie). Base doctrine (slug claude_md) servie
// EN COMPLÉMENT de celle de l'org par get_claude_md ; skills = progressive disclosure.
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

const props = defineProps<{ groupId: number; canEdit: boolean }>()
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
    title: 'group base doctrine',
    description: 'served to this team in addition to the org doctrine, at session start (get_claude_md).',
    fields: [{ key: 'body', label: 'markdown', type: 'textarea', initial: bundle.value?.doctrine || '' }],
    submitLabel: 'save',
    onConfirm: async (v) => {
      const body = (v.body || '').trim()
      if (!body) { toast('doctrine is empty — nothing saved'); throw new Error('empty doctrine') }
      try { await putGroupInstruction(props.groupId, 'claude_md', body); toast('doctrine saved'); await load() }
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
    title: slug ? `edit skill: ${slug}` : 'new skill',
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
      try { await putGroupInstruction(props.groupId, targetSlug, newBody, v.title || undefined, v.description || undefined); toast('skill saved'); await load() }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function removeSkill(slug: string) {
  if (!await confirmAction({ title: 'delete skill', danger: true, confirmLabel: 'delete', message: `delete the "${slug}" skill and its history?` })) return
  try { await deleteGroupInstruction(props.groupId, slug); toast('skill deleted'); await load() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard title="department doctrine"
    sub="base doctrine + skills for this team — applied on top of the org doctrine.">
    <template #actions v-if="canEdit">
      <Btn kind="mini" @click="editDoctrine">edit doctrine</Btn>
      <Btn kind="mini" icon="plus" @click="editSkill()">skill</Btn>
    </template>
    <div v-if="bundle">
      <div class="rowitem" style="gap: 10px; padding-bottom: 8px">
        <Tag tone="saffron">base</Tag>
        <span class="dim" style="font-size: 12px">{{ bundle.doctrine ? `claude_md · v${bundle.doctrine_version}` : 'no base doctrine yet' }}</span>
      </div>
      <div class="rowlist">
        <div v-for="i in bundle.instructions" :key="i.slug" class="rowitem" style="gap: 10px">
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px">{{ i.title || i.slug }} <span class="dim" style="font-weight: 400">· {{ i.slug }} · v{{ i.version }}</span></div>
            <div v-if="i.description" style="font-size: 11.5px; color: var(--color-mute)">{{ i.description }}</div>
          </div>
          <template v-if="canEdit">
            <Btn kind="mini" @click="editSkill(i.slug)">edit</Btn>
            <Btn kind="danger" @click="removeSkill(i.slug)">delete</Btn>
          </template>
        </div>
        <div v-if="!bundle.instructions.length" class="helptext">no skills yet.</div>
      </div>
    </div>
    <div v-else class="helptext">loading…</div>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </ConsoleCard>
</template>

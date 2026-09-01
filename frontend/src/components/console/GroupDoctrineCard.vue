<script setup lang="ts">
// Agent readme & procédures d'un groupe (ADR 0012). Le backend re-vérifie tout, mais
// depuis oto-backend#681 les deux gestes n'ont plus la même garde et cet écran doit le
// refléter (oto-dashboard#144) :
//   · écrire/éditer/restaurer une procédure = tout MEMBRE de l'équipe (prop `can-write`) —
//     geste de travail, réversible (chaque écriture verse une version, `revert` la restaure) ;
//   · éditer le readme et SUPPRIMER une procédure = le CHEF (prop `can-manage`) — le readme
//     reste écrit sur la surface guide (chef seul), et la suppression emporte l'historique
//     sans corbeille.
// `can-manage` implique `can-write` (un chef est aussi un membre), mais l'inverse est faux :
// ne jamais dériver l'un de l'autre, ce sont deux droits distincts. L'agent readme d'équipe
// (slug claude_md) est INJECTÉ à chaque session des membres du groupe actif, cumulé APRÈS
// celui de l'org ; les procédures d'équipe = progressive disclosure (chargées à la demande).
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
  getInitGuide, setInitGuide,
} from '@/api/console'
import type { GroupInstructionsBundle } from '@/types/api'
import { humanize } from '@/lib/errors'

// `section` : 'all' = readme + procédures (défaut) ; 'procedures' = procédures seules
// (le readme s'édite ailleurs, p.ex. /team/context). Diff minimal, zéro backend.
const props = withDefaults(
  defineProps<{
    groupId: number
    canManage: boolean       // chef d'équipe (+ escalade org/plateforme) : readme, suppression
    canWrite: boolean        // tout membre : créer/éditer/restaurer une procédure
    section?: 'all' | 'procedures'
  }>(),
  { section: 'all' },
)
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()

const bundle = ref<GroupInstructionsBundle | null>(null)
const readme = ref('')   // readme d'équipe (guide delivery='init', ADR 0042)

async function load() {
  // Le readme d'équipe ne vient PLUS du bundle de procédures : c'est un guide
  // `delivery=init` (ADR 0042), lu sur sa propre surface.
  getInitGuide('group', props.groupId).then((g) => { readme.value = g.body_md })
                                      .catch(() => { readme.value = '' })
  try { bundle.value = await getGroupInstructions(props.groupId) }
  catch (e) { toast(humanize(e)); bundle.value = null }
}
watch(() => props.groupId, load, { immediate: true })

function editDoctrine() {
  openForm({
    title: 'agent readme · équipe',
    description: 'injected into every session of this team\'s members, right after the org readme.',
    fields: [{ key: 'body', label: 'markdown', type: 'textarea', initial: readme.value }],
    submitLabel: 'save',
    onConfirm: async (v) => {
      const body = (v.body || '').trim()
      if (!body) { toast('readme is empty — nothing saved'); throw new Error('empty readme') }
      // Readme d'équipe = guide `delivery=init` scope group, ciblé par l'id de la carte.
      try { await setInitGuide('group', body, props.groupId); toast('agent readme saved'); await load() }
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
    <template #actions v-if="(section !== 'procedures' && canManage) || canWrite">
      <Btn v-if="section !== 'procedures' && canManage" kind="mini" @click="editDoctrine">Edit readme</Btn>
      <Btn v-if="canWrite" kind="mini" icon="plus" @click="editSkill()">Procedure</Btn>
    </template>
    <div v-if="bundle">
      <div v-if="section !== 'procedures'" class="rowitem" style="gap: 10px; padding-bottom: 8px">
        <Tag tone="saffron">readme</Tag>
        <span class="dim" style="font-size: 12px">{{ readme ? 'injecté à chaque session' : 'no team readme yet' }}</span>
      </div>
      <div class="rowlist">
        <div v-for="i in bundle.instructions" :key="i.slug" class="rowitem" style="gap: 10px">
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 600; font-size: 13px">{{ i.title || i.slug }} <span class="dim" style="font-weight: 400">· {{ i.slug }} · v{{ i.version }}</span></div>
            <div v-if="i.description" style="font-size: 11.5px; color: var(--color-mute)">{{ i.description }}</div>
          </div>
          <Btn v-if="canWrite" kind="mini" @click="editSkill(i.slug)">Edit</Btn>
          <Btn v-if="canManage" kind="danger" @click="removeSkill(i.slug)">Delete</Btn>
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

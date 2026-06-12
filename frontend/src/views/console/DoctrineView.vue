<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import {
  getDoctrine, getInstruction, putInstruction,
  getInstructionVersions, revertInstruction,
} from '@/api/console'
import type { DoctrineBundle, InstructionVersion } from '@/types/api'
import { fmtDate } from '@/types/api'

const DOCTRINE_SLUG = 'claude_md'
const { toast } = useToast()

const bundle = ref<DoctrineBundle | null>(null)
const body = ref('')
const saved = ref('')
const versions = ref<InstructionVersion[]>([])
const error = ref<string | null>(null)
const loading = ref(true)

const dirty = computed(() => body.value !== saved.value)
const canEdit = computed(() => bundle.value?.can_edit ?? false)
const curVersion = computed(() => bundle.value?.doctrine.version ?? 0)
const noOrg = computed(() => bundle.value?.org_id == null)

async function load() {
  loading.value = true
  try {
    bundle.value = await getDoctrine()
    if (bundle.value.org_id != null) {
      if (bundle.value.doctrine.exists) {
        const d = await getInstruction(DOCTRINE_SLUG)
        body.value = d.body_md
        saved.value = d.body_md
      }
      versions.value = (await getInstructionVersions(DOCTRINE_SLUG).catch(() => ({ versions: [] }))).versions
    }
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}
onMounted(load)

function revert() { body.value = saved.value; toast('draft reverted') }

async function publish() {
  if (!dirty.value) { toast('no changes to save'); return }
  try {
    const r = await putInstruction(DOCTRINE_SLUG, body.value, 'doctrine de base')
    saved.value = body.value
    toast(`published v${r.version}`)
    await load()
  } catch (e) { toast(e instanceof Error ? e.message : 'failed') }
}

async function restore(v: number) {
  if (!window.confirm(`restore v${v} as a new draft?`)) return
  try { await revertInstruction(DOCTRINE_SLUG, v); toast(`restored v${v}`); await load() }
  catch (e) { toast(e instanceof Error ? e.message : 'failed') }
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
        :sub="`served to every agent in ${bundle?.org_name ?? '…'} before it acts. markdown, versioned.${bundle?.doctrine.updated_at ? ' last edit ' + fmtDate(bundle?.doctrine.updated_at) : ''}`">
        <template #title>
          doctrine de base <Tag v-if="curVersion" tone="saffron">v{{ curVersion }}</Tag>
        </template>
        <template #actions>
          <Btn v-if="canEdit" kind="mini" @click="revert">revert</Btn>
          <Btn v-if="canEdit" @click="publish">publish</Btn>
          <Tag v-else>read only</Tag>
        </template>
        <textarea v-model="body" class="doc-editor" :spellcheck="false" :readonly="!canEdit"
          :placeholder="canEdit ? '# write your org doctrine in markdown…' : ''"></textarea>
        <div v-if="dirty" class="helptext" style="margin-top: 8px; color: var(--color-saffron-ink)">
          unsaved draft — publishing creates a new version, previous ones stay restorable.
        </div>
      </ConsoleCard>

      <div style="display: flex; flex-direction: column; gap: 16px">
        <ConsoleCard title="named instructions" sub="modular skills agents pull by name, on top of the base doctrine.">
          <div class="rowlist">
            <div v-for="ins in bundle?.instructions ?? []" :key="ins.slug" class="rowitem" style="gap: 10px">
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 600; font-size: 13px">
                  {{ ins.title }} <span style="font-family: var(--font-mono); font-size: 9.5px; color: var(--color-faint)">v{{ ins.version }}</span>
                </div>
                <div style="font-size: 11.5px; color: var(--color-mute)">{{ ins.description }}</div>
              </div>
            </div>
            <div v-if="!(bundle?.instructions?.length)" class="helptext">no named instructions yet.</div>
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

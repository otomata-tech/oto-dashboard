<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import DatastoreTable from '@/components/console/DatastoreTable.vue'
import NamespaceCreateDialog from '@/components/console/NamespaceCreateDialog.vue'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { getNamespaces, createNamespace } from '@/api/console'
import type { NamespaceEntry } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { me } = useMe()
const route = useRoute()
const router = useRouter()

const namespaces = ref<NamespaceEntry[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
const selectedId = ref<number | null>(null)
const createOpen = ref(false)

const current = computed(() => namespaces.value.find((n) => n.id === selectedId.value) || null)
const activeOrgName = computed(() => (me.value?.active_org ? (me.value?.active_org_name || 'mon org') : null))

// Sélection pilotée par le CHEMIN `/data/:id` (id stable au renommage, ADR 0032) —
// résolu par id OU nom (les liens agent portent le nom) ; l'ancien `?ns=` est normalisé.
const selParam = computed(() => {
  const p = route.params.id
  if (typeof p === 'string' && p) return p
  const q = route.query.ns
  return typeof q === 'string' && q ? q : null
})
async function applySelection(raw: string | null) {
  if (!raw) { selectedId.value = null; return }
  const ns = namespaces.value.find((n) => String(n.id) === raw || n.namespace === raw)
  if (!ns) { selectedId.value = null; return }
  if (String(route.params.id) !== String(ns.id)) {
    const { ns: _drop, ...rest } = route.query
    // préserve le deep-link de row (`…/item/<rowId>`) quand on normalise nom → id
    const item = typeof route.params.rowId === 'string' && route.params.rowId
      ? `/item/${route.params.rowId}` : ''
    void router.replace({ path: `/data/${ns.id}${item}`, query: rest })
  }
  selectedId.value = ns.id
}
watch(selParam, (v) => { void applySelection(v) })

async function load() {
  try { namespaces.value = (await getNamespaces()).namespaces }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(async () => {
  await load()
  await applySelection(selParam.value)
})

function open(id: number) { void router.push(`/data/${id}`) }

async function doCreate(payload: { name: string; scope: 'user' | 'org' }) {
  const activeOrg = me.value?.active_org
  const owner = payload.scope === 'org' && activeOrg ? { type: 'org', id: activeOrg } : undefined
  try {
    await createNamespace(payload.name, owner)
    toast(`namespace "${payload.name}" created`)
    await load()
    const created = namespaces.value.find((n) => n.namespace === payload.name)
    if (created) open(created.id)
  } catch (e) { toast(humanize(e)); throw e }
}

async function onNsDeleted() {
  selectedId.value = null
  void router.replace('/data')
  await load()
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="data-layout">
      <!-- liste des namespaces -->
      <ConsoleCard title="namespaces" flush
        sub="tabular storage your agents read &amp; write through data_* tools.">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="createOpen = true">new</Btn>
        </template>
        <div class="rowlist">
          <button v-for="ns in namespaces" :key="ns.id"
            class="rowitem ns-item" :class="{ active: ns.id === selectedId }"
            @click="open(ns.id)">
            <code class="mono" style="font-weight: 600">{{ ns.namespace }}</code>
            <Tag v-if="ns.owner_type === 'org'" tone="cobalt">org</Tag>
            <Tag v-else-if="ns.owner_type === 'group'" tone="cobalt">team</Tag>
            <Tag v-else-if="ns.shared" tone="cobalt">shared · {{ ns.permission || 'read' }}</Tag>
            <Tag v-if="ns.schema?.fields?.length" tone="olive">typé</Tag>
          </button>
          <div v-if="loaded && !namespaces.length" class="dim" style="text-align: center; padding: 16px">
            no namespaces yet — create one to let your agents store rows.
          </div>
        </div>
      </ConsoleCard>

      <!-- contenu du namespace sélectionné (composant réutilisable) -->
      <DatastoreTable v-if="current" :ns-ref="String(selectedId)" :ns-meta="current"
        @changed="load" @deleted="onNsDeleted" />
      <ConsoleCard v-else title="pick a namespace">
        <div class="helptext">select a namespace on the left to view its rows.</div>
      </ConsoleCard>
    </div>

    <ConsoleCard title="how agents use this">
      <div class="helptext" style="font-size: 12.5px; line-height: 1.65; margin-bottom: 10px">
        schema-free tables your agents read and write in plain language — no columns to define
        upfront, new fields just appear as they're written.
      </div>
      <dl class="ds-verbs">
        <div>
          <dt>write</dt>
          <dd><code>data_write(ns, row)</code> appends a row · pass an <code>id</code> to update
            only the fields you give · new keys auto-create their columns.</dd>
        </div>
        <div>
          <dt>read</dt>
          <dd><code>data_rows(ns, filter)</code> lists rows (exact-match filter + limit), or fetches
            one by <code>id</code>.</dd>
        </div>
        <div>
          <dt>organize</dt>
          <dd><code>data_create_namespace</code> / <code>data_list_namespaces</code> manage tables ·
            <code>data_set_schema</code> turns a flat table into typed cards.</dd>
        </div>
        <div>
          <dt>share</dt>
          <dd><code>data_share(ns, email, read|write)</code> gives a teammate access under their own
            account · <code>data_delete_row</code> / <code>data_delete_namespace</code> clean up.</dd>
        </div>
        <div>
          <dt>see it</dt>
          <dd><code>data_app</code> renders a sortable table right in the chat ·
            <code>data_url</code> links back to this page.</dd>
        </div>
      </dl>
    </ConsoleCard>

    <NamespaceCreateDialog v-model:open="createOpen" :org-name="activeOrgName" :on-confirm="doCreate" />
  </div>
</template>

<style scoped>
.data-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: var(--gap, 16px);
  align-items: start;
}
.ds-verbs { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.ds-verbs > div { display: grid; grid-template-columns: 84px 1fr; gap: 12px; align-items: baseline; }
.ds-verbs dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--color-ink-soft, #6b6b6b); }
.ds-verbs dd { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--color-ink-soft, #6b6b6b); }
.ds-verbs code { font-size: 11px; }
@media (max-width: 560px) {
  .ds-verbs > div { grid-template-columns: 1fr; gap: 2px; }
}
@media (max-width: 720px) {
  .data-layout { grid-template-columns: 1fr; }
}
.ns-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-inline: var(--pad-card);
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.ns-item.active { background: var(--color-paper-3); }
</style>

<script setup lang="ts">
// Panneau ACCÈS PLATEFORME (ADR 0044 §H) — le foyer UNIQUE de « qui, au niveau
// plateforme, a droit à ce connecteur ». Un seul acte « accès plateforme » = prêter la
// clé Otomata (couche 2) + offrir l'option payante (couche 3), ensemble. Remplace les
// leviers dispersés /platform/orgs (option d'org) + /platform/users (grant de clé).
// Autonome : charge (getPlatformAccess) + ouvre/ferme (setPlatformAccess).
import { computed, ref, watch } from 'vue'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import Tag from '@/components/console/Tag.vue'
import Avatar from '@/components/console/Avatar.vue'
import { useToast } from '@/composables/useToast'
import {
  getPlatformAccess, setPlatformAccess, getAdminOrgs, getAdminUsers,
} from '@/api/console'
import type { AdminOrgSummary, AdminUser, PlatformAccess, PlatformAccessBeneficiary } from '@/types/api'
import { humanize } from '@/lib/errors'
import type { PlatformAccessLever } from './adapter'

const props = defineProps<{ lever: PlatformAccessLever<unknown>; row: unknown }>()

const { toast } = useToast()
const provider = computed(() => props.lever.provider(props.row))
const isSuperAdmin = computed(() => props.lever.isSuperAdmin)

const access = ref<PlatformAccess | null>(null)
const loading = ref(false)
const busy = ref(false)

const scope = ref<'org' | 'user'>('org')
const q = ref('')
const orgs = ref<AdminOrgSummary[]>([])
const users = ref<AdminUser[]>([])
const pickersLoaded = ref(false)

async function load() {
  loading.value = true
  try { access.value = await getPlatformAccess(provider.value) }
  catch (e) { toast(humanize(e)) }
  finally { loading.value = false }
}

async function loadPickers() {
  if (pickersLoaded.value) return
  pickersLoaded.value = true
  try {
    const [o, u] = await Promise.all([
      getAdminOrgs().then(r => r.orgs).catch(() => []),
      getAdminUsers().then(r => r.users).catch(() => []),
    ])
    orgs.value = o; users.value = u
  } catch (e) { toast(humanize(e)) }
}

watch(provider, () => {
  scope.value = 'org'; q.value = ''
  load()
  if (isSuperAdmin.value) loadPickers()
}, { immediate: true })

const granted = computed(() => access.value?.beneficiaries ?? [])
const grantedKeys = computed(() => new Set(granted.value.map(b => `${b.scope}:${b.id}`)))

type Candidate = { scope: 'org' | 'user'; id: string; label: string; logo_url?: string | null; email?: string | null }
const candidates = computed<Candidate[]>(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return []
  if (scope.value === 'org') {
    return orgs.value
      .filter(o => !grantedKeys.value.has(`org:${o.id}`))
      .filter(o => o.name.toLowerCase().includes(needle) || (o.domain || '').toLowerCase().includes(needle))
      .slice(0, 6)
      .map(o => ({ scope: 'org' as const, id: String(o.id), label: o.name, logo_url: o.logo_url }))
  }
  return users.value
    .filter(u => !grantedKeys.value.has(`user:${u.sub}`))
    .filter(u => (u.email || '').toLowerCase().includes(needle) || (u.name || '').toLowerCase().includes(needle) || u.sub.toLowerCase().includes(needle))
    .slice(0, 6)
    .map(u => ({ scope: 'user' as const, id: u.sub, label: u.name || u.email || u.sub, email: u.email }))
})

async function grant(scopeType: 'org' | 'user', id: string) {
  if (busy.value) return
  busy.value = true
  try {
    await setPlatformAccess(provider.value, scopeType, id, true)
    toast('accès plateforme ouvert')
    q.value = ''
    await load()
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

async function revoke(b: PlatformAccessBeneficiary) {
  if (busy.value) return
  busy.value = true
  try {
    await setPlatformAccess(provider.value, b.scope, b.id, false)
    toast('accès plateforme retiré')
    await load()
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

const effect = computed(() => {
  const a = access.value
  if (!a) return ''
  const parts: string[] = []
  if (a.platform_key) parts.push('prête la clé Otomata')
  if (a.paid_option) parts.push('offre l\'option payante')
  return parts.length ? `Ouvrir = ${parts.join(' + ')}.` : ''
})
</script>

<template>
  <div class="pa">
    <p class="pa-lead">
      qui, au niveau plateforme, a droit à ce connecteur (clé + option).
      <span v-if="effect"> {{ effect }}</span>
    </p>
    <div v-if="access?.open_tier" class="pa-note">free-tier : déjà ouvert à tous sans grant.</div>

    <!-- Ajout : super_admin seul -->
    <template v-if="isSuperAdmin">
      <div class="pa-add">
        <select v-model="scope" class="inp" aria-label="type de bénéficiaire">
          <option value="org">une org</option>
          <option value="user">un membre</option>
        </select>
        <div class="pa-search">
          <Icon name="search" :size="14" class="pa-ic" />
          <input v-model="q" class="pa-input"
            :placeholder="scope === 'org' ? 'nom d\'org, domaine…' : 'email, nom…'" />
        </div>
      </div>
      <div v-if="q" class="pa-cands">
        <button v-for="c in candidates" :key="c.scope + c.id" class="pa-cand"
          :disabled="busy" @click="grant(c.scope, c.id)">
          <Avatar :src="c.logo_url" :name="c.label" :size="20" :shape="c.scope === 'org' ? 'square' : 'circle'" />
          <span class="pa-id">
            <span class="pa-name">{{ c.label }}</span>
            <span v-if="c.email" class="pa-sub">{{ c.email }}</span>
          </span>
          <Icon name="plus" :size="14" />
        </button>
        <div v-if="!candidates.length" class="dim pa-empty">aucun résultat.</div>
      </div>
    </template>

    <!-- Bénéficiaires actuels -->
    <div class="pa-list">
      <div v-if="loading" class="dim" style="padding: 8px 0">chargement…</div>
      <div v-for="b in granted" :key="b.scope + b.id" class="pa-item">
        <Avatar :src="b.logo_url" :name="b.label" :size="22" :shape="b.scope === 'org' ? 'square' : 'circle'" />
        <span class="pa-id">
          <span class="pa-name">{{ b.label }}</span>
          <span v-if="b.email" class="pa-sub">{{ b.email }}</span>
        </span>
        <Tag :tone="b.scope === 'org' ? 'terra' : 'ink'">{{ b.scope === 'org' ? 'org' : 'membre' }}</Tag>
        <Tag v-if="b.has_key" tone="cobalt">clé</Tag>
        <Tag v-if="b.has_option" tone="olive">option</Tag>
        <Btn v-if="isSuperAdmin" kind="danger" icon="trash" :disabled="busy" @click="revoke(b)" />
      </div>
      <div v-if="!loading && !granted.length" class="dim" style="padding: 8px 0">
        personne n'a l'accès plateforme à ce connecteur.
      </div>
    </div>
  </div>
</template>

<style scoped>
.pa { padding: 16px 20px; }
.pa-lead { font-size: 12.5px; color: var(--color-mute); margin: 0 0 10px; }
.pa-note { font-size: 11.5px; color: var(--color-mute); padding: 0 0 8px; }
.pa-add { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.pa-add .inp { width: auto; flex: none; }
.pa-search {
  display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;
  padding: 6px 10px; border-radius: var(--radius-md);
  border: 1px solid var(--color-hair); background: var(--color-paper-2);
}
.pa-ic { flex: none; color: var(--color-faint); }
.pa-input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-size: 13px; color: var(--color-ink); }
.pa-cands { margin-bottom: 4px; }
.pa-cand {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 8px; border-radius: var(--radius-md);
  border: 1px solid transparent; background: transparent; text-align: left; cursor: pointer;
}
.pa-cand:hover:not(:disabled) { background: var(--color-paper-2); }
.pa-cand:disabled { opacity: 0.55; cursor: default; }
.pa-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pa-name { font-size: 13px; font-weight: 600; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-sub { font-size: 11px; color: var(--color-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-empty { padding: 6px 8px; font-size: 11.5px; }
.pa-list { margin-top: 8px; }
.pa-item { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-top: 1px solid var(--color-hair-soft); }
</style>

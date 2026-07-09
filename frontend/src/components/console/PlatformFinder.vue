<script setup lang="ts">
import { computed, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import Tag from './Tag.vue'
import { useToast } from '@/composables/useToast'
import { getAdminUsers } from '@/api/console'
import { setViewUser } from '@/lib/viewOrg'
import type { AdminOrgSummary, AdminUser } from '@/types/api'

// Recherche unifiée de l'opérateur plateforme : trouver une ORG ou un COMPTE
// depuis un seul champ. Clic org → gérer sa fiche ci-dessous ; clic compte →
// « voir en tant que » (LECTURE SEULE, ADR 0023, X-Oto-View-As + ViewAsBanner).
// Remonte en haut de page l'ex-popin « voir un compte » (AccountViewAs, retirée).

const props = defineProps<{ orgs: AdminOrgSummary[] }>()
const emit = defineEmits<{ (e: 'select-org', id: number): void }>()

const { toast } = useToast()

const q = ref('')
const users = ref<AdminUser[]>([])
const loadingUsers = ref(false)
const entering = ref(false)

async function loadUsers() {
  if (users.value.length || loadingUsers.value) return
  loadingUsers.value = true
  try { users.value = (await getAdminUsers()).users }
  catch (e) { toast(e instanceof Error && e.message ? e.message : 'impossible de charger les comptes') }
  finally { loadingUsers.value = false }
}

const needle = computed(() => q.value.trim().toLowerCase())

const orgResults = computed<AdminOrgSummary[]>(() => {
  if (!needle.value) return []
  return props.orgs.filter(o =>
    o.name.toLowerCase().includes(needle.value)
    || (o.domain || '').toLowerCase().includes(needle.value),
  ).slice(0, 6)
})

const userResults = computed<AdminUser[]>(() => {
  if (!needle.value) return []
  return users.value.filter(u =>
    (u.email || '').toLowerCase().includes(needle.value)
    || (u.name || '').toLowerCase().includes(needle.value)
    || u.sub.toLowerCase().includes(needle.value),
  ).slice(0, 6)
})

const hasResults = computed(() => orgResults.value.length > 0 || userResults.value.length > 0)

function pickOrg(o: AdminOrgSummary) {
  q.value = ''
  emit('select-org', o.id)
}

function pickUser(u: AdminUser) {
  if (entering.value) return
  entering.value = true
  setViewUser({ sub: u.sub, name: u.name || u.email || u.sub })
  location.assign('/console')
}
</script>

<template>
  <ConsoleCard title="recherche" sub="trouve une organisation ou un compte — lecture seule, tu verras son dashboard.">
    <div class="pf-search">
      <Icon name="search" :size="15" class="pf-ic" />
      <input v-model="q" class="pf-input" placeholder="org, email, nom…"
             :disabled="entering" @focus="loadUsers" />
    </div>

    <template v-if="needle">
      <div v-if="orgResults.length" class="pf-group">
        <div class="pf-head">organisations</div>
        <button v-for="o in orgResults" :key="o.id" class="pf-opt"
                :disabled="entering" @click="pickOrg(o)">
          <Avatar :src="o.logo_url" :name="o.name" :size="22" shape="square" />
          <span class="pf-id">
            <span class="pf-name">{{ o.name }}</span>
            <span v-if="o.domain" class="pf-meta">{{ o.domain }}</span>
          </span>
          <span class="pf-count">{{ o.member_count }} membre{{ o.member_count === 1 ? '' : 's' }}</span>
        </button>
      </div>

      <div v-if="userResults.length" class="pf-group">
        <div class="pf-head">comptes</div>
        <button v-for="u in userResults" :key="u.sub" class="pf-opt"
                :disabled="entering" @click="pickUser(u)">
          <Avatar :name="u.name || u.email || u.sub" :size="22" />
          <span class="pf-id">
            <span class="pf-name">{{ u.name || u.email || u.sub }}</span>
            <span v-if="u.name && u.email" class="pf-meta">{{ u.email }}</span>
          </span>
          <Tag v-if="u.effective_role !== 'member'" :tone="u.effective_role === 'super_admin' ? 'terra' : 'ink'">
            {{ u.effective_role === 'super_admin' ? 'super admin' : u.effective_role }}
          </Tag>
        </button>
      </div>

      <div v-if="!hasResults" class="pf-empty">
        {{ loadingUsers ? 'chargement…' : 'aucun résultat.' }}
      </div>
    </template>
    <div v-else class="pf-hint">lecture seule — entrer dans un compte t'y montre son dashboard.</div>
  </ConsoleCard>
</template>

<style scoped>
.pf-search {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; border-radius: var(--radius-md);
  border: 1px solid var(--color-hair); background: var(--color-paper-2);
}
.pf-ic { flex: none; color: var(--color-faint); }
.pf-input {
  flex: 1; min-width: 0; border: 0; background: transparent; outline: none;
  font-size: 14px; color: var(--color-ink);
}
.pf-group { margin-top: 10px; }
.pf-head {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint); padding: 2px 4px 5px;
}
.pf-opt {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: var(--radius-md);
  border: 1px solid transparent; background: transparent;
  text-align: left; cursor: pointer;
}
.pf-opt:hover:not(:disabled) { background: var(--color-paper-2); }
.pf-opt:disabled { opacity: 0.55; cursor: default; }
.pf-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pf-name {
  font-size: 13.5px; font-weight: 600; color: var(--color-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pf-meta {
  font-size: 11px; color: var(--color-mute);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pf-count { flex: none; font-size: 11.5px; color: var(--color-faint); }
.pf-empty, .pf-hint { padding: 10px 4px 2px; font-size: 12px; color: var(--color-mute); }
</style>

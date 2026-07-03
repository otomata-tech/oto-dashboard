<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { useToast } from '@/composables/useToast'
import { getAdminUsers } from '@/api/console'
import { setViewUser } from '@/lib/viewOrg'
import type { AdminUser } from '@/types/api'

// Navigation entre comptes pour un opérateur plateforme : chercher un compte →
// « voir en tant que » (LECTURE SEULE, ADR 0023). Réutilise X-Oto-View-As
// (setViewUser) + le bandeau permanent ViewAsBanner. Élève l'action jusqu'ici
// enterrée dans la fiche admin. Écriture au nom d'un tiers = plus tard (audit).

const { toast } = useToast()

const users = ref<AdminUser[]>([])
const loading = ref(false)
const q = ref('')
const entering = ref(false)

async function load() {
  if (users.value.length || loading.value) return
  loading.value = true
  try { users.value = (await getAdminUsers()).users }
  catch (e) { toast(e instanceof Error && e.message ? e.message : 'impossible de charger les comptes') }
  finally { loading.value = false }
}

const results = computed<AdminUser[]>(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return []
  return users.value.filter(u =>
    (u.email || '').toLowerCase().includes(needle)
    || (u.name || '').toLowerCase().includes(needle)
    || u.sub.toLowerCase().includes(needle),
  ).slice(0, 8)
})

function pick(u: AdminUser) {
  if (entering.value) return
  entering.value = true
  setViewUser({ sub: u.sub, name: u.name || u.email || u.sub })
  location.assign('/console')
}
</script>

<template>
  <div class="va">
    <div class="va-head">voir un compte</div>
    <div class="va-search">
      <Icon name="search" :size="13" class="va-ic" />
      <input v-model="q" class="va-input" placeholder="email, nom…"
             :disabled="entering" @focus="load" />
    </div>

    <div v-if="loading && q" class="va-empty">chargement…</div>
    <template v-else-if="q">
      <button v-for="u in results" :key="u.sub" class="va-opt"
              :disabled="entering" @click="pick(u)">
        <Avatar :name="u.name || u.email || u.sub" :size="18" />
        <span class="va-id">
          <span class="va-name">{{ u.name || u.email || u.sub }}</span>
          <span v-if="u.name && u.email" class="va-mail">{{ u.email }}</span>
        </span>
        <span v-if="u.effective_role !== 'member'" class="va-tag">{{ u.effective_role }}</span>
      </button>
      <div v-if="!results.length && !loading" class="va-empty">aucun compte.</div>
    </template>
    <div v-else class="va-hint">lecture seule — tu verras son dashboard.</div>
  </div>
</template>

<style scoped>
.va { display: flex; flex-direction: column; gap: 3px; }
.va-head {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint); padding: 2px 9px 4px;
}
.va-search {
  display: flex; align-items: center; gap: 6px; margin: 0 5px 2px;
  padding: 6px 9px; border-radius: 8px;
  border: 1px solid var(--color-hair); background: var(--color-paper-2);
}
.va-ic { flex: none; color: var(--color-faint); }
.va-input {
  flex: 1; min-width: 0; border: 0; background: transparent; outline: none;
  font-size: 13px; color: var(--color-ink);
}
.va-opt {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 9px; border-radius: 8px;
  border: 1px solid transparent; background: transparent;
  text-align: left; cursor: pointer;
}
.va-opt:hover:not(:disabled) { background: var(--color-paper-2); }
.va-opt:disabled { opacity: 0.55; cursor: default; }
.va-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.va-name {
  font-size: 13px; font-weight: 600; color: var(--color-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.va-mail {
  font-size: 11px; color: var(--color-mute);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.va-tag { font-family: var(--font-mono); font-size: 9.5px; color: var(--color-saffron); }
.va-empty, .va-hint { padding: 6px 9px; font-size: 11.5px; color: var(--color-mute); }
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { getMyOrgs, createMyOrg, listGroups } from '@/api/console'
import { setViewOrg, setViewGroup } from '@/lib/viewOrg'
import type { Org, GroupListItem } from '@/types/api'

// Switcher d'org (+ équipe) monté dans la popin compte. C'est de la CONSULTATION
// pure (ADR 0023) : poser l'org affichée = headers `X-Oto-Org`/`X-Oto-Group` +
// reload, ZÉRO effet MCP (jamais de bascule d'identité Claude depuis le FE — ça
// casserait une conversation en cours). Le « défaut MCP » (org maison) ne vit PLUS
// ici : il a migré sur la page agent context.
//
// Équipe : on n'affiche RIEN tant que l'org courante n'a pas d'équipe dont on est
// membre (cas courant). Si elle en a, changer d'org t'y dépose automatiquement ;
// une ligne discrète permet de basculer entre TES équipes. Fini « toute l'org /
// aucune équipe » (dénué de sens pour les 95 % d'orgs sans équipe).

const emit = defineEmits<{ switched: [] }>()

const { me } = useMe()
const { toast } = useToast()

const orgs = ref<Org[]>([])
const loading = ref(false)
const switching = ref(false)
const creating = ref(false)
const newName = ref('')

// Équipes de l'org courante dont JE suis membre (my_role != null).
const myTeams = ref<GroupListItem[]>([])

function msg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

async function loadOrgs() {
  loading.value = true
  try { orgs.value = (await getMyOrgs()).orgs }
  catch (e) { toast(msg(e, 'impossible de charger tes organisations')) }
  finally { loading.value = false }
}

// « Mes équipes dans l'org X » = groupes où my_role est non nul (l'API listGroups
// renvoie my_role=null pour les équipes dont on n'est pas membre).
async function myTeamsIn(orgId: number): Promise<GroupListItem[]> {
  try { return (await listGroups(orgId)).groups.filter(g => g.my_role != null) }
  catch { return [] }
}

async function loadMyTeams() {
  const orgId = me.value?.active_org
  if (orgId == null) { myTeams.value = []; return }
  myTeams.value = await myTeamsIn(orgId)
}

// Bascule d'org (consultation) : on résout d'abord MON équipe dans l'org cible pour
// m'y déposer (aucune équipe → niveau org ; une → dedans ; plusieurs → la première).
async function pickOrg(o: Org) {
  if (switching.value || o.id === me.value?.active_org) return
  switching.value = true
  const teams = await myTeamsIn(o.id)
  const landing = teams[0]
  setViewGroup(landing ? String(landing.id) : null)
  setViewOrg(String(o.id))
  emit('switched')
  location.reload()
}

// Bascule d'équipe DANS l'org courante (consultation aussi).
async function pickTeam(g: GroupListItem) {
  if (switching.value || g.id === me.value?.active_group) return
  switching.value = true
  setViewGroup(String(g.id))
  emit('switched')
  location.reload()
}

async function createOrg() {
  const name = newName.value.trim()
  if (!name || switching.value) return
  switching.value = true
  try { await createMyOrg(name); setViewOrg(null); setViewGroup(null); location.reload() }
  catch (e) { toast(msg(e, 'échec de la création')); switching.value = false }
}

const showTeams = computed(() => myTeams.value.length > 0)

onMounted(() => { loadOrgs(); loadMyTeams() })
</script>

<template>
  <div class="ws">
    <div class="ws-head">workspace</div>

    <div v-if="loading" class="ws-empty">chargement…</div>
    <template v-else v-for="o in orgs" :key="o.id">
      <button class="ws-opt" :class="{ on: o.id === me?.active_org }"
              :disabled="switching" @click="pickOrg(o)">
        <Avatar v-if="o.logo_url" :src="o.logo_url" :name="o.name" :size="18" shape="square" />
        <span v-else class="ws-mono">{{ (o.name || '?').charAt(0).toUpperCase() }}</span>
        <span class="ws-name">{{ o.name }}</span>
        <span class="ws-tag">{{ o.my_role === 'org_admin' ? 'admin' : 'membre' }}</span>
        <Icon v-if="o.id === me?.active_org" name="check" :size="14" class="ws-check" />
      </button>

      <!-- Ligne équipe : seulement sous l'org courante ET si j'y ai des équipes. -->
      <div v-if="o.id === me?.active_org && showTeams" class="ws-teams">
        <button v-for="g in myTeams" :key="g.id" class="ws-team"
                :class="{ on: g.id === me?.active_group }"
                :disabled="switching" @click="pickTeam(g)">
          <Icon name="check" v-if="g.id === me?.active_group" :size="11" class="ws-team-check" />
          <span class="ws-team-name">{{ g.name }}</span>
          <span v-if="g.my_role === 'group_admin'" class="ws-team-tag">chef</span>
        </button>
      </div>
    </template>

    <form v-if="creating" class="ws-newform" @submit.prevent="createOrg">
      <input v-model="newName" class="ws-input" placeholder="nom du workspace"
             maxlength="80" :disabled="switching" autofocus />
      <button class="ws-create" type="submit" :disabled="switching || !newName.trim()">
        {{ switching ? '…' : 'créer' }}
      </button>
    </form>
    <button v-else class="ws-opt ws-add" :disabled="switching" @click="creating = true">
      <Icon name="plus" :size="13" />
      <span class="ws-name">nouveau workspace</span>
    </button>
  </div>
</template>

<style scoped>
.ws { display: flex; flex-direction: column; gap: 2px; }
.ws-head {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint); padding: 2px 9px 5px;
}
.ws-empty { padding: 8px 9px; font-size: 12px; color: var(--color-mute); }

.ws-opt {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 8px 9px; border-radius: 8px;
  border: 1px solid transparent; background: transparent;
  font-size: 13px; font-weight: 600; color: var(--color-ink); text-align: left; cursor: pointer;
}
.ws-opt:hover:not(:disabled) { background: var(--color-paper-2); }
.ws-opt:disabled { opacity: 0.55; cursor: default; }
.ws-opt.on { background: var(--color-paper-2); }
.ws-mono {
  flex: none; display: grid; place-items: center; width: 18px; height: 18px;
  border-radius: 5px; font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  background: var(--color-surface); border: 1px solid var(--color-hair); color: var(--color-ink-soft);
}
.ws-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-tag { font-family: var(--font-mono); font-size: 9.5px; color: var(--color-mute); }
.ws-check { flex: none; color: var(--color-saffron); }
.ws-add { color: var(--color-mute); font-weight: 600; }
.ws-add:hover:not(:disabled) { color: var(--color-ink); }

/* Équipes de l'org courante (rentrées sous l'org, discrètes) */
.ws-teams {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 9px 6px 34px;
}
.ws-team {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--color-hair); background: var(--color-surface);
  font-size: 11.5px; font-weight: 600; color: var(--color-mute);
}
.ws-team:hover:not(:disabled) { color: var(--color-ink); border-color: var(--color-ink-soft); }
.ws-team:disabled { opacity: 0.55; cursor: default; }
.ws-team.on { border-color: var(--color-saffron); background: var(--color-saffron-soft); color: var(--color-ink); }
.ws-team-check { color: var(--color-saffron); }
.ws-team-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.ws-team-tag { font-family: var(--font-mono); font-size: 9px; color: var(--color-mute); }

.ws-newform { display: flex; gap: 6px; padding: 4px 9px; }
.ws-input {
  flex: 1; min-width: 0; padding: 7px 9px; font-size: 13px;
  border: 1px solid var(--color-hair); border-radius: 8px;
  background: var(--color-paper-2); color: var(--color-ink); outline: none;
}
.ws-input:focus { border-color: var(--color-saffron); }
.ws-create {
  border: 0; border-radius: 8px; padding: 0 12px; cursor: pointer;
  background: var(--color-saffron); color: #fff;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600; white-space: nowrap;
}
.ws-create:disabled { opacity: 0.5; cursor: default; }
</style>

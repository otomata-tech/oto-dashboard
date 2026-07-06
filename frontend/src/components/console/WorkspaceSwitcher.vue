<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import Avatar from './Avatar.vue'
import { useMe } from '@/composables/useMe'
import { useMyOrgs } from '@/composables/useMyOrgs'
import { useToast } from '@/composables/useToast'
import { createMyOrg, setActiveOrg } from '@/api/console'
import type { Org, GroupListItem } from '@/types/api'

// Switcher d'org (+ équipe). C'est de la CONSULTATION pure (ADR 0023), ZÉRO effet MCP
// (jamais de bascule d'identité Claude depuis le FE — ça casserait une conversation en
// cours). Depuis 2026-07-06 l'org de consultation vit dans l'URL (`/o/:orgId/…`) : choisir
// une org = NAVIGUER vers `/o/<id>/<section courante>` (le routeur synchronise le scope).
// Chaque org a donc son URL bookmarkable. La pastille « maison » (défaut MCP) reste le
// seul geste qui écrit côté serveur (setActiveOrg).
//
// Équipe : on n'affiche RIEN tant que l'org courante n'a pas d'équipe dont on est
// membre (cas courant). Une ligne discrète permet de basculer entre TES équipes.
// Fini « toute l'org / aucune équipe » (dénué de sens pour les 95 % d'orgs sans équipe).

const emit = defineEmits<{ switched: [] }>()

const route = useRoute()
const router = useRouter()
const { me } = useMe()
const { orgs, loadOrgs, loadMyTeams: loadTeamsOf } = useMyOrgs()
const { toast } = useToast()

// Section courante (canonique, sans préfixe `/o/:orgId`) où déposer la nouvelle org —
// seulement si elle est org-scopée (sinon `/o/:id/account` n'existe pas → overview).
const landingSection = () =>
  route.meta.orgScoped ? String(route.meta.section || '/overview') : '/overview'
// Naviguer vers une org (consultation, niveau org) : `/o/<id>/<section>`.
function goToOrg(orgId: number, section?: string) {
  return router.push(`/o/${orgId}${section ?? landingSection()}`)
}
// Naviguer vers une équipe DANS une org (consultation) : `/o/<id>/g/<gid>/<section>`.
function goToTeam(orgId: number, groupId: number) {
  return router.push(`/o/${orgId}/g/${groupId}${landingSection()}`)
}

const loading = ref(false)
const switching = ref(false)
const creating = ref(false)
const newName = ref('')
const filter = ref('')

// Équipes de l'org courante dont JE suis membre (my_role != null).
const myTeams = ref<GroupListItem[]>([])

function msg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

// Org active épinglée en tête, le reste en ordre alpha (scannable quand il y en
// a beaucoup) ; au-delà de quelques orgs, un filtre + un scroll interne à la liste
// (les entrées de gestion de la popin restent toujours visibles).
const sorted = computed(() => {
  const active = me.value?.active_org
  return [...(orgs.value ?? [])].sort((a, b) =>
    (b.id === active ? 1 : 0) - (a.id === active ? 1 : 0)
    || (a.name || '').localeCompare(b.name || '', 'fr'))
})
const filterable = computed(() => (orgs.value?.length ?? 0) > 7)
const shown = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return needle ? sorted.value.filter((o) => (o.name || '').toLowerCase().includes(needle)) : sorted.value
})

// Équipes d'une org (cache module) — un échec ne bloque pas la bascule.
async function myTeamsIn(orgId: number): Promise<GroupListItem[]> {
  try { return await loadTeamsOf(orgId) }
  catch { return [] }
}

async function loadMyTeams() {
  const orgId = me.value?.active_org
  if (orgId == null) { myTeams.value = []; return }
  myTeams.value = await myTeamsIn(orgId)
}

// Bascule d'org (consultation) = navigation vers son URL. Le routeur (afterEach) efface
// l'équipe consultée (une équipe appartient à une org). On atterrit au niveau org ; les
// chips d'équipe permettent d'entrer ensuite dans TON équipe.
async function pickOrg(o: Org) {
  if (switching.value || o.id === me.value?.active_org) return
  switching.value = true
  emit('switched')
  await goToOrg(o.id)
}

// Bascule d'équipe DANS l'org courante (consultation) = navigation vers son URL
// `/o/<org>/g/<gid>/…`. L'org courante = celle qu'on consulte (me.active_org).
async function pickTeam(g: GroupListItem) {
  const org = me.value?.active_org
  if (switching.value || org == null || g.id === me.value?.active_group) return
  switching.value = true
  emit('switched')
  await goToTeam(org, g.id)
}

async function createOrg() {
  const name = newName.value.trim()
  if (!name || switching.value) return
  switching.value = true
  try {
    const r = await createMyOrg(name)
    emit('switched')
    await goToOrg(r.org_id, '/overview')
  } catch (e) { toast(msg(e, 'échec de la création')); switching.value = false }
}

// Org MCP (MAISON) : le SEUL geste qui touche le MCP (setActiveOrg = PUT active-org).
// Distinct de la consultation (navigation, zéro effet MCP). On définit la maison PUIS on
// la consulte (navigation vers son URL).
async function setHome(o: Org) {
  if (switching.value || o.id === me.value?.home_org) return
  switching.value = true
  try {
    await setActiveOrg(o.id)
    emit('switched')
    await goToOrg(o.id)
  } catch (e) { toast(msg(e, "échec de la définition de l'org MCP")); switching.value = false }
}

const showTeams = computed(() => myTeams.value.length > 0)

// SWR : cache présent (préchargé au survol ou ouverture précédente) → affichage
// immédiat + refresh silencieux en fond ; sinon chargement visible.
onMounted(async () => {
  loadMyTeams()
  if (orgs.value != null) { loadOrgs(true).catch(() => {}); return }
  loading.value = true
  try { await loadOrgs() }
  catch (e) { toast(msg(e, 'impossible de charger tes organisations')) }
  finally { loading.value = false }
})
</script>

<template>
  <div class="ws">
    <div class="ws-head">workspace</div>

    <div v-if="loading" class="ws-empty">chargement…</div>
    <template v-else>
      <input v-if="filterable" v-model="filter" class="inp sm ws-filter"
             placeholder="filtrer les workspaces…" aria-label="filtrer les workspaces" />
      <div class="ws-list">
        <template v-for="o in shown" :key="o.id">
          <!-- Ligne org : bouton CONSULTATION (view-as) + pastille MAISON (défaut MCP).
               Deux boutons frères (jamais imbriqués) pour rester du HTML valide. -->
          <div class="ws-row" :class="{ on: o.id === me?.active_org }">
            <button class="ws-opt" :disabled="switching" @click="pickOrg(o)">
              <Avatar v-if="o.logo_url" :src="o.logo_url" :name="o.name" :size="18" shape="square" />
              <span v-else class="ws-mono">{{ (o.name || '?').charAt(0).toUpperCase() }}</span>
              <span class="ws-name">{{ o.name }}</span>
              <span class="ws-tag">{{ o.my_role === 'org_admin' ? 'admin' : 'membre' }}</span>
              <Icon v-if="o.id === me?.active_org" name="check" :size="14" class="ws-check" />
            </button>
            <!-- Org MCP (maison) : le défaut de tes conversations Claude. Pastille inerte
                 quand c'est déjà la maison, bouton « définir » sinon. -->
            <span v-if="o.id === me?.home_org" class="ws-home on"
                  title="org MCP — défaut de tes conversations Claude">
              <Icon name="home" :size="12" /> maison
            </span>
            <button v-else class="ws-home" :disabled="switching"
                    title="définir comme org MCP (défaut de tes conversations Claude)"
                    @click="setHome(o)">
              <Icon name="home" :size="12" /> définir
            </button>
          </div>

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
        <div v-if="filterable && !shown.length" class="ws-empty">aucun workspace ne correspond</div>
      </div>
      <p class="ws-legend">
        <Icon name="check" :size="11" /> consultation (ce tableau de bord) ·
        <Icon name="home" :size="11" /> maison (défaut de tes conversations Claude)
      </p>
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
.ws-filter { margin: 0 0 4px; }
/* la LISTE scrolle, pas la popin : gestion + logout restent toujours visibles */
.ws-list { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; max-height: 290px; }

/* Ligne = bouton consultation (élastique) + pastille maison (fixe) */
.ws-row { display: flex; align-items: center; gap: 4px; border-radius: 8px; }
.ws-row.on { background: var(--color-paper-2); }

.ws-opt {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 9px;
  padding: 8px 9px; border-radius: 8px;
  border: 1px solid transparent; background: transparent;
  font-size: 13px; font-weight: 600; color: var(--color-ink); text-align: left; cursor: pointer;
}
.ws-opt:hover:not(:disabled) { background: var(--color-paper-2); }
.ws-opt:disabled { opacity: 0.55; cursor: default; }

/* Pastille « org MCP (maison) » — pill, distincte du check de consultation */
.ws-home {
  flex: none; display: inline-flex; align-items: center; gap: 3px;
  padding: 4px 8px; border-radius: var(--radius-pill);
  border: 1px solid var(--color-hair); background: var(--color-surface);
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--color-mute); cursor: pointer; white-space: nowrap;
}
.ws-home:hover:not(:disabled) { color: var(--color-ink); border-color: var(--color-ink-soft); }
.ws-home:disabled { opacity: 0.55; cursor: default; }
.ws-home.on {
  border-color: var(--color-saffron); background: var(--color-saffron-soft);
  color: var(--color-saffron-ink); cursor: default;
}

.ws-legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  padding: 7px 9px 2px; font-size: 10px; line-height: 1.5; color: var(--color-faint);
}
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

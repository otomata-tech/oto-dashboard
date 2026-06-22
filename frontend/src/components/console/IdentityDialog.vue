<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { getMyOrgs, setActiveOrg, clearActiveOrg, createMyOrg, listGroups, useGroup } from '@/api/console'
import { setViewOrg, setViewGroup } from '@/lib/viewOrg'
import type { Org, GroupListItem } from '@/types/api'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { me } = useMe()
const { toast } = useToast()

const orgs = ref<Org[]>([])
const loading = ref(false)
const switching = ref(false)
const creating = ref(false)
const newName = ref('')

// Équipes (groupes) de l'org active — chargées seulement si une org est active.
const groups = ref<GroupListItem[]>([])
const groupsLoading = ref(false)

// Le contexte AFFICHÉ (org + équipe) est-il déjà la maison ? Et regarde-t-on son
// org maison ? (les badges « maison » d'équipe n'ont de sens que dans la maison —
// home_group appartient à home_org, pas à une org consultée).
const viewedIsHome = computed(() => !!me.value
  && me.value.active_org === me.value.home_org
  && me.value.active_group === me.value.home_group)
const viewingHomeOrg = computed(() => !!me.value && me.value.active_org === me.value.home_org)

async function loadOrgs() {
  loading.value = true
  try { orgs.value = (await getMyOrgs()).orgs }
  catch (e) { toast(msg(e, 'impossible de charger tes organisations')) }
  finally { loading.value = false }
}

async function loadGroups() {
  const orgId = me.value?.active_org
  if (orgId == null) { groups.value = []; return }
  groupsLoading.value = true
  try { groups.value = (await listGroups(orgId)).groups }
  catch (e) { toast(msg(e, 'impossible de charger les équipes')) }
  finally { groupsLoading.value = false }
}

function msg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

// CONSULTATION (view-as, ADR 0023) : choisir une org ici change seulement CE QUE
// LE DASHBOARD AFFICHE — pas l'identité sous laquelle Claude agit (qui se règle
// dans Claude via oto_use_org). On pose le header de consultation (localStorage)
// et on recharge ; les vues sont org-scopées. Zéro effet MCP.
async function pickOrg(o: Org) {
  if (switching.value || o.id === me.value?.active_org) return
  switching.value = true
  setViewOrg(String(o.id)); setViewGroup(null); location.reload()   // org change → drop l'équipe
}

async function pickPerso() {
  if (switching.value || me.value?.active_org == null) return
  switching.value = true
  setViewOrg('0'); setViewGroup(null); location.reload()
}

// MAISON (org par défaut des prochaines conversations Claude) : action explicite,
// distincte de la consultation. Agit sur l'org actuellement AFFICHÉE : on la pose
// comme maison côté backend, on efface la consultation (on regarde désormais la
// maison) et on recharge. C'est le seul geste de cette modale qui touche le MCP.
async function setHomeCurrent() {
  if (switching.value) return
  switching.value = true
  const org = me.value?.active_org ?? null
  const grp = me.value?.active_group ?? null
  try {
    if (grp != null) await useGroup(grp)            // REST → équipe maison + org parente
    else if (org != null) await setActiveOrg(org)   // org maison (efface l'équipe)
    else await clearActiveOrg()                      // perso
    setViewOrg(null); setViewGroup(null); location.reload()
  } catch (e) { toast(msg(e, 'échec')); switching.value = false }
}

async function createOrg() {
  const name = newName.value.trim()
  if (!name || switching.value) return
  switching.value = true
  try { await createMyOrg(name); setViewOrg(null); location.reload() }
  catch (e) { toast(msg(e, 'échec de la création')); switching.value = false }
}

// Bascule d'équipe = CONSULTATION (view-as), comme l'org : zéro effet MCP.
async function pickGroup(g: GroupListItem) {
  if (switching.value || g.id === me.value?.active_group) return
  switching.value = true
  setViewGroup(String(g.id)); location.reload()
}

async function pickNoGroup() {
  if (switching.value || me.value?.active_group == null) return
  switching.value = true
  setViewGroup(null); location.reload()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}
onMounted(() => { window.addEventListener('keydown', onKeydown); loadOrgs(); loadGroups() })
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="organisation & équipe">
        <header class="id-head">
          <span class="id-medallion"><Icon name="plug" :size="15" /></span>
          <div class="id-head-txt">
            <h3 class="modal-title">organisation & équipe</h3>
            <p class="modal-desc">ce que <strong>ce dashboard</strong> affiche. Pour changer l'org sous laquelle <strong>Claude</strong> agit, dis-lui <code>oto_use_org</code>.</p>
          </div>
          <button class="id-close" aria-label="fermer" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <!-- Compte (sub) : fixé par l'OAuth claude.ai — non modifiable ici -->
        <section class="id-sect">
          <div class="id-sect-head">compte</div>
          <div class="id-account">
            <Avatar :src="me?.avatar_url || undefined" :name="me?.email || '?'" :size="26" />
            <div class="id-account-id">
              <span class="id-account-mail">{{ me?.email || '—' }}</span>
              <span class="id-account-role">{{ me?.role || 'member' }}</span>
            </div>
          </div>
          <p class="id-note">
            <Icon name="ext" :size="11" />
            pour changer de compte, reconnecte le connecteur OTO dans claude.ai.
          </p>
        </section>

        <!-- Organisation AFFICHÉE (consultation, view-as) : choisir ici re-scope le
             dashboard seulement — aucun effet sur Claude. Le badge « maison » marque
             le défaut MCP des prochaines conversations. -->
        <section class="id-sect">
          <div class="id-sect-head">organisation affichée</div>
          <button class="id-opt" :class="{ on: me?.active_org == null }"
                  :disabled="switching" @click="pickPerso">
            <Dot :tone="me?.active_org == null ? 'saffron' : 'faint'" :size="6" />
            <span class="id-opt-name">Perso</span>
            <span class="id-opt-tag">global</span>
            <span v-if="me?.home_org == null" class="id-home-badge">maison</span>
            <span v-else-if="me?.active_org == null && me?.active_group == null && !viewedIsHome"
                  class="id-sethome-inline" :title="'défaut des prochaines conversations Claude'"
                  @click.stop="setHomeCurrent">définir maison</span>
            <Icon v-if="me?.active_org == null" name="check" :size="13" class="id-check" />
          </button>

          <div v-if="loading" class="id-empty">chargement…</div>
          <button v-for="o in orgs" :key="o.id" class="id-opt"
                  :class="{ on: o.id === me?.active_org }"
                  :disabled="switching" @click="pickOrg(o)">
            <Avatar v-if="o.logo_url" :src="o.logo_url" :name="o.name" :size="16" shape="square" />
            <Dot v-else :tone="o.id === me?.active_org ? 'saffron' : 'faint'" :size="6" />
            <span class="id-opt-name">{{ o.name }}</span>
            <span class="id-opt-tag">{{ o.my_role === 'org_admin' ? 'admin' : 'member' }}</span>
            <span v-if="o.id === me?.home_org" class="id-home-badge">maison</span>
            <span v-else-if="o.id === me?.active_org && me?.active_group == null && !viewedIsHome"
                  class="id-sethome-inline" :title="'défaut des prochaines conversations Claude'"
                  @click.stop="setHomeCurrent">définir maison</span>
            <Icon v-if="o.id === me?.active_org" name="check" :size="13" class="id-check" />
          </button>

          <form v-if="creating" class="id-newform" @submit.prevent="createOrg">
            <input v-model="newName" class="id-input" placeholder="nom du workspace"
                   maxlength="80" :disabled="switching" autofocus />
            <button class="id-create" type="submit" :disabled="switching || !newName.trim()">
              {{ switching ? '…' : 'créer' }}
            </button>
          </form>
          <button v-else class="id-opt id-add" :disabled="switching" @click="creating = true">
            <Icon name="plus" :size="13" />
            <span class="id-opt-name">nouveau workspace</span>
          </button>
        </section>

        <!-- Équipe active (groupe) : seulement si une org est active ; les équipes
             appartiennent à l'org. Bascule = même contrat que l'org (reload). -->
        <section v-if="me?.active_org != null" class="id-sect">
          <div class="id-sect-head">équipe affichée</div>
          <button class="id-opt" :class="{ on: me?.active_group == null }"
                  :disabled="switching" @click="pickNoGroup">
            <Dot :tone="me?.active_group == null ? 'saffron' : 'faint'" :size="6" />
            <span class="id-opt-name">toute l'org</span>
            <span class="id-opt-tag">aucune équipe</span>
            <span v-if="viewingHomeOrg && me?.home_group == null" class="id-home-badge">maison</span>
            <Icon v-if="me?.active_group == null" name="check" :size="13" class="id-check" />
          </button>

          <div v-if="groupsLoading" class="id-empty">chargement…</div>
          <button v-for="g in groups" :key="g.id" class="id-opt"
                  :class="{ on: g.id === me?.active_group }"
                  :disabled="switching" @click="pickGroup(g)">
            <Dot :tone="g.id === me?.active_group ? 'saffron' : 'faint'" :size="6" />
            <span class="id-opt-name">{{ g.name }}</span>
            <span class="id-opt-tag">{{ g.my_role === 'group_admin' ? 'chef' : 'membre' }}</span>
            <span v-if="viewingHomeOrg && g.id === me?.home_group" class="id-home-badge">maison</span>
            <span v-else-if="g.id === me?.active_group && !viewedIsHome"
                  class="id-sethome-inline" :title="'défaut des prochaines conversations Claude'"
                  @click.stop="setHomeCurrent">définir maison</span>
            <Icon v-if="g.id === me?.active_group" name="check" :size="13" class="id-check" />
          </button>
          <div v-if="!groupsLoading && !groups.length" class="id-empty">
            aucune équipe dans cette org.
          </div>
        </section>

        <!-- Trois notions distinctes (ADR 0023) : ce qui change quoi. -->
        <section class="id-howto">
          <div class="id-sect-head">qui décide de quoi</div>
          <ul class="id-howto-list">
            <li>
              <strong>ici (ce dashboard)</strong> — tu choisis l'org <em>affichée</em>.
              Consultation pure : aucun effet sur Claude.
            </li>
            <li>
              <strong>org maison</strong> — le défaut des <strong>prochaines</strong>
              conversations Claude. Se règle avec « définir comme org maison » ci-dessus.
            </li>
            <li>
              <strong>dans une conversation Claude</strong> — dis-lui
              <code>oto_use_org &lt;org&gt;</code> : il agit sous cette org <em>pour cette
              conversation seulement</em> (éphémère, retour à la maison ensuite).
            </li>
          </ul>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: color-mix(in srgb, var(--color-ink) 30%, transparent);
  backdrop-filter: blur(2px);
}
.modal {
  width: 100%; max-width: 440px; background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 14px; padding: 18px 20px 20px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}

/* En-tête */
.id-head { display: flex; align-items: flex-start; gap: 11px; }
.id-medallion {
  flex: none; display: grid; place-items: center; width: 30px; height: 30px;
  border-radius: 9px; color: var(--color-saffron);
  background: var(--color-saffron-soft); border: 1px solid var(--color-hair);
}
.id-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 12px; color: var(--color-mute); margin: 3px 0 0; line-height: 1.45; }
.id-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.id-close:hover { background: var(--color-paper-2); color: var(--color-ink); }

/* Sections */
.id-sect { margin-top: 16px; }
.id-sect-head {
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-faint); margin-bottom: 7px;
}

/* Compte */
.id-account {
  display: flex; align-items: center; gap: 10px; padding: 9px 11px;
  background: var(--color-paper-2); border: 1px solid var(--color-hair); border-radius: 10px;
}
.id-account-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.id-account-mail { font-size: 13px; font-weight: 600; color: var(--color-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.id-account-role { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em;
  color: var(--color-mute); }
.id-note {
  display: flex; align-items: center; gap: 5px; margin: 7px 1px 0;
  font-size: 11.5px; color: var(--color-faint); line-height: 1.4;
}

/* Liste d'org */
.id-opt {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 9px 11px; margin-top: 5px; border-radius: 9px;
  border: 1px solid transparent; background: var(--color-paper-2);
  font-size: 13px; font-weight: 600; color: var(--color-ink); text-align: left; cursor: pointer;
}
.id-opt:first-of-type { margin-top: 0; }
.id-opt:hover:not(:disabled) { border-color: var(--color-hair); }
.id-opt:disabled { opacity: 0.55; cursor: default; }
.id-opt.on { border-color: var(--color-saffron); background: var(--color-saffron-soft); }
.id-opt-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.id-opt-tag { font-family: var(--font-mono); font-size: 10px; color: var(--color-mute); }
.id-check { color: var(--color-saffron); }
.id-home-badge {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 1px 6px; border-radius: 5px;
  background: var(--color-olive-soft); color: var(--color-olive-ink);
  border: 1px solid var(--color-hair);
}
.id-sethome-inline {
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.02em;
  padding: 2px 7px; border-radius: 6px; white-space: nowrap;
  border: 1px dashed var(--color-hair); background: var(--color-surface);
  color: var(--color-mute); cursor: pointer;
}
.id-sethome-inline:hover { border-color: var(--color-saffron); color: var(--color-ink); }
.id-add { color: var(--color-mute); font-weight: 600; }
.id-add:hover:not(:disabled) { color: var(--color-ink); }
.id-empty { padding: 9px 11px; font-size: 12px; color: var(--color-mute); }

/* Création */
.id-newform { display: flex; gap: 6px; margin-top: 5px; }
.id-input {
  flex: 1; min-width: 0; padding: 9px 11px; font-size: 13px;
  border: 1px solid var(--color-hair); border-radius: 9px;
  background: var(--color-paper-2); color: var(--color-ink); outline: none;
}
.id-input:focus { border-color: var(--color-saffron); }
.id-create {
  border: 0; border-radius: 9px; padding: 0 14px; cursor: pointer;
  background: var(--color-saffron); color: #fff;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600; white-space: nowrap;
}
.id-create:disabled { opacity: 0.5; cursor: default; }

/* HOWTO */
.id-howto {
  margin-top: 18px; padding: 12px 13px; border-radius: 11px;
  background: var(--color-paper-2); border: 1px solid var(--color-hair);
}
.id-howto-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.id-howto-list li { font-size: 12px; color: var(--color-ink-soft); line-height: 1.5; }
.id-howto-list strong { color: var(--color-ink); font-weight: 700; }
.id-howto-list code {
  font-family: var(--font-mono); font-size: 11px; padding: 1px 5px; border-radius: 5px;
  background: var(--color-surface); border: 1px solid var(--color-hair); color: var(--color-ink);
}
.id-howto-sub { display: block; margin-top: 2px; color: var(--color-faint); font-size: 11px; }

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>

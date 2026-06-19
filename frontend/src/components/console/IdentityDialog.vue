<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import Dot from './Dot.vue'
import Avatar from './Avatar.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { getMyOrgs, setActiveOrg, clearActiveOrg, createMyOrg } from '@/api/console'
import type { Org } from '@/types/api'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { me } = useMe()
const { toast } = useToast()

const orgs = ref<Org[]>([])
const loading = ref(false)
const switching = ref(false)
const creating = ref(false)
const newName = ref('')

async function loadOrgs() {
  loading.value = true
  try { orgs.value = (await getMyOrgs()).orgs }
  catch (e) { toast(msg(e, 'impossible de charger tes organisations')) }
  finally { loading.value = false }
}

function msg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

// Toute bascule recharge la page : les vues du dashboard sont org-scopées
// (toolbox, doctrine, secrets, billing). L'erreur n'est plus avalée (≠ bug
// d'origine du catch muet) — on la remonte en toast.
async function pickOrg(o: Org) {
  if (switching.value || o.id === me.value?.active_org) return
  switching.value = true
  try { await setActiveOrg(o.id); location.reload() }
  catch (e) { toast(msg(e, 'échec de la bascule')); switching.value = false }
}

async function pickPerso() {
  if (switching.value || me.value?.active_org == null) return
  switching.value = true
  try { await clearActiveOrg(); location.reload() }
  catch (e) { toast(msg(e, 'échec de la bascule')); switching.value = false }
}

async function createOrg() {
  const name = newName.value.trim()
  if (!name || switching.value) return
  switching.value = true
  try { await createMyOrg(name); location.reload() }
  catch (e) { toast(msg(e, 'échec de la création')); switching.value = false }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}
onMounted(() => { window.addEventListener('keydown', onKeydown); loadOrgs() })
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="identité MCP">
        <header class="id-head">
          <span class="id-medallion"><Icon name="plug" :size="15" /></span>
          <div class="id-head-txt">
            <h3 class="modal-title">identité MCP</h3>
            <p class="modal-desc">sous quelle identité Claude agit quand il appelle tes outils.</p>
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

        <!-- Org active (profil) : modifiable ici -->
        <section class="id-sect">
          <div class="id-sect-head">org active (profil)</div>
          <button class="id-opt" :class="{ on: me?.active_org == null }"
                  :disabled="switching" @click="pickPerso">
            <Dot :tone="me?.active_org == null ? 'saffron' : 'faint'" :size="6" />
            <span class="id-opt-name">Perso</span>
            <span class="id-opt-tag">global</span>
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

        <!-- HOWTO : ce que la bascule fait (et ne fait pas) sur une session Claude ouverte -->
        <section class="id-howto">
          <div class="id-sect-head">propagation vers Claude</div>
          <ul class="id-howto-list">
            <li>
              <strong>prochaines conversations</strong> — elles démarrent sur cette identité.
            </li>
            <li>
              <strong>conversation déjà ouverte</strong> — dis à Claude
              <code>oto_use_org &lt;org&gt;</code> : la toolbox se recharge en direct.
              <span class="id-howto-sub">(les données/comptes basculent immédiatement ; seule la
              liste d'outils a besoin de ce signal.)</span>
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

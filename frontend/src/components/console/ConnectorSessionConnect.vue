<script setup lang="ts">
// Connexion d'un connecteur à session navigateur (brevo/crunchbase) DEPUIS le dashboard.
// `start` ouvre un Chrome distant (Browserbase) et renvoie une Live View affichée ici
// en **iframe** : l'utilisateur se logue normalement (SSO/captcha/2FA) dans la fenêtre.
// « Vérifier » appelle `finalize` qui contrôle le login sur la session vivante et
// persiste le Context (= credential). Aucun MCP, aucune capture de cookie.
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import { startConnectorSession, finalizeConnectorSession } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import type { MyConnector } from '@/types/api'

type Scope = 'member' | 'org' | 'group'
const props = defineProps<{ open: boolean; connector: MyConnector }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'connected'): void }>()

const { me } = useMe()
const { toast } = useToast()
const loading = ref(false)
const error = ref<string | null>(null)
const liveUrl = ref<string | null>(null)
const ctxId = ref<string | null>(null)
const sessId = ref<string | null>(null)
const verifying = ref(false)
// Agrandissement : le navigateur distant est étriqué dans la modale par défaut ;
// « agrandir » bascule la modale en quasi-plein écran pour se loguer confortablement.
const maximized = ref(false)

// Niveau où poser la session (ADR 0038/0044) : perso, équipe active, ou org. Les
// niveaux partagés n'apparaissent que si le connecteur est org-partageable (byo_org)
// ET que j'ai les droits (org_admin pour l'org, chef d'équipe/org_admin pour l'équipe).
const scope = ref<Scope>('member')
const scopeOptions = computed(() => {
  const opts: { value: Scope; label: string; hint: string }[] = [
    { value: 'member', label: 'Pour moi', hint: 'session privée à ton compte' },
  ]
  if (!props.connector.auth_modes?.includes('byo_org')) return opts
  const isOrgAdmin = me.value?.org_role === 'org_admin'
  if (me.value?.active_group != null && (me.value?.group_role === 'group_admin' || isOrgAdmin))
    opts.push({ value: 'group', label: 'Mon équipe', hint: `partagée avec ${me.value?.active_group_name || 'ton équipe'}` })
  if (isOrgAdmin)
    opts.push({ value: 'org', label: 'Mon org', hint: `partagée avec ${me.value?.active_org_name || 'ton org'}` })
  return opts
})
const scopeHint = computed(() => scopeOptions.value.find((o) => o.value === scope.value)?.hint || '')

async function begin() {
  loading.value = true
  error.value = null
  liveUrl.value = null
  try {
    const r = await startConnectorSession(props.connector.name)
    liveUrl.value = r.live_view_url
    ctxId.value = r.context_id
    sessId.value = r.session_id
  } catch (e) {
    error.value = humanize(e)
  } finally {
    loading.value = false
  }
}

async function verify() {
  if (!ctxId.value || !sessId.value) return
  verifying.value = true
  try {
    const { connected } = await finalizeConnectorSession(props.connector.name, {
      context_id: ctxId.value, session_id: sessId.value, scope: scope.value,
    })
    if (connected) {
      toast(`${props.connector.label} connecté`)
      emit('connected')
      emit('close')
    } else {
      toast('pas encore connecté — termine le login dans la fenêtre puis réessaie')
    }
  } catch (e) {
    toast(humanize(e))
  } finally {
    verifying.value = false
  }
}

watch(() => props.open, (o) => {
  if (o) { begin(); scope.value = 'member' }
  else maximized.value = false
})
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" :class="{ max: maximized }" role="dialog" aria-modal="true" :aria-label="`connect ${connector.label}`">
        <header class="cs-head">
          <div class="cs-head-txt">
            <h3 class="modal-title">connecter {{ connector.label }}</h3>
            <p class="modal-desc">connecte-toi dans la fenêtre ci-dessous (mot de passe, SSO,
              captcha…), puis clique « vérifier ». {{ scope === 'member'
                ? 'Ta session reste privée à ton compte.'
                : `Session ${scopeHint}.` }}</p>
            <div v-if="scopeOptions.length > 1" class="cs-scope">
              <span class="cs-scope-lbl dim">configurer&nbsp;:</span>
              <div class="cs-seg" role="tablist">
                <button v-for="o in scopeOptions" :key="o.value" class="cs-seg-btn"
                  :class="{ on: scope === o.value }" :title="o.hint" role="tab"
                  :aria-selected="scope === o.value" @click="scope = o.value">{{ o.label }}</button>
              </div>
            </div>
          </div>
          <button class="cs-close" :aria-label="maximized ? 'réduire' : 'agrandir'"
            :title="maximized ? 'réduire' : 'agrandir'" @click="maximized = !maximized">
            <Icon :name="maximized ? 'minimize' : 'maximize'" :size="15" />
          </button>
          <button class="cs-close" aria-label="fermer" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <div class="cs-body">
          <div v-if="loading" class="cs-state dim">ouverture du navigateur distant…</div>
          <div v-else-if="error" class="cs-state">
            <p class="cs-err">{{ error }}</p>
            <Btn kind="mini" @click="begin">Réessayer</Btn>
          </div>
          <iframe v-else-if="liveUrl" :src="liveUrl" class="cs-frame"
            allow="clipboard-read; clipboard-write" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
        </div>

        <footer class="cs-foot">
          <span class="dim" style="flex: 1; font-size: 12px">la session expire après ~15 min d'inactivité</span>
          <Btn kind="ghost" @click="emit('close')">Annuler</Btn>
          <Btn :disabled="!liveUrl || verifying" @click="verify">
            {{ verifying ? 'Vérification…' : 'Vérifier' }}
          </Btn>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: color-mix(in srgb, var(--color-ink) 30%, transparent); backdrop-filter: blur(2px);
}
.modal {
  width: 100%; max-width: 960px; background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
  display: flex; flex-direction: column; max-height: 90vh;
  transition: max-width .18s var(--ease-out, ease), max-height .18s var(--ease-out, ease);
}
/* Agrandi : quasi plein écran pour un login confortable dans le navigateur distant. */
.modal.max { max-width: none; width: 96vw; max-height: 96vh; }
.modal.max .cs-frame { height: auto; flex: 1; }
.cs-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 18px 10px; }
.cs-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 12px; color: var(--color-mute); margin: 4px 0 0; }
.cs-scope { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.cs-scope-lbl { font-size: 11.5px; }
.cs-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-pill);
  background: var(--color-paper-2); border: 1px solid var(--color-hair-soft); }
.cs-seg-btn { border: 0; background: transparent; cursor: pointer; font-size: 11.5px;
  padding: 3px 10px; border-radius: var(--radius-pill); color: var(--color-mute); line-height: 1.4; }
.cs-seg-btn.on { background: var(--color-bg); color: var(--color-ink);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--color-ink) 12%, transparent); }
.cs-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.cs-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.cs-body { padding: 0 18px; flex: 1; min-height: 0; display: flex; }
.cs-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 320px; }
.cs-err { color: var(--color-terra); font-size: 13px; margin: 0; text-align: center; }
.cs-frame {
  width: 100%; height: 62vh; border: 1px solid var(--color-hair-soft);
  border-radius: 8px; background: var(--color-surface);
}
.cs-foot {
  display: flex; align-items: center; gap: 8px; padding: 12px 18px 16px;
  border-top: 1px solid var(--color-hair-soft); margin-top: 10px;
}
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>

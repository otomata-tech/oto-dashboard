<script setup lang="ts">
// Connexion d'un connecteur à session navigateur (brevo/crunchbase) DEPUIS le dashboard.
// `start` ouvre un Chrome distant (Browserbase) et renvoie une Live View affichée ici
// en **iframe** : l'utilisateur se logue normalement (SSO/captcha/2FA) dans la fenêtre.
// « Vérifier » appelle `finalize` qui contrôle le login sur la session vivante et
// persiste le Context (= credential). Aucun MCP, aucune capture de cookie.
import { ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import { startConnectorSession, finalizeConnectorSession } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { humanize } from '@/lib/errors'
import type { MyConnector } from '@/types/api'

const props = defineProps<{ open: boolean; connector: MyConnector }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'connected'): void }>()

const { toast } = useToast()
const loading = ref(false)
const error = ref<string | null>(null)
const liveUrl = ref<string | null>(null)
const ctxId = ref<string | null>(null)
const sessId = ref<string | null>(null)
const verifying = ref(false)

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
      context_id: ctxId.value, session_id: sessId.value,
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

watch(() => props.open, (o) => { if (o) begin() })
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="`connect ${connector.label}`">
        <header class="cs-head">
          <div class="cs-head-txt">
            <h3 class="modal-title">connecter {{ connector.label }}</h3>
            <p class="modal-desc">connecte-toi dans la fenêtre ci-dessous (mot de passe, SSO,
              captcha…), puis clique « vérifier ». Ta session reste privée à ton compte.</p>
          </div>
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
}
.cs-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 18px 10px; }
.cs-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 12px; color: var(--color-mute); margin: 4px 0 0; }
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

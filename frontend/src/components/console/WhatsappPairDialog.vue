<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { toDataURL } from 'qrcode'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import { startWhatsappPair, streamWhatsappPair, cancelWhatsappPair } from '@/api/console'
import { humanize } from '@/lib/errors'

// Pairing QR WhatsApp (Baileys) — mirroir du flux de l'extension Chrome. On POST
// /pair/start pour une session, on lit le SSE /pair/stream (fetch + ReadableStream :
// EventSource ne peut pas poser de bearer), on rend le QR émis, jusqu'à `paired`.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'paired'): void }>()

type Phase = 'starting' | 'qr' | 'paired' | 'failed'
const phase = ref<Phase>('starting')
const qr = ref<string>('')
const message = ref<string>('')

let abort: AbortController | null = null
let sessionId: string | null = null

async function handle(evt: { type: string; value?: string; error?: string; message?: string }) {
  switch (evt.type) {
    case 'connected':
      break
    case 'qr':
      phase.value = 'qr'
      qr.value = await toDataURL(evt.value ?? '', { margin: 2, width: 240 })
      break
    case 'paired':
      phase.value = 'paired'
      emit('paired')
      break
    case 'failed':
      phase.value = 'failed'
      message.value = [evt.error, evt.message].filter(Boolean).join(' — ') || 'pairing failed'
      break
  }
}

async function run() {
  phase.value = 'starting'
  qr.value = ''
  message.value = ''
  abort = new AbortController()
  try {
    const { session_id } = await startWhatsappPair()
    sessionId = session_id
    const resp = await streamWhatsappPair(session_id, abort.signal)
    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try { await handle(JSON.parse(line.slice(6))) } catch { /* keepalive / partial */ }
        }
      }
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return
    phase.value = 'failed'
    message.value = humanize(e)
  }
}

function teardown() {
  abort?.abort()
  abort = null
  // Une session déjà appairée n'a plus rien à annuler (le subprocess a fini).
  if (sessionId && phase.value !== 'paired') cancelWhatsappPair().catch(() => {})
  sessionId = null
}
function close() {
  teardown()
  emit('update:open', false)
}

watch(() => props.open, (o) => { if (o) run(); else teardown() })
onUnmounted(teardown)
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="close">
      <div class="modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">pair whatsapp</h3>
        <p class="modal-desc">
          open whatsapp on your phone → settings → linked devices → link a device, then scan the code.
        </p>

        <div class="wa-stage">
          <template v-if="phase === 'qr'">
            <img :src="qr" alt="whatsapp pairing qr" width="240" height="240" class="wa-qr" />
            <p class="wa-label">scan the code with your phone</p>
          </template>
          <template v-else-if="phase === 'paired'">
            <div class="wa-icon olive"><Icon name="check" :size="34" /></div>
            <p class="wa-label">whatsapp paired — the whatsapp_* tools are now active.</p>
          </template>
          <template v-else-if="phase === 'failed'">
            <div class="wa-icon terra"><Icon name="close" :size="34" /></div>
            <p class="wa-label">{{ message }}</p>
          </template>
          <template v-else>
            <div class="wa-spinner" />
            <p class="wa-label">starting a pairing session…</p>
          </template>
        </div>

        <div class="modal-actions">
          <Btn v-if="phase === 'paired'" @click="close">done</Btn>
          <template v-else-if="phase === 'failed'">
            <Btn kind="mini" @click="close">close</Btn>
            <button class="btn" @click="run">try again</button>
          </template>
          <Btn v-else kind="mini" @click="close">cancel</Btn>
        </div>
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
  width: 100%; max-width: 420px; background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 14px; padding: 20px 22px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 12.5px; color: var(--color-mute); margin: 6px 0 0; line-height: 1.5; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

.wa-stage {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  min-height: 240px; justify-content: center; margin: 18px 0 4px;
}
.wa-qr { border: 1px solid var(--color-hair); border-radius: 10px; background: #fff; }
.wa-label { font-size: 12.5px; color: var(--color-mute); text-align: center; margin: 0; max-width: 280px; }
.wa-icon { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 999px; }
.wa-icon.olive { background: var(--color-olive-soft); color: var(--color-olive-ink); }
.wa-icon.terra { background: var(--color-terra-soft); color: var(--color-terra-ink); }
.wa-spinner {
  width: 36px; height: 36px; border-radius: 999px;
  border: 3px solid var(--color-hair); border-top-color: var(--color-ink);
  animation: wa-spin 0.8s linear infinite;
}
@keyframes wa-spin { to { transform: rotate(360deg); } }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>

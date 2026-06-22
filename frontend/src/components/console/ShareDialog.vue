<script setup lang="ts">
import { ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import Tag from './Tag.vue'
import { useToast } from '@/composables/useToast'
import { getNamespaceShares, shareNamespace, unshareNamespace } from '@/api/console'
import type { NamespaceShare } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = defineProps<{ open: boolean; namespace: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { toast } = useToast()
const shares = ref<NamespaceShare[]>([])
const loading = ref(false)
const email = ref('')
const permission = ref<'read' | 'write'>('write')
const busy = ref(false)

async function refresh() {
  if (!props.namespace) return
  loading.value = true
  try { shares.value = (await getNamespaceShares(props.namespace)).shares }
  catch (e) { toast(humanize(e)) }
  finally { loading.value = false }
}
watch(() => [props.open, props.namespace], () => { if (props.open) { email.value = ''; refresh() } })

async function add() {
  if (!props.namespace || !email.value.trim()) return
  busy.value = true
  try {
    await shareNamespace(props.namespace, email.value.trim(), permission.value)
    toast(`shared with ${email.value.trim()}`)
    email.value = ''
    await refresh()
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}
async function revoke(s: NamespaceShare) {
  if (!props.namespace || !s.email) return
  try { await unshareNamespace(props.namespace, s.email); toast('access revoked'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="share namespace">
        <header class="sh-head">
          <div class="sh-head-txt">
            <h3 class="modal-title">share</h3>
            <p class="modal-desc mono">{{ namespace }}</p>
          </div>
          <button class="sh-close" aria-label="fermer" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <div class="sh-body">
          <div class="sh-add">
            <input v-model="email" class="sh-input" placeholder="teammate@email.com"
              @keyup.enter="add" />
            <select v-model="permission" class="sh-select">
              <option value="read">read</option>
              <option value="write">write</option>
            </select>
            <Btn kind="mini" icon="plus" :disabled="busy || !email.trim()" @click="add">add</Btn>
          </div>

          <div class="sh-list">
            <div v-if="loading" class="dim" style="padding: 8px 0">loading…</div>
            <div v-for="s in shares" :key="s.email || ''" class="sh-item">
              <span class="sh-mail">{{ s.email || '—' }}</span>
              <Tag :tone="s.permission === 'write' ? 'cobalt' : 'ink'">{{ s.permission }}</Tag>
              <Btn kind="danger" icon="trash" @click="revoke(s)" />
            </div>
            <div v-if="!loading && !shares.length" class="dim" style="padding: 8px 0">
              not shared yet — add a teammate by email.
            </div>
          </div>
        </div>

        <footer class="sh-foot">
          <span style="flex: 1" />
          <Btn kind="ghost" @click="emit('close')">close</Btn>
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
  width: 100%; max-width: 460px; background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.sh-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 18px 8px; }
.sh-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 11.5px; color: var(--color-mute); margin: 3px 0 0; word-break: break-all; }
.sh-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.sh-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.sh-body { padding: 4px 18px 8px; }
.sh-add { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.sh-input {
  flex: 1; font: inherit; font-size: 13px; padding: 6px 8px;
  border: 1px solid var(--color-hair-soft); border-radius: 6px;
  background: var(--color-surface); color: var(--color-ink);
}
.sh-input:focus { outline: none; border-color: var(--color-cobalt); }
.sh-select {
  font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1px solid var(--color-hair-soft);
  border-radius: 6px; background: var(--color-surface); color: var(--color-ink);
}
.sh-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--color-hair-soft); }
.sh-mail { flex: 1; min-width: 0; font-size: 13px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; }
.sh-foot {
  display: flex; align-items: center; gap: 8px; padding: 10px 18px 16px;
  border-top: 1px solid var(--color-hair-soft);
}
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>

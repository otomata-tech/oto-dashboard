<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Btn from './Btn.vue'
import OtoSelect from './OtoSelect.vue'
import { usePrompt } from '@/composables/usePrompt'

const { state, resolve } = usePrompt()

// Valeurs locales du formulaire, ré-initialisées à chaque ouverture.
const values = ref<Record<string, string>>({})
const firstInput = ref<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)

const form = computed(() => (state.value?.kind === 'form' ? state.value.config : null))
const confirm = computed(() => (state.value?.kind === 'confirm' ? state.value.config : null))

const missingRequired = computed(() =>
  !!form.value?.fields.some((f) => f.required && !(values.value[f.key] ?? '').trim()),
)

watch(state, async (s) => {
  if (!s) return
  if (s.kind === 'form') {
    values.value = Object.fromEntries(s.config.fields.map((f) => [f.key, f.value ?? '']))
    await nextTick()
    firstInput.value?.focus()
  } else {
    await nextTick()
    confirmBtn.value?.focus()
  }
})

function submitForm() {
  if (!form.value || missingRequired.value) return
  const out: Record<string, string> = {}
  for (const f of form.value.fields) out[f.key] = (values.value[f.key] ?? '').trim()
  resolve(out)
}
function cancel() { resolve(state.value?.kind === 'confirm' ? false : null) }

// Listener global actif tant que la modale est ouverte : marche que le focus
// soit dans un champ (form) ou sur le bouton (confirm), sans dépendre du DOM.
function onKeydown(e: KeyboardEvent) {
  if (!state.value) return
  if (e.key === 'Escape') { e.preventDefault(); cancel() }
  // Enter soumet (sauf dans un textarea, où il insère un saut de ligne).
  else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    if (form.value) submitForm()
    else if (confirm.value) resolve(true)
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="state" class="modal-overlay" @mousedown.self="cancel">
      <div class="modal" role="dialog" aria-modal="true">
        <!-- formulaire -->
        <template v-if="form">
          <h3 class="modal-title">{{ form.title }}</h3>
          <p v-if="form.description" class="modal-desc">{{ form.description }}</p>
          <form class="modal-body" @submit.prevent="submitForm">
            <label v-for="(f, i) in form.fields" :key="f.key" class="modal-field">
              <span class="modal-label">{{ f.label }}</span>
              <textarea v-if="f.type === 'textarea'" v-model="values[f.key]"
                :ref="i === 0 ? (el) => (firstInput = el as HTMLTextAreaElement) : undefined"
                class="inp" :placeholder="f.placeholder" rows="4" />
              <OtoSelect v-else-if="f.type === 'select'" :model-value="values[f.key] ?? ''"
                @update:model-value="(v: string) => (values[f.key] = v)" :options="f.options ?? []"
                :placeholder="f.placeholder || 'choose…'" trigger-class="w-full" />
              <input v-else v-model="values[f.key]"
                :ref="i === 0 ? (el) => (firstInput = el as HTMLInputElement) : undefined"
                class="inp" :type="f.type === 'password' ? 'password' : 'text'" :placeholder="f.placeholder" />
              <span v-if="f.hint" class="modal-hint">{{ f.hint }}</span>
            </label>
          </form>
          <div class="modal-actions">
            <Btn kind="mini" @click="cancel">Cancel</Btn>
            <button class="btn" :disabled="missingRequired" @click="submitForm">{{ form.submitLabel || 'Save' }}</button>
          </div>
        </template>

        <!-- confirmation -->
        <template v-else-if="confirm">
          <h3 class="modal-title">{{ confirm.title }}</h3>
          <p v-if="confirm.message" class="modal-desc">{{ confirm.message }}</p>
          <div class="modal-actions">
            <Btn kind="mini" @click="cancel">Cancel</Btn>
            <button ref="confirmBtn" :class="confirm.danger ? 'btn danger-solid' : 'btn'" @click="resolve(true)">
              {{ confirm.confirmLabel || 'Confirm' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: center; justify-content: center;
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
.modal-body { display: flex; flex-direction: column; gap: 12px; margin: 16px 0 18px; }
.modal-field { display: flex; flex-direction: column; gap: 5px; }
.modal-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-mute); }
.modal-hint { font-size: 11px; color: var(--color-faint); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.btn.danger-solid { background: var(--color-terra-ink); border-color: var(--color-terra-ink); color: var(--color-bg); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>

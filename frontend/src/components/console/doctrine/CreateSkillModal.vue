<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; create: [{ title: string; slug: string; summary: string }] }>()

const title = ref('')
const slug = ref('')
const summary = ref('')
const slugTouched = ref(false)
const busy = ref(false)

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

watch(title, (v) => {
  if (!slugTouched.value) slug.value = slugify(v)
})
watch(() => props.open, (o) => {
  if (o) { title.value = ''; slug.value = ''; summary.value = ''; slugTouched.value = false; busy.value = false }
})

async function submit() {
  const t = title.value.trim()
  const s = slug.value.trim() || slugify(t)
  if (!t || !s) return
  busy.value = true
  emit('create', { title: t, slug: s, summary: summary.value.trim() })
}
</script>

<template>
  <div v-if="open" class="backdrop" @click="emit('close')">
    <div class="modal" @click.stop>
      <div class="top">
        <div>
          <div class="kicker">nouveau skill</div>
          <div class="title">un process que l'agent tire par son nom</div>
        </div>
        <button type="button" class="x" @click="emit('close')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="fields">
        <label class="field">
          <span class="lbl">titre</span>
          <input v-model="title" type="text" class="inp" placeholder="ex. relance facture impayée" />
        </label>
        <label class="field">
          <span class="lbl">slug — l'agent le tire par ce nom</span>
          <input v-model="slug" type="text" class="inp mono" placeholder="relance_facture"
            @input="slugTouched = true" />
        </label>
        <label class="field">
          <span class="lbl">résumé — 1–2 lignes, détaché du corps</span>
          <textarea v-model="summary" rows="2" class="inp" placeholder="quand le charger, ce qu'il fait." />
        </label>
      </div>

      <div class="actions">
        <button type="button" class="btn-ink" :disabled="busy || !title.trim()" @click="submit">créer le skill →</button>
        <button type="button" class="btn-ghost" @click="emit('close')">annuler</button>
        <span class="meta">v1 · brouillon</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed; inset: 0; z-index: 80; background: rgba(44, 33, 18, 0.4); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal {
  width: 480px; max-width: 100%; background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: 16px; box-shadow: 0 24px 60px -16px rgba(0, 0, 0, 0.34); padding: 22px 24px;
  animation: view-in 0.22s var(--ease-out);
}
.top { display: flex; align-items: flex-start; gap: 10px; }
.kicker { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-cobalt-ink); }
.title { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: var(--color-ink); margin-top: 5px; }
.x {
  margin-left: auto; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border-radius: 8px; border: 1px solid var(--color-hair); background: var(--color-surface); color: var(--color-mute); cursor: pointer;
}
.fields { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.lbl { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-mute); }
.inp {
  font-family: var(--font-sans); font-size: 14px; line-height: 1.5; color: var(--color-ink);
  background: var(--color-bg); border: 1px solid var(--color-hair); border-radius: 9px; padding: 9px 12px;
  outline: none; resize: vertical;
}
.inp.mono { font-family: var(--font-mono); font-size: 13px; }
.inp:focus-visible { outline: 2px solid var(--color-cobalt); outline-offset: 2px; }
.actions { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
.btn-ink {
  display: inline-flex; align-items: center; gap: 7px; background: var(--color-ink); color: var(--color-bg);
  border: 1px solid var(--color-ink); border-radius: 999px; padding: 9px 18px; font-size: 13px; font-weight: 600;
  text-transform: lowercase; cursor: pointer;
}
.btn-ink:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost {
  background: var(--color-surface); color: var(--color-mute); border: 1px solid var(--color-hair);
  border-radius: 999px; padding: 9px 16px; font-size: 13px; font-weight: 600; text-transform: lowercase; cursor: pointer;
}
.meta { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); }
</style>

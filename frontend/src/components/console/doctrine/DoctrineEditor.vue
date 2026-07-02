<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolReg } from './tools'

const props = defineProps<{ modelValue: string; reg: ToolReg }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const ta = ref<HTMLTextAreaElement | null>(null)
const ac = ref<{ q: string; items: string[] } | null>(null)
let caret = 0

const names = computed(() => Array.from(props.reg.keys()))

function srcDot(name: string): string {
  const t = props.reg.get(name)
  return t?.source === 'federated' ? 'var(--color-cobalt)' : 'var(--color-olive)'
}

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  const v = el.value
  caret = el.selectionStart ?? v.length
  emit('update:modelValue', v)
  const before = v.slice(0, caret)
  const m = before.match(/@([a-z0-9_]*)$/)
  if (m) {
    const q = m[1] ?? ''
    const items = names.value.filter((n) => n.indexOf(q) !== -1).slice(0, 6)
    ac.value = items.length ? { q, items } : null
  } else {
    ac.value = null
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ac.value) ac.value = null
}

function pick(name: string) {
  const v = props.modelValue ?? ''
  const before = v.slice(0, caret).replace(/@[a-z0-9_]*$/, '')
  const after = v.slice(caret)
  const ins = `<tool:${name}> `
  const nv = before + ins + after
  const pos = (before + ins).length
  caret = pos
  ac.value = null
  emit('update:modelValue', nv)
  requestAnimationFrame(() => {
    const t = ta.value
    if (t) {
      t.focus()
      try { t.setSelectionRange(pos, pos) } catch { /* noop */ }
    }
  })
}
</script>

<template>
  <div class="wrap">
    <textarea
      ref="ta" class="editor" :value="modelValue" spellcheck="false"
      placeholder="écrivez la procédure en markdown… tapez @ pour insérer un outil du registre"
      @input="onInput" @keydown="onKeydown"
    />
    <div v-if="ac" class="ac">
      <div class="ac__head">
        insérer un outil · <span class="ac__q">@{{ ac.q }}</span>
      </div>
      <div class="ac__list">
        <button
          v-for="n in ac.items" :key="n" type="button" class="ac__item"
          @mousedown.prevent @click="pick(n)"
        >
          <div class="ac__line">
            <span class="ac__dot" :style="{ background: srcDot(n) }" />
            <code class="ac__name">{{ n }}</code>
            <span class="ac__src" :class="reg.get(n)?.source === 'federated' ? 'ac__src--fed' : 'ac__src--oto'">
              {{ reg.get(n)?.source === 'federated' ? 'fédéré' : 'oto' }}
            </span>
          </div>
          <div class="ac__desc">{{ reg.get(n)?.description }}</div>
        </button>
      </div>
    </div>
  </div>
  <div class="hint">
    format stocké : <code>&lt;tool:nom&gt;</code> — l'agent l'écrit directement ; l'autocomplétion
    n'est que le confort humain par-dessus le même marqueur.
  </div>
</template>

<style scoped>
.wrap { position: relative; }
.editor {
  width: 100%; box-sizing: border-box; min-height: 340px; resize: vertical; tab-size: 2;
  font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; color: var(--color-ink);
  background: var(--color-bg); border: 1px solid var(--color-hair); border-radius: 10px;
  padding: 14px 15px; outline: none;
}
.editor::placeholder { color: var(--color-faint); }
.editor:focus-visible { outline: 2px solid var(--color-cobalt); outline-offset: 2px; }
.ac {
  position: absolute; right: 12px; top: 14px; width: 280px; background: var(--color-surface);
  border: 1px solid var(--color-hair); border-radius: 11px;
  box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.22); overflow: hidden; z-index: 30;
}
.ac__head {
  display: flex; align-items: center; gap: 6px; padding: 8px 12px;
  border-bottom: 1px solid var(--color-hair-soft); font-family: var(--font-mono); font-size: 9.5px;
  font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-mute);
}
.ac__q { color: var(--color-cobalt-ink); }
.ac__list { max-height: 232px; overflow-y: auto; }
.ac__item {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 8px 12px;
  border: 0; border-bottom: 1px solid var(--color-hair-soft); background: transparent; cursor: pointer;
}
.ac__item:hover { background: var(--color-paper-2); }
.ac__line { display: flex; align-items: center; gap: 7px; }
.ac__dot { width: 6px; height: 6px; border-radius: 999px; flex: none; }
.ac__name { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--color-ink); background: none; border: 0; padding: 0; }
.ac__src {
  font-family: var(--font-mono); font-size: 8px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; padding: 2px 6px; border-radius: 999px;
}
.ac__src--oto { background: var(--color-olive-soft); color: var(--color-olive-ink); }
.ac__src--fed { background: var(--color-cobalt-soft); color: var(--color-cobalt-ink); }
.ac__desc { font-size: 11px; color: var(--color-mute); line-height: 1.4; padding-left: 13px; }
.hint { margin-top: 9px; font-size: 11.5px; color: var(--color-faint); line-height: 1.5; }
.hint code {
  font-family: var(--font-mono); font-size: 11px; background: var(--color-hair-soft);
  padding: 1px 5px; border-radius: 4px; border: 1px solid var(--color-hair);
}
</style>

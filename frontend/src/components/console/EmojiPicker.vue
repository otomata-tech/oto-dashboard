<script setup lang="ts">
// Choix d'un emoji — palette CURÉE (les repères utiles à un projet de travail) +
// saisie libre pour tout le reste. Volontairement sans dépendance : une librairie
// d'emojis complète pèse plus lourd que le besoin, et la liste ci-dessous couvre
// l'usage réel (nommer un dossier de travail d'un coup d'œil).
import { ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{ modelValue?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const SUGGESTIONS = [
  '📁', '📊', '📈', '📋', '🗂️', '📝', '📌', '🔖',
  '🚀', '⚡', '🎯', '🏁', '🔧', '⚙️', '🧪', '🔍',
  '💼', '🏢', '🤝', '💰', '🧾', '📣', '✉️', '📞',
  '🔒', '🛡️', '⚠️', '✅', '🌱', '🔥', '💡', '⭐',
]

const open = ref(false)
const custom = ref('')
watch(open, (o) => { if (o) custom.value = props.modelValue ?? '' })

function pick(e: string) {
  emit('update:modelValue', e)
  open.value = false
}
function applyCustom() {
  // On garde le 1er caractère « visible » : un emoji peut compter plusieurs unités
  // de code (drapeaux, familles, modificateurs) — [...str] les segmente correctement.
  const first = [...custom.value.trim()][0] ?? ''
  emit('update:modelValue', first)
  open.value = false
}
</script>

<template>
  <span class="ep">
    <button type="button" class="ep__btn" :title="modelValue ? 'Changer l’icône' : 'Choisir une icône'"
      @click="open = !open">
      <span v-if="modelValue" class="ep__cur">{{ modelValue }}</span>
      <Icon v-else name="plus" :size="13" />
    </button>
    <template v-if="open">
      <span class="ep__scrim" @click="open = false"></span>
      <div class="ep__pop">
        <div class="ep__grid">
          <button v-for="e in SUGGESTIONS" :key="e" type="button" class="ep__item"
            :class="{ on: e === modelValue }" @click="pick(e)">{{ e }}</button>
        </div>
        <div class="ep__custom">
          <input v-model="custom" class="ep__input" maxlength="8" placeholder="ou colle un emoji"
            @keyup.enter="applyCustom" />
          <button type="button" class="ep__ok" @click="applyCustom">OK</button>
        </div>
        <button v-if="modelValue" type="button" class="ep__clear" @click="pick('')">
          Retirer l’icône
        </button>
      </div>
    </template>
  </span>
</template>

<style scoped>
.ep { position: relative; display: inline-flex; }
.ep__btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 28px; min-width: 28px; padding: 0 4px; border: 1px dashed var(--color-hair);
  background: transparent; border-radius: var(--radius-md); cursor: pointer; color: var(--color-mute);
}
.ep__btn:hover { border-color: var(--color-mute); color: var(--color-ink); }
.ep__cur { font-size: 17px; line-height: 1; }
.ep__scrim { position: fixed; inset: 0; z-index: var(--z-menu); }
.ep__pop {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: var(--z-menu); width: 248px;
  padding: 8px; background: var(--color-surface); border: 1px solid var(--border-card);
  border-radius: var(--radius-md); box-shadow: var(--shadow-pop);
}
.ep__grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }
.ep__item {
  display: inline-flex; align-items: center; justify-content: center; height: 27px;
  border: 0; background: transparent; border-radius: var(--radius-md); font-size: 16px; cursor: pointer;
}
.ep__item:hover, .ep__item.on { background: var(--color-paper-2); }
.ep__custom { display: flex; gap: 6px; margin-top: 8px; }
.ep__input {
  flex: 1; min-width: 0; border: 1px solid var(--color-hair); border-radius: var(--radius-md);
  padding: 5px 8px; font-size: 13px; color: var(--color-ink); background: var(--color-surface);
}
.ep__ok {
  border: 1px solid var(--color-hair); background: var(--color-surface); border-radius: var(--radius-pill);
  padding: 0 11px; font-size: 12px; color: var(--color-ink-soft); cursor: pointer;
}
.ep__clear {
  width: 100%; margin-top: 6px; padding: 5px; border: 0; border-top: 1px solid var(--color-hair-soft);
  background: transparent; font-size: 11.5px; color: var(--color-mute); cursor: pointer;
}
.ep__clear:hover { color: var(--color-terra-ink); }
</style>

<script setup lang="ts">
// Les couches d'une case de ligne (oto#216) : son commentaire et son lien s'éditent, son
// origine se lit. En lecture, ce qui existe s'affiche ; en écriture, deux champs — repliés
// derrière un lien quand la case n'a encore ni commentaire ni lien, pour ne pas doubler la
// hauteur de chaque fiche. Une couche vidée tombe à l'enregistrement (contrat oto#204).
import { ref } from 'vue'
import type { Couches } from '@/lib/rowCells'

const props = defineProps<{ modelValue: Couches | undefined; editable: boolean; origine?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [Couches] }>()

const val = () => props.modelValue ?? { comment: '', link: '' }
const ouvert = ref(!!(val().comment || val().link))
const poser = (k: keyof Couches, v: string) => emit('update:modelValue', { ...val(), [k]: v })
const lienSur = (u: string) => /^https?:\/\//i.test(u.trim())
</script>

<template>
  <div class="cl">
    <template v-if="!editable">
      <p v-if="val().comment" class="cl-read">note : {{ val().comment }}</p>
      <a v-if="val().link && lienSur(val().link)" class="cl-read cl-a" :href="val().link.trim()"
        target="_blank" rel="noopener">{{ val().link }}</a>
      <p v-else-if="val().link" class="cl-read">lien : {{ val().link }}</p>
    </template>
    <template v-else-if="ouvert">
      <input class="cl-inp" :value="val().comment" placeholder="commentaire sur cette valeur"
        aria-label="commentaire" @input="poser('comment', ($event.target as HTMLInputElement).value)" />
      <input class="cl-inp" :value="val().link" placeholder="lien (source, preuve…)"
        aria-label="lien" @input="poser('link', ($event.target as HTMLInputElement).value)" />
    </template>
    <button v-else type="button" class="cl-open" @click="ouvert = true">+ commentaire ou lien</button>
    <p v-if="origine" class="cl-read cl-orig">origine : {{ origine }}</p>
  </div>
</template>

<style scoped>
.cl { display: flex; flex-direction: column; gap: 3px; margin-top: 3px; }
.cl-inp { width: 100%; font: inherit; font-size: 11.5px; padding: 3px 6px; border: 1px solid var(--color-hair-soft);
  border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-ink); }
.cl-inp:focus { outline: none; border-color: var(--color-cobalt); }
.cl-open { align-self: flex-start; font: inherit; font-size: 11px; background: none; border: 0; padding: 0;
  cursor: pointer; color: var(--color-faint); }
.cl-open:hover { color: var(--color-cobalt-ink); }
.cl-read { margin: 0; font-size: 11.5px; color: var(--color-mute); overflow-wrap: anywhere; }
.cl-a { color: var(--color-cobalt-ink); }
.cl-orig { color: var(--color-faint); }
</style>

<script setup lang="ts">
// Carton de réglages = généralisation de ConsoleCard (réutilise .card/.card-head/.t/
// .s/.actions de console.css), avec les 4 états centralisés (loading/error/empty/
// ready via les composants existants) + une barre d'action footer (save) visible
// seulement quand il y a quelque chose à enregistrer. AUCUNE logique métier ici :
// l'écran décide dirty/saving/status, le panneau ne fait que rendre.
import StateError from '../StateError.vue'
import StateEmpty from '../StateEmpty.vue'
import Btn from '../Btn.vue'

withDefaults(defineProps<{
  title?: string
  sub?: string
  flush?: boolean
  status?: 'loading' | 'error' | 'empty' | 'ready'
  error?: string | null
  saving?: boolean
  dirty?: boolean
  readonly?: boolean
  saveLabel?: string
  emptyTitle?: string
  emptyBody?: string
}>(), {
  status: 'ready',
  saveLabel: 'enregistrer',
})

defineEmits<{ save: []; retry: [] }>()
</script>

<template>
  <section class="card" :class="{ flush }">
    <div v-if="title || $slots.title || $slots.actions" class="card-head">
      <div>
        <div class="t"><slot name="title">{{ title }}</slot></div>
        <div v-if="sub" class="s">{{ sub }}</div>
      </div>
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </div>

    <!-- loading -->
    <div v-if="status === 'loading'" class="cfg-sk">
      <div class="sk" style="height: 14px; width: 40%" />
      <div class="sk" style="height: 36px; width: 100%" />
      <div class="sk" style="height: 36px; width: 100%" />
    </div>

    <!-- error -->
    <StateError v-else-if="status === 'error'" :message="error || 'erreur'" @retry="$emit('retry')" />

    <!-- empty -->
    <StateEmpty v-else-if="status === 'empty'" medallion="md">
      <template #title>{{ emptyTitle || 'rien ici' }}</template>
      {{ emptyBody }}
    </StateEmpty>

    <!-- ready -->
    <template v-else>
      <slot />
    </template>

    <!-- barre d'action : seulement s'il y a de quoi enregistrer -->
    <slot name="footer">
      <div v-if="(dirty || saving) && !readonly && status === 'ready'" class="cfg-foot">
        <Btn :disabled="saving" @click="$emit('save')">{{ saveLabel }}</Btn>
        <span class="cfg-foot-note">{{ saving ? 'enregistrement…' : 'modifications non sauvegardées' }}</span>
      </div>
    </slot>
  </section>
</template>

<style scoped>
.cfg-sk { display: flex; flex-direction: column; gap: 10px; }
.cfg-foot {
  display: flex; align-items: center; gap: 12px;
  margin-top: 16px; padding-top: 14px;
  border-top: 1px solid var(--color-hair-soft);
}
.cfg-foot-note { font-size: 11.5px; color: var(--color-mute); }
</style>

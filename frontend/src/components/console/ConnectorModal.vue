<script setup lang="ts">
// Panneau LATÉRAL de détail d'un connecteur (CDC JB §5) — docké à droite, la LISTE reste
// VISIBLE et interactive à gauche (cliquer une autre ligne met à jour le panneau). Remplace
// l'ex-modale centrée (reka Dialog) qui masquait la liste sous un scrim (§6 : « pas de modale
// pour le détail »). Non-modal : pas de scrim bloquant ni de piège de focus ; fermeture =
// bouton × ou Échap. Header (logo + titre + tags) et barre d'onglets FIXES ; le corps scrolle
// (contenu propre à chaque surface via le slot par défaut, onglet actif piloté en v-model:tab).
// API (props/emits/slots) INCHANGÉE — consommée telle quelle par les 4 projections.
import { onMounted, onBeforeUnmount } from 'vue'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

defineProps<{
  label: string
  logoUrl?: string | null
  publisher?: string
  tabs: { key: string; label: string; badge?: string }[]
  tab: string
}>()
const emit = defineEmits<{ 'update:tab': [key: string]; close: [] }>()

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <aside class="cmp" role="complementary" :aria-label="label">
    <button class="cmp-x" type="button" aria-label="Fermer" @click="emit('close')"><Icon name="close" :size="16" /></button>

    <!-- header -->
    <div class="cm-head">
      <Avatar :src="logoUrl" :name="label" :size="44" shape="square" />
      <div style="flex: 1; min-width: 0">
        <h2 class="cm-title">{{ label }}</h2>
        <div v-if="publisher" class="cm-pub">{{ publisher }}</div>
        <div class="cm-tags"><slot name="tags" /></div>
      </div>
    </div>

    <!-- tabs -->
    <div class="cm-tabs">
      <button v-for="t in tabs" :key="t.key" class="cm-tab" :class="{ on: tab === t.key }"
        @click="emit('update:tab', t.key)">{{ t.label }}<span v-if="t.badge" class="dim"> {{ t.badge }}</span></button>
    </div>

    <!-- corps scrollable -->
    <div class="cm-body"><slot /></div>
  </aside>
</template>

<style scoped>
.cmp { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 94vw); z-index: var(--z-drawer);
  background: var(--color-surface); border-left: 1px solid var(--color-hair); box-shadow: var(--shadow-pop);
  display: flex; flex-direction: column; animation: cmp-in .16s var(--ease-out); }
@keyframes cmp-in { from { transform: translateX(14px); opacity: .5 } to { transform: none; opacity: 1 } }
.cmp-x { position: absolute; top: 12px; right: 12px; z-index: 1; display: inline-flex; padding: 6px; border: 0;
  border-radius: var(--radius-pill); background: transparent; color: var(--color-mute); cursor: pointer; }
.cmp-x:hover { background: var(--color-paper-2); }
.cm-head { padding: 16px 46px 14px 20px; border-bottom: 1px solid var(--color-hair); display: flex; align-items: flex-start; gap: 13px; flex: 0 0 auto; }
.cm-title { font-size: 17px; font-weight: 700; letter-spacing: -.01em; line-height: 1.15; }
.cm-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.cm-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.cm-tabs { display: flex; gap: 18px; padding: 0 20px; border-bottom: 1px solid var(--color-hair); flex: 0 0 auto; }
.cm-tab { font-size: 12.5px; padding: 9px 2px 8px; border: 0; background: transparent; cursor: pointer; color: var(--color-mute); border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 500; }
.cm-tab.on { color: var(--color-ink); border-bottom-color: var(--color-ink); font-weight: 700; }
.cm-body { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
.dim { color: var(--color-faint); font-weight: 500; }

/* M7 mobile (CDC lot 2) : le panneau latéral devient un SHEET plein écran (100vw, sans
   filet gauche), qui monte depuis le bas. */
@media (max-width: 640px) {
  .cmp { width: 100vw; border-left: 0; animation: cmp-in-sheet .2s var(--ease-out); }
  @keyframes cmp-in-sheet { from { transform: translateY(18px); opacity: .5 } to { transform: none; opacity: 1 } }
}
</style>

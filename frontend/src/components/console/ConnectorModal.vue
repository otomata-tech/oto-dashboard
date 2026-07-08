<script setup lang="ts">
// Shell MODALE de détail d'un connecteur — chrome commun aux projections user/org
// (ex-drawers latéraux ConnectorDrawer / OrgConnectorDrawer, fusionnés + passés en modale
// centrée à la demande). Construit sur la primitive @/components/ui/dialog (shadcn-vue,
// même base que FormDialog) : overlay + centrage + bouton close fournis. Header (logo +
// titre + tags) et barre d'onglets FIXES ; le corps scrolle (contenu propre à chaque
// surface via le slot par défaut, l'onglet actif est piloté par le parent en v-model:tab).
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Avatar from './Avatar.vue'

defineProps<{
  label: string
  logoUrl?: string | null
  publisher?: string
  tabs: { key: string; label: string; badge?: string }[]
  tab: string
}>()
const emit = defineEmits<{ 'update:tab': [key: string]; close: [] }>()
</script>

<template>
  <Dialog :open="true" @update:open="(v) => { if (!v) emit('close') }">
    <DialogContent class="block flex flex-col gap-0 p-0 max-w-2xl max-h-[85vh] overflow-hidden">
      <!-- header -->
      <div class="cm-head">
        <Avatar :src="logoUrl" :name="label" :size="44" shape="square" />
        <div style="flex: 1; min-width: 0">
          <DialogTitle class="cm-title">{{ label }}</DialogTitle>
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
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.cm-head { padding: 16px 20px; border-bottom: 1px solid var(--color-hair); display: flex; align-items: flex-start; gap: 13px; flex: 0 0 auto; }
.cm-title { font-size: 17px; font-weight: 700; letter-spacing: -.01em; line-height: 1.15; }
.cm-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; }
.cm-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.cm-tabs { display: flex; gap: 18px; padding: 0 20px; border-bottom: 1px solid var(--color-hair); flex: 0 0 auto; }
.cm-tab { font-size: 12.5px; padding: 9px 2px 8px; border: 0; background: transparent; cursor: pointer; color: var(--color-mute); border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 500; }
.cm-tab.on { color: var(--color-ink); border-bottom-color: var(--color-ink); font-weight: 700; }
.cm-body { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
.dim { color: var(--color-faint); font-weight: 500; }
</style>

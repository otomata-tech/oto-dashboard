<script setup lang="ts">
// Chips des filtres APPLIQUÉS, retirables un à un. Partagé par les deux vues d'un
// tableau du datastore (table : sous la barre d'outils ; fiches : même rangée) —
// un filtre posé dans l'une reste visible et retirable dans l'autre.
// Le libellé est calculé par l'appelant (il seul sait nommer la colonne comme son
// en-tête le fait) ; ici on ne fait que le rendu et l'émission du retrait.
defineProps<{ chips: Array<{ field: string; label: string }> }>()
const emit = defineEmits<{ remove: [field: string] }>()
</script>

<template>
  <div v-if="chips.length" class="fchips">
    <button v-for="c in chips" :key="c.field" class="fchip"
      :title="`retirer le filtre sur ${c.label}`" @click="emit('remove', c.field)">
      {{ c.label }}<span class="fchip-x">×</span>
    </button>
  </div>
</template>

<style scoped>
.fchips { display: flex; flex-wrap: wrap; gap: 6px; }
.fchip {
  font: inherit; font-size: 11px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--color-cobalt); border-radius: var(--radius-pill); padding: 1px 8px;
  background: var(--color-surface); color: var(--color-cobalt); max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fchip:hover { background: var(--color-paper-3); }
.fchip-x { color: var(--color-faint); font-size: 12px; }
.fchip:hover .fchip-x { color: var(--color-terra-ink); }
</style>

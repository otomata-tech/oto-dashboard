<script setup lang="ts">
// Ce que le serveur a fait d'une ligne sortie de la file (oto-backend#433).
//
// Le motif est SERVI (`_abandon`) : on le rend TEL QUEL, jamais reformulé ni
// recalculé — il cite le compte et le plafond en vigueur le jour de l'abandon, et
// le plafond a pu changer depuis. Le reste du bandeau dit ce qui remet la ligne en
// circuit, et ce qu'une écriture ne pourra PAS faire : sans transition de retour
// déclarée au cycle de vie, elle rouvre la file mais laisse le statut sur l'état
// d'abandon — la plateforme y verse la ligne, elle ne s'autorise pas à l'en sortir.
import type { AbandonVerdict } from '@/lib/datastoreClaims'

defineProps<{ verdict: AbandonVerdict; canWrite?: boolean }>()
</script>

<template>
  <div class="rab">
    <span class="rab-head">sortie de la file</span>
    <p class="rab-why">{{ verdict.reason }}</p>
    <p v-if="canWrite" class="rab-fix">
      Une écriture réussie sur cette ligne efface ce motif et la remet dans la file.
      <template v-if="!verdict.reopens.length">
        Le cycle de vie ne déclare aucun retour depuis cet état : le statut, lui, restera
        celui de l'abandon.
      </template>
    </p>
  </div>
</template>

<style scoped>
.rab {
  display: flex; flex-direction: column; gap: 3px;
  padding: 8px 10px; border-radius: var(--radius-md);
  background: var(--color-terra-soft); color: var(--color-terra-ink);
}
.rab-head {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
}
.rab-why { margin: 0; font-size: 12.5px; font-weight: 600; }
.rab-fix { margin: 0; font-size: 11.5px; line-height: 1.45; opacity: .85; }
</style>

<script setup lang="ts">
// /automations/schedules — les programmations de l'org (oto#214) : la carte des lots 1 et 2
// telle quelle (interrupteur, réglage en ligne, suppression, occurrences non prises), dont le
// nom de chaque ligne mène à la page de sa programmation. La même carte reste montée sur la
// fiche d'une procédure.
import RunnerTriggersCard from '@/components/console/RunnerTriggersCard.vue'
</script>

<template>
  <div class="content-inner">
    <RunnerTriggersCard />
  </div>
</template>

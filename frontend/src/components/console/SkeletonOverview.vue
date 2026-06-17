<script setup lang="ts">
// Skeleton de chargement (pulse) — calque la grille overview : 4 tuiles + 2 cards.
</script>

<template>
  <div class="content-inner">
    <div class="grid4">
      <div v-for="i in 4" :key="i" class="sk-card">
        <div class="sk" style="height: 9px; width: 55%" />
        <div class="sk" style="height: 24px; width: 42%; margin-top: 10px" />
        <div class="sk" style="height: 8px; width: 80%; margin-top: 10px" />
      </div>
    </div>
    <div class="grid23">
      <div class="sk-card" style="padding: 16px">
        <div class="sk" style="height: 11px; width: 30%" />
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px">
          <div v-for="i in 8" :key="i" class="sk" style="height: 52px; border-radius: 9px" />
        </div>
      </div>
      <div class="sk-card" style="padding: 16px">
        <div class="sk" style="height: 11px; width: 45%" />
        <div class="sk" style="height: 34px; margin-top: 14px; border-radius: 8px" />
        <div class="sk" style="height: 8px; width: 90%; margin-top: 12px" />
        <div class="sk" style="height: 8px; width: 70%; margin-top: 8px" />
      </div>
    </div>
  </div>
</template>

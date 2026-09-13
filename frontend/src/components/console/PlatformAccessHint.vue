<script setup lang="ts">
// Où se gère l'accès plateforme d'un connecteur (ADR 0044 §H) : sur la carte du
// connecteur, onglet « accès plateforme » de /platform/connectors — le seul levier.
// Les fiches org et utilisateur de la plateforme n'en montrent que le statut, en
// lecture seule, et y renvoient par un vrai lien (oto#233). Une seule phrase, un seul
// chemin : les deux fiches la montent telle quelle.
import { RouterLink } from 'vue-router'
</script>

<template>
  <span>L'octroi se gère sur la carte du connecteur, dans <RouterLink class="linklike" to="/platform/connectors">connecteurs (plateforme)</RouterLink>.</span>
</template>

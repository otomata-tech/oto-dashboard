<script setup lang="ts">
// Écran d'attente (gate doux alpha, ADR 0013) : rendu quand me.access.status
// === 'pending'. Le compte existe mais n'a pas encore l'accès — il attend une
// approbation, ou peut réclamer une invitation reçue par email.
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useMe } from '@/composables/useMe'

const { me, reload } = useMe()
</script>

<template>
  <div class="state-empty" style="margin-top: 64px">
    <span class="o-medallion o-medallion-lg">o</span>
    <div class="se-title">you're on the <Squiggle>waitlist</Squiggle>.</div>
    <div class="se-body">
      Oto is in closed alpha. your account
      <template v-if="me?.email"> (<strong>{{ me.email }}</strong>)</template>
      is registered — we'll email you as soon as your access opens.
    </div>
    <div style="display: flex; gap: 8px; margin-top: 6px">
      <Btn @click="reload()">refresh status</Btn>
    </div>
    <div class="se-body" style="font-size: 12px; margin-top: 2px">
      have an invitation? open the link from your email to unlock access right away.
    </div>
  </div>
</template>

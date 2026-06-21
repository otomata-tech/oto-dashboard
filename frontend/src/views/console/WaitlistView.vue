<script setup lang="ts">
// Écran d'attente (gate doux alpha, ADR 0013) : rendu quand me.access.status
// === 'pending'. Le compte existe mais n'a pas encore l'accès — il attend une
// approbation, ou peut entrer tout de suite via une invitation reçue par email.
// Voix oto.ninja (refonte waitlist) : vouvoiement + minuscules.
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { ref } from 'vue'
import { useMe } from '@/composables/useMe'

const { me, reload } = useMe()
const refreshing = ref(false)

async function refresh() {
  refreshing.value = true
  try { await reload() } finally { refreshing.value = false }
}
</script>

<template>
  <div class="state-empty" style="margin-top: 64px; max-width: 460px">
    <span class="o-medallion o-medallion-lg">o</span>
    <div class="se-eyebrow">alpha fermée</div>
    <div class="se-title">vous êtes sur la <Squiggle>liste</Squiggle>.</div>

    <div class="se-body">
      votre compte<template v-if="me?.email"> (<strong>{{ me.email }}</strong>)</template>
      est enregistré. on vous écrit dès l'ouverture de votre accès.
    </div>
    <div class="se-body" style="color: var(--color-mute)">
      un seul compte, un seul coffre — depuis claude, chatgpt, mistral et la cli.
    </div>

    <div class="se-cta">
      <Btn kind="ghost" :disabled="refreshing" @click="refresh">
        {{ refreshing ? 'vérification…' : 'actualiser mon statut' }}
      </Btn>
    </div>

    <div class="wl-hatch">
      vous avez une <strong>invitation</strong> ? ouvrez le lien reçu par email
      pour entrer tout de suite.
    </div>
  </div>
</template>

<style scoped>
.se-eyebrow {
  font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--color-gold-ink, var(--color-mute)); font-weight: 600; margin-bottom: 6px;
}
.wl-hatch {
  margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--color-hair-soft, var(--color-hair));
  font-size: 13px; line-height: 1.5; color: var(--color-mute); max-width: 380px;
}
</style>

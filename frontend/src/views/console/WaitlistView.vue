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
const note = ref('')

async function refresh() {
  refreshing.value = true
  note.value = ''
  try {
    await reload()
    // Si l'accès est ouvert, la gate parente bascule (plus de WaitlistView). Sinon,
    // on le dit explicitement — sinon le bouton semble ne « rien faire ».
    if (me.value?.access?.status === 'pending') {
      note.value = 'toujours en attente — on revient vers vous dès l\'ouverture.'
    }
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="state-empty" style="margin-top: 64px; max-width: 460px">
    <span class="o-medallion o-medallion-lg">o</span>
    <div class="se-eyebrow">alpha fermée</div>
    <div class="se-title">vous êtes sur la <Squiggle>liste</Squiggle>.</div>

    <div class="se-body">
      votre compte<template v-if="me?.email"> (<strong>{{ me.email }}</strong>)</template>
      est enregistré. on vous écrit dès l'ouverture de votre accès — gardez un œil
      sur votre boîte mail.
    </div>
    <div class="se-body" style="color: var(--color-mute)">
      votre accès vous ouvrira un coffre de clés chiffré et tout le catalogue
      d'outils — depuis claude, chatgpt, mistral et la cli.
    </div>

    <div class="se-cta">
      <Btn kind="ghost" :disabled="refreshing" @click="refresh">
        {{ refreshing ? 'vérification…' : 'actualiser mon statut' }}
      </Btn>
    </div>
    <div v-if="note" class="se-body" style="font-size: 13px; color: var(--color-mute); margin-top: 2px">
      {{ note }}
    </div>

    <div class="wl-hatch">
      <span class="wl-hatch-key">vous avez une invitation ?</span>
      ouvrez le lien reçu par email pour <strong>entrer tout de suite</strong>,
      sans attendre l'approbation.
    </div>
  </div>
</template>

<style scoped>
.se-eyebrow {
  font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--color-gold-ink, var(--color-mute)); font-weight: 600; margin-bottom: 6px;
}
.wl-hatch {
  margin-top: 22px; max-width: 400px;
  padding: 14px 16px; border-radius: 12px;
  background: var(--color-gold-soft, rgba(240, 180, 30, 0.08));
  border: 1px solid var(--color-gold-ink, rgba(240, 180, 30, 0.35));
  font-size: 13px; line-height: 1.5; color: var(--color-ink);
}
.wl-hatch-key { font-weight: 700; color: var(--color-gold-ink, var(--color-ink)); }
</style>

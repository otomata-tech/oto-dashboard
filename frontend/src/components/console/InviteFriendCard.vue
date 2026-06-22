<script setup lang="ts">
// Widget « inviter » (invitation virale alpha, ADR 0013 + refonte 2026-06-22).
// Deux gestes, même budget : un lien referral réutilisable à diffuser au réseau,
// et une invitation nominative (envoi par mail OU code à partager soi-même).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import { getReferralLink, sendAlphaInvite } from '@/api/console'
import type { ReferralLink } from '@/types/api'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'

const { me, reload } = useMe()
const { toast } = useToast()
const { promptForm } = usePrompt()

const referral = ref<ReferralLink | null>(null)
const left = computed(() => referral.value?.invites_left ?? me.value?.access.invites_left ?? 0)

onMounted(async () => {
  try { referral.value = await getReferralLink() } catch { /* affichage best-effort */ }
})

async function copy(text: string, label = 'lien copié') {
  try { await navigator.clipboard.writeText(text); toast(label) }
  catch { toast('copie impossible — sélectionnez le lien à la main') }
}

async function invite() {
  if (left.value <= 0) return
  const r = await promptForm({
    title: 'inviter quelqu\'un',
    description: `il crée son propre compte. il vous reste ${left.value} invitation${left.value === 1 ? '' : 's'}.`,
    fields: [
      { key: 'email', label: 'email (optionnel)', placeholder: 'prenom@entreprise.com',
        hint: 'laissez vide pour obtenir un code à partager vous-même' },
      { key: 'delivery', label: 'comment', type: 'select', value: 'mail',
        options: [
          { value: 'mail', label: 'envoyer l\'invitation par mail' },
          { value: 'code', label: 'me donner un code à partager' },
        ] },
    ],
    submitLabel: 'créer l\'invitation',
  })
  if (!r) return
  const sendMail = r.delivery !== 'code'
  const email = (r.email || '').trim()
  if (sendMail && !email) { toast('un email est requis pour l\'envoi par mail'); return }
  try {
    const res = await sendAlphaInvite(email || null, sendMail)
    if (res.emailed) {
      toast(`invitation envoyée à ${res.email}`)
    } else {
      await promptForm({
        title: 'à partager vous-même',
        description: 'transmettez ce lien (ou ce code) à la personne — il vaut une invitation.',
        fields: [
          { key: 'url', label: 'lien d\'invitation', value: res.invite_url },
          { key: 'code', label: 'code', value: res.code },
        ],
        submitLabel: 'fermer',
      })
    }
    await reload()
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <ConsoleCard title="inviter"
    :sub="left > 0
      ? `il vous reste ${left} invitation${left === 1 ? '' : 's'} à offrir.`
      : 'plus d\'invitation disponible pour l\'instant.'">
    <!-- lien referral réutilisable -->
    <div v-if="referral?.url" class="ref-row">
      <input class="ref-link" :value="referral.url" readonly @focus="(e) => (e.target as HTMLInputElement).select()" />
      <Btn kind="ghost" :disabled="left <= 0" @click="copy(referral!.url)">copier le lien</Btn>
    </div>
    <p class="ref-hint">partagez ce lien à votre réseau — chaque personne qui rejoint via lui utilise une invitation.</p>

    <div class="ref-actions">
      <Btn :disabled="left <= 0" @click="invite">inviter par email ou code</Btn>
      <span class="dim">{{ left }} restante{{ left === 1 ? '' : 's' }}</span>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.ref-row { display: flex; align-items: center; gap: 8px; }
.ref-link {
  flex: 1; min-width: 0; font-family: var(--font-mono, monospace); font-size: 13px;
  padding: 8px 10px; border: 1px solid var(--color-hair, #ece4d0); border-radius: 8px;
  background: var(--color-surface, #fff); color: var(--color-ink);
}
.ref-hint { font-size: 12px; color: var(--color-mute); margin: 8px 0 14px; }
.ref-actions { display: flex; align-items: center; gap: 10px; }
.dim { font-size: 12px; color: var(--color-mute); }
</style>

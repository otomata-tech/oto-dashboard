<script setup lang="ts">
import { computed } from 'vue'
import Btn from './Btn.vue'
import { analyticsEnabled, consent, grantConsent, denyConsent } from '@/lib/analytics'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Affiché uniquement si l'analytics est actif (clé présente) ET aucun choix fait.
// En dev (pas de clé) ou après décision, le bandeau ne s'affiche jamais.
const show = computed(() => analyticsEnabled() && consent.value === null)
</script>

<template>
  <Transition name="consent">
    <div v-if="show" class="consent" role="dialog" :aria-label="t('miscUi.consent.aria')">
      <div class="consent__text">
        <i18n-t keypath="miscUi.consent.text" tag="span"><template #posthog><strong>PostHog</strong></template></i18n-t>
        <a href="https://trust.oto.zone" target="_blank" rel="noopener">{{ t('miscUi.consent.privacy') }}</a>
      </div>
      <div class="consent__actions">
        <Btn kind="mini" @click="denyConsent">{{ t('miscUi.consent.decline') }}</Btn>
        <Btn @click="grantConsent">{{ t('miscUi.consent.accept') }}</Btn>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.consent {
  position: fixed; left: 16px; bottom: 16px; z-index: var(--z-banner); max-width: 420px;
  display: flex; flex-direction: column; gap: 12px; padding: 14px 16px;
  background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 12px;
  box-shadow: 0 14px 34px -12px rgba(0, 0, 0, 0.26);
}
.consent__text { font-size: 12.5px; line-height: 1.55; color: var(--color-ink-soft); }
.consent__text strong { color: var(--color-ink); font-weight: 600; }
.consent__text a { color: var(--color-cobalt-ink); text-decoration: underline; }
.consent__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.consent-enter-active, .consent-leave-active { transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out); }
.consent-enter-from, .consent-leave-to { opacity: 0; transform: translateY(8px); }
</style>

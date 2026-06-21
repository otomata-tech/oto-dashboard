<script setup lang="ts">
import { computed } from 'vue'
import Btn from './Btn.vue'
import { analyticsEnabled, consent, grantConsent, denyConsent } from '@/lib/analytics'

// Affiché uniquement si l'analytics est actif (clé présente) ET aucun choix fait.
// En dev (pas de clé) ou après décision, le bandeau ne s'affiche jamais.
const show = computed(() => analyticsEnabled() && consent.value === null)
</script>

<template>
  <Transition name="consent">
    <div v-if="show" class="consent" role="dialog" aria-label="analytics consent">
      <div class="consent__text">
        we use <strong>PostHog</strong> (EU) for product analytics and session replay to improve the
        dashboard. recordings mask your inputs. you can decline — nothing is captured until you accept.
        <a href="https://trust.oto.zone" target="_blank" rel="noopener">privacy</a>
      </div>
      <div class="consent__actions">
        <Btn kind="mini" @click="denyConsent">decline</Btn>
        <Btn @click="grantConsent">accept</Btn>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.consent {
  position: fixed; left: 16px; bottom: 16px; z-index: 200; max-width: 420px;
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

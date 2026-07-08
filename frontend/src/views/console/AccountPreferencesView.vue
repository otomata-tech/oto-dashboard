<script setup lang="ts">
// « Préférences » (/account/preferences) — langue + confidentialité (analytics RGPD, si
// PostHog configuré). Ex-onglet « préférences » d'AccountView.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import LocaleSwitch from '@/components/console/LocaleSwitch.vue'
import { analyticsEnabled, consent, grantConsent, denyConsent } from '@/lib/analytics'

const { t } = useI18n()
// Consentement analytics (RGPD) : n'a de sens que si PostHog est configuré. `granted`
// = capture active ; tout autre état (denied/null) = rien collecté. Retrait à tout moment.
const analyticsOn = analyticsEnabled()
const analyticsGranted = computed(() => consent.value === 'granted')
</script>

<template>
  <div class="content-inner narrow fadein">
    <ConsoleCard :title="t('account.prefsTitle')" :sub="t('account.prefsSub')">
      <div class="acc-rows">
        <div class="acc-row">
          <span class="acc-k">{{ t('common.language') }}</span>
          <span class="acc-v"><LocaleSwitch /></span>
        </div>
        <div v-if="analyticsOn" class="acc-row">
          <span class="acc-k">{{ t('account.privacyState') }}</span>
          <span class="acc-v acc-v-inline">
            <Tag :tone="analyticsGranted ? 'olive' : 'ink'">
              {{ analyticsGranted ? t('account.privacyGranted') : t('account.privacyDenied') }}
            </Tag>
            <Btn kind="ghost" @click="analyticsGranted ? denyConsent() : grantConsent()">
              {{ analyticsGranted ? t('account.privacyDisable') : t('account.privacyEnable') }}
            </Btn>
          </span>
        </div>
      </div>
      <p v-if="analyticsOn" class="acc-note">{{ analyticsGranted ? t('account.privacyOn') : t('account.privacyOff') }}</p>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.acc-rows { display: flex; flex-direction: column; gap: 2px; }
.acc-row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 2px; border-bottom: 1px solid var(--color-hair-soft);
}
.acc-row:last-child { border-bottom: 0; }
.acc-k {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--color-faint); width: 130px; flex: none;
}
.acc-v { font-size: 13px; color: var(--color-ink); font-weight: 500; }
.acc-v-inline { display: flex; align-items: center; gap: 10px; }
.acc-note { font-size: 12px; color: var(--color-mute); line-height: 1.5; margin: 14px 0 0; }
</style>

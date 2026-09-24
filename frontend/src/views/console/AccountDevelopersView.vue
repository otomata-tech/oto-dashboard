<script setup lang="ts">
// « Développeurs » (/account/developers) — tokens CLI / API, et l'entrée vers la
// documentation servie. Ex-onglet « développeurs » d'AccountView.
// Le produit ne renvoyait vers `docs.oto.cx` depuis AUCUN écran : la référence de
// l'API existait, dérivée du serveur, et personne dans le dashboard ne la trouvait.
import AccountTokensCard from '@/components/console/AccountTokensCard.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Icon from '@/components/console/Icon.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="content-inner narrow fadein">
    <ConsoleCard :title="t('accountUi.docs.title')" :sub="t('accountUi.docs.sub')">
      <i18n-t keypath="accountUi.docs.body" tag="p" class="helptext">
        <template #site><strong>docs.oto.cx</strong></template>
        <template #rest><strong>{{ t('accountUi.docs.rest') }}</strong></template>
        <template #concepts><strong>{{ t('accountUi.docs.concepts') }}</strong></template>
      </i18n-t>
      <a class="doclink" href="https://docs.oto.cx" target="_blank" rel="noopener">
        <Icon name="code" :size="13" />
        {{ t('accountUi.docs.open') }}
      </a>
    </ConsoleCard>
    <AccountTokensCard />
  </div>
</template>

<style scoped>
.doclink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12.5px;
  font-weight: 600;
}
</style>

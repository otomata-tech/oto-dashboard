<script setup lang="ts">
// « Ton agent » (/account/agent) — readme perso (injecté chaque session, après plateforme/
// org/équipe) + contexte résolu. Ex-onglet « ton agent » d'AccountView.
import { useI18n } from 'vue-i18n'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import AgentContextCard from '@/components/console/AgentContextCard.vue'
import { getInitGuide, setInitGuide } from '@/api/console'

// Ma note = un guide `delivery=init` au scope user (ADR 0042).
const loadMyNote = () => getInitGuide('user')
const saveMyNote = (body: string) => setInitGuide('user', body)

const { t } = useI18n()
</script>

<template>
  <div class="content-inner narrow fadein">
    <AgentReadmeCard :title="t('account.readmeTitle')" :sub="t('account.readmeSub')"
      :can-edit="true" allow-empty :placeholder="t('account.readmePlaceholder')"
      :load="loadMyNote" :save="saveMyNote" />
    <AgentContextCard />
  </div>
</template>

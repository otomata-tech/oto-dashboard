<script setup lang="ts">
// « Sécurité » de l'org active (/org/security) : MFA obligatoire (org_admin bascule ;
// enforcé par Logto au login). Page dédiée, extraite de l'ancienne page « membres ».
// Et l'export du journal des accès (oto#269) : lecture réservée à l'admin d'org
// (`ORG_ADMIN_OF`), montrée à qui le serveur la sert (`isOrgAdmin`), consultation comprise.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OrgMfaCard from '@/components/console/OrgMfaCard.vue'
import OrgAuditComplianceCard from '@/components/console/OrgAuditComplianceCard.vue'
import { useOrgScope } from '@/composables/useOrgScope'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// La bascule suit `canAdminister` : le rôle, hors consultation (oto#211).
const { activeOrgId, error, loaded, canAdminister, isOrgAdmin } = useOrgScope()
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" :title="t('contextUi.noOrg.title')">
      <div class="helptext">{{ t('contextUi.noOrg.body') }}</div>
    </ConsoleCard>

    <template v-else-if="activeOrgId != null">
      <OrgMfaCard :org-id="activeOrgId" :can-manage="canAdminister" />
      <OrgAuditComplianceCard v-if="isOrgAdmin" :key="activeOrgId" :org-id="activeOrgId" />
    </template>
  </div>
</template>

<script setup lang="ts">
// « Sécurité » de l'org active (/org/security) : MFA obligatoire (org_admin bascule ;
// enforcé par Logto au login). Page dédiée, extraite de l'ancienne page « membres ».
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OrgMfaCard from '@/components/console/OrgMfaCard.vue'
import { useOrgScope } from '@/composables/useOrgScope'

const { activeOrgId, error, loaded, isOrgAdmin } = useOrgScope()
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">you're not in an organization yet.</div>
    </ConsoleCard>

    <OrgMfaCard v-else-if="activeOrgId != null" :org-id="activeOrgId" :can-manage="isOrgAdmin" />
  </div>
</template>

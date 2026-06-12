<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Stat from '@/components/console/Stat.vue'
import { getAdminOrgs } from '@/api/console'
import type { AdminOrgSummary } from '@/types/api'

const orgs = ref<AdminOrgSummary[]>([])
const error = ref<string | null>(null)

onMounted(async () => {
  try { orgs.value = (await getAdminOrgs()).orgs }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
})
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="grid3">
      <Stat label="organizations" :value="orgs.length" sub="shared perimeters" />
      <Stat label="total members" :value="orgs.reduce((a, o) => a + o.member_count, 0)" sub="across all orgs" />
      <Stat label="largest" :value="orgs.length ? Math.max(...orgs.map((o) => o.member_count)) : 0" sub="members in one org" />
    </div>

    <ConsoleCard flush title="organizations"
      sub="shared perimeters: members inherit org keys, doctrine and entitlements.">
      <table class="tbl">
        <thead><tr><th>org</th><th class="num">members</th></tr></thead>
        <tbody>
          <tr v-for="o in orgs" :key="o.id">
            <td style="font-weight: 600; color: var(--color-ink)">{{ o.name }}</td>
            <td class="num">{{ o.member_count }}</td>
          </tr>
          <tr v-if="!orgs.length"><td colspan="2" class="dim" style="text-align: center; padding: 16px">no organizations</td></tr>
        </tbody>
      </table>
    </ConsoleCard>
  </div>
</template>

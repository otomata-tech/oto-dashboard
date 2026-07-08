<script setup lang="ts">
// Cockpit connecteurs de l'ORG (/org/connectors, ADR 0022) — wrapper mince : garde
// « aucune org active » + la coquille unifiée `ConnectorScopeView` (scope=org : dispo /
// clé d'org / accès / rédaction / email) + le pied « envois programmés » (propre au scope).
// Les leviers vivent dans `useOrgAdapter`.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import ConnectorScopeView from '@/components/console/connector-scope/ConnectorScopeView.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { getOrgEmailSettings, listScheduledEmails, cancelScheduledEmail } from '@/api/console'
import type { EmailSettingsBundle, ScheduledEmail } from '@/types/api'
import { fmtDateTime } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()
const activeOrgId = computed(() => me.value?.active_org ?? null)

// Encart « envois programmés » : n'a de sens que si ≥1 connecteur email a des expéditeurs.
const emailBundle = ref<EmailSettingsBundle | null>(null)
const hasEmailSenders = computed(() =>
  Object.values(emailBundle.value?.settings ?? {}).some((b) => (b.senders?.length ?? 0) > 0))

type SchedFilter = 'pending' | 'sent' | 'failed' | 'all'
const SCHED_FILTERS: SchedFilter[] = ['pending', 'sent', 'failed', 'all']
const schedFilter = ref<SchedFilter>('pending')
const scheduled = ref<ScheduledEmail[]>([])
const schedLoaded = ref(false)

async function loadScheduled() {
  if (activeOrgId.value == null) { schedLoaded.value = true; return }
  schedLoaded.value = false
  try { scheduled.value = (await listScheduledEmails(activeOrgId.value, schedFilter.value)).scheduled_emails }
  catch (e) { toast(humanize(e)) }
  finally { schedLoaded.value = true }
}
function setSchedFilter(f: SchedFilter) { schedFilter.value = f; loadScheduled() }
async function cancelScheduled(eid: number) {
  if (activeOrgId.value == null) return
  if (!await confirmAction({
    title: "annuler l'envoi", danger: true, confirmLabel: "Annuler l'envoi",
    message: 'cet email programmé ne partira pas. confirmer ?',
  })) return
  try { await cancelScheduledEmail(activeOrgId.value, eid); toast('envoi annulé'); await loadScheduled() }
  catch (e) { toast(humanize(e)) }
}

onMounted(async () => {
  if (activeOrgId.value == null) return
  emailBundle.value = await getOrgEmailSettings(activeOrgId.value).catch(() => null)
  await loadScheduled()
})
</script>

<template>
  <div class="content-inner fadein">
    <ConsoleCard v-if="me && activeOrgId == null" title="aucune org active">
      <div class="helptext">la gouvernance des connecteurs se règle au niveau d'une organisation — sélectionne ou crée-en une.</div>
    </ConsoleCard>

    <template v-else-if="activeOrgId != null">
      <ConnectorScopeView />

      <ConsoleCard v-if="hasEmailSenders" title="envois programmés"
        sub="emails différés (programmés ou retenus par la fenêtre calme)">
        <template #actions>
          <div class="seg">
            <button v-for="f in SCHED_FILTERS" :key="f" :class="{ on: schedFilter === f }" @click="setSchedFilter(f)">{{ f }}</button>
          </div>
        </template>
        <div v-if="schedLoaded && scheduled.length" class="rowlist">
          <div v-for="m in scheduled" :key="m.id" class="rowitem">
            <div class="oc-sched-txt">
              <span class="oc-sched-subj">{{ m.subject || '(sans objet)' }}</span>
              <span class="oc-dim">{{ m.to_email || '—' }} · {{ fmtDateTime(m.scheduled_at) }}</span>
            </div>
            <span class="oc-spacer" />
            <Tag :tone="m.status === 'failed' ? 'terra' : m.status === 'sent' ? 'olive' : 'saffron'">{{ m.status }}</Tag>
            <Btn v-if="m.status === 'pending'" kind="danger" @click="cancelScheduled(m.id)">Annuler</Btn>
          </div>
        </div>
        <p v-else-if="schedLoaded" class="helptext" style="padding: 6px 0">
          {{ schedFilter === 'pending' ? 'rien de programmé pour le moment.' : 'aucun email dans ce filtre.' }}
        </p>
      </ConsoleCard>
    </template>
  </div>
</template>

<style scoped>
.oc-sched-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.oc-sched-subj { font-size: 13px; color: var(--color-ink); }
.oc-dim { font-size: 11.5px; color: var(--color-faint); }
.oc-spacer { flex: 1; }
</style>

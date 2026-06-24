<script setup lang="ts">
// Email & envoi de l'org (/org/email, ADR 0009) — 3 cartons de réglages :
//  A. expéditeurs : adresses d'envoi de `email_send` (la 1re = défaut), éditables.
//  B. fenêtre calme : heures où l'envoi est différé (toggle + plage + tz).
//  C. envois programmés : file pending/sent/failed à consulter / annuler.
// État (load/error/loaded) calqué sur OrgConnectorsView. Édition gatée org_admin
// (le backend impose ORG_ADMIN sur le PUT ; on masque juste le footer). Confirmations
// destructives via usePrompt ; erreurs en toast(humanize).
import { computed, onMounted, ref } from 'vue'
import ConfigPanel from '@/components/console/config/ConfigPanel.vue'
import ConfigSection from '@/components/console/config/ConfigSection.vue'
import EditableCollection from '@/components/console/config/EditableCollection.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Toggle from '@/components/console/Toggle.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import {
  getOrgEmailSettings, setOrgEmailSettings, listScheduledEmails, cancelScheduledEmail,
} from '@/api/console'
import type { EmailSettings, EmailSender, ScheduledEmail } from '@/types/api'
import { fmtDateTime } from '@/types/api'
import { humanize } from '@/lib/errors'
import { DEFAULT_QUIET_HOURS, TIMEZONES } from '@/lib/email'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()

const activeOrgId = computed(() => me.value?.active_org ?? null)
// Édition gatée sur ce que le backend autorise réellement (ORG_ADMIN_OF) : org_admin
// de l'org consultée, OU super_admin (seul palier plateforme qui escalade via
// roles.is_org_admin → is_platform_admin = is_super_admin). L'`admin` opérateur N'escalade
// PAS : lui montrer le footer save mènerait à un 403 sur le PUT.
const isOrgAdmin = computed(() => me.value?.org_role === 'org_admin' || me.value?.role === 'super_admin')

// ── état partagé ──
const settings = ref<EmailSettings | null>(null)
const error = ref<string | null>(null)
const loaded = ref(false)

const status = computed<'loading' | 'error' | 'ready'>(() =>
  error.value ? 'error' : !loaded.value ? 'loading' : 'ready')

async function load() {
  if (activeOrgId.value == null) { loaded.value = true; return }
  loaded.value = false
  error.value = null
  try {
    settings.value = await getOrgEmailSettings(activeOrgId.value)
    await loadScheduled()
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

// ── A. expéditeurs ──────────────────────────────────────────────────────────
const draftSender = ref<EmailSender>({ email: '', name: '', reply_to: '', transport: 'mailer' })
const sendersDirty = ref(false)
const savingSenders = ref(false)

function addSender() {
  const email = draftSender.value.email.trim()
  if (!email || !settings.value) return
  const s: EmailSender = { email, transport: draftSender.value.transport }
  if (draftSender.value.name?.trim()) s.name = draftSender.value.name.trim()
  if (draftSender.value.reply_to?.trim()) s.reply_to = draftSender.value.reply_to.trim()
  settings.value.senders.push(s)
  draftSender.value = { email: '', name: '', reply_to: '', transport: 'mailer' }
  sendersDirty.value = true
}
function removeSender(index: number) {
  settings.value?.senders.splice(index, 1)
  sendersDirty.value = true
}
async function saveSenders() {
  if (activeOrgId.value == null || !settings.value) return
  savingSenders.value = true
  try {
    // PUT REMPLACE toute la liste → on envoie la liste COMPLÈTE.
    await setOrgEmailSettings(activeOrgId.value, { senders: settings.value.senders })
    sendersDirty.value = false
    toast('expéditeurs enregistrés')
    await load()
  } catch (e) { toast(humanize(e)) }
  finally { savingSenders.value = false }
}

// ── B. fenêtre calme ────────────────────────────────────────────────────────
const quietDirty = ref(false)
const savingQuiet = ref(false)
const quietEnabled = computed(() => !!settings.value && !settings.value.quiet_hours_default)

function toggleQuiet(on: boolean) {
  if (!settings.value) return
  settings.value.quiet_hours_default = !on
  if (on && !settings.value.quiet_hours) settings.value.quiet_hours = { ...DEFAULT_QUIET_HOURS }
  quietDirty.value = true
}
// <input type=time> ↔ heure entière 0..23 (HH:00).
function hourToTime(h: number): string { return `${String(h).padStart(2, '0')}:00` }
function timeToHour(v: string): number { return Math.max(0, Math.min(23, parseInt(v.split(':')[0] || '0', 10))) }
function setQuietStart(v: string) { if (settings.value) { settings.value.quiet_hours.start = timeToHour(v); quietDirty.value = true } }
function setQuietEnd(v: string) { if (settings.value) { settings.value.quiet_hours.end = timeToHour(v); quietDirty.value = true } }
function setQuietTz(tz: string) { if (settings.value) { settings.value.quiet_hours.tz = tz; quietDirty.value = true } }

async function saveQuiet() {
  if (activeOrgId.value == null || !settings.value) return
  // Activée = on POSE la fenêtre ; désactivée = on EFFACE celle stockée côté org
  // (clear_quiet_hours → retour au défaut plateforme à l'envoi). Les deux persistent
  // réellement : plus de toast de succès sur un no-op.
  if (quietEnabled.value && settings.value.quiet_hours.start === settings.value.quiet_hours.end) {
    toast('les heures de début et de fin doivent différer')
    return
  }
  savingQuiet.value = true
  try {
    if (quietEnabled.value) {
      await setOrgEmailSettings(activeOrgId.value, { quiet_hours: settings.value.quiet_hours })
      toast('fenêtre calme enregistrée')
    } else {
      await setOrgEmailSettings(activeOrgId.value, { clear_quiet_hours: true })
      toast('fenêtre calme désactivée (défaut plateforme à l\'envoi)')
    }
    quietDirty.value = false
    await load()
  } catch (e) { toast(humanize(e)) }
  finally { savingQuiet.value = false }
}

// ── C. envois programmés ────────────────────────────────────────────────────
type SchedFilter = 'pending' | 'sent' | 'failed' | 'all'
const SCHED_FILTERS: SchedFilter[] = ['pending', 'sent', 'failed', 'all']
const schedFilter = ref<SchedFilter>('pending')
const scheduled = ref<ScheduledEmail[]>([])
const schedLoaded = ref(false)

async function loadScheduled() {
  if (activeOrgId.value == null) { schedLoaded.value = true; return }
  schedLoaded.value = false
  try {
    const r = await listScheduledEmails(activeOrgId.value, schedFilter.value)
    scheduled.value = r.scheduled_emails
  } catch (e) { toast(humanize(e)) }
  finally { schedLoaded.value = true }
}
function setSchedFilter(f: SchedFilter) { schedFilter.value = f; loadScheduled() }

async function cancelScheduled(eid: number) {
  if (activeOrgId.value == null) return
  if (!await confirmAction({
    title: 'annuler l\'envoi', danger: true, confirmLabel: 'annuler l\'envoi',
    message: 'cet email programmé ne partira pas. confirmer ?',
  })) return
  try {
    await cancelScheduledEmail(activeOrgId.value, eid)
    toast('envoi annulé')
    await loadScheduled()
  } catch (e) { toast(humanize(e)) }
}

const schedStatus = computed<'loading' | 'empty' | 'ready'>(() =>
  !schedLoaded.value ? 'loading' : scheduled.value.length ? 'ready' : 'empty')
</script>

<template>
  <div class="content-inner fadein">
    <ConfigPanel v-if="loaded && activeOrgId == null" title="aucune org active">
      <div class="helptext">les réglages d'email se règlent au niveau d'une organisation — sélectionne ou crée-en une.</div>
    </ConfigPanel>

    <template v-else>
      <!-- ── A. expéditeurs ── -->
      <ConfigPanel
        title="expéditeurs"
        sub="adresses d'envoi · la 1re est le défaut quand from_email est omis"
        :status="status" :error="error"
        :saving="savingSenders" :dirty="sendersDirty" :readonly="!isOrgAdmin"
        @save="saveSenders" @retry="load">
        <ConfigSection v-if="settings"
          label="adresses"
          help="transport mailer = service otomata (domaine vérifié) ; resend = clé resend de l'org (BYOK).">
          <EditableCollection :items="settings.senders" empty-text="aucun expéditeur" @remove="removeSender">
            <template v-if="isOrgAdmin" #add>
              <input v-model="draftSender.email" class="inp em-add-email" placeholder="email@org.com" />
              <input v-model="draftSender.name" class="inp em-add-name" placeholder="nom (optionnel)" />
              <input v-model="draftSender.reply_to" class="inp em-add-name" placeholder="reply-to (optionnel)" />
              <select v-model="draftSender.transport" class="inp em-add-tr">
                <option value="mailer">mailer</option>
                <option value="resend">resend</option>
              </select>
              <Btn kind="mini" icon="plus" @click="addSender">ajouter</Btn>
            </template>
            <template #row="{ item, index, remove }">
              <span class="mono em-email">{{ (item as EmailSender).email }}</span>
              <span v-if="(item as EmailSender).name" class="em-dim">{{ (item as EmailSender).name }}</span>
              <span class="em-spacer" />
              <Tag tone="cobalt">{{ (item as EmailSender).transport }}</Tag>
              <Tag v-if="index === 0" tone="olive">défaut</Tag>
              <Btn v-if="isOrgAdmin" kind="danger" icon="trash" @click="remove" />
            </template>
          </EditableCollection>
          <p v-if="settings && !settings.resend_key_set" class="helptext em-note">
            transport <code>resend</code> : pose d'abord la clé resend de l'org (members &amp; secrets).
          </p>
        </ConfigSection>
      </ConfigPanel>

      <!-- ── B. fenêtre calme ── -->
      <ConfigPanel
        title="fenêtre calme"
        sub="aucun envoi pendant ces heures — les emails composés dans la fenêtre sont différés"
        :status="status" :error="error"
        :saving="savingQuiet" :dirty="quietDirty" :readonly="!isOrgAdmin"
        @save="saveQuiet" @retry="load">
        <template v-if="settings">
          <ConfigSection inline label="activer"
            help="quand active, aucun envoi pendant la plage ; sinon défaut plateforme à l'envoi.">
            <Toggle :on="quietEnabled" @change="toggleQuiet" />
          </ConfigSection>

          <ConfigSection v-if="quietEnabled" divider label="plage"
            help="heures pleines, fuseau de l'org. la plage peut enjamber minuit (ex. 22h → 7h).">
            <div class="em-quiet">
              <label class="em-q-field">
                <span class="em-q-cap">de</span>
                <input type="time" step="3600" class="inp em-q-time"
                  :value="hourToTime(settings.quiet_hours.start)"
                  :disabled="!isOrgAdmin" @change="setQuietStart(($event.target as HTMLInputElement).value)" />
              </label>
              <label class="em-q-field">
                <span class="em-q-cap">à</span>
                <input type="time" step="3600" class="inp em-q-time"
                  :value="hourToTime(settings.quiet_hours.end)"
                  :disabled="!isOrgAdmin" @change="setQuietEnd(($event.target as HTMLInputElement).value)" />
              </label>
              <label class="em-q-field em-q-tz">
                <span class="em-q-cap">fuseau</span>
                <select class="inp" :value="settings.quiet_hours.tz" :disabled="!isOrgAdmin"
                  @change="setQuietTz(($event.target as HTMLSelectElement).value)">
                  <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
                </select>
              </label>
            </div>
          </ConfigSection>
        </template>
      </ConfigPanel>

      <!-- ── C. envois programmés ── -->
      <ConfigPanel
        title="envois programmés"
        sub="emails différés (programmés ou retenus par la fenêtre calme)"
        :status="schedStatus"
        empty-title="aucun envoi en attente"
        :empty-body="schedFilter === 'pending' ? 'rien de programmé pour le moment.' : 'aucun email dans ce filtre.'">
        <template #actions>
          <div class="seg">
            <button v-for="f in SCHED_FILTERS" :key="f"
              :class="{ on: schedFilter === f }" @click="setSchedFilter(f)">{{ f }}</button>
          </div>
        </template>
        <div class="rowlist">
          <div v-for="m in scheduled" :key="m.id" class="rowitem">
            <div class="em-sched-txt">
              <span class="em-sched-subj">{{ m.subject || '(sans objet)' }}</span>
              <span class="em-dim">{{ m.to_email || '—' }} · {{ fmtDateTime(m.scheduled_at) }}</span>
            </div>
            <span class="em-spacer" />
            <Tag :tone="m.status === 'failed' ? 'terra' : m.status === 'sent' ? 'olive' : 'saffron'">{{ m.status }}</Tag>
            <Btn v-if="m.status === 'pending'" kind="danger" @click="cancelScheduled(m.id)">annuler</Btn>
          </div>
        </div>
      </ConfigPanel>
    </template>
  </div>
</template>

<style scoped>
/* Largeurs des champs de la row d'ajout — pas de layout neuf, juste du sizing. */
.em-add-email { width: 200px; }
.em-add-name { width: 150px; }
.em-add-tr { width: 110px; }
.em-email { font-size: 12px; }
.em-dim { font-size: 11.5px; color: var(--color-faint); }
.em-spacer { flex: 1; }
.em-note { margin-top: 8px; }
.em-quiet { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
.em-q-field { display: flex; flex-direction: column; gap: 4px; }
.em-q-cap { font-size: 11px; color: var(--color-mute); }
.em-q-time { width: 110px; }
.em-q-tz { min-width: 200px; flex: 1; }
.em-sched-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.em-sched-subj { font-size: 13px; color: var(--color-ink); }
</style>

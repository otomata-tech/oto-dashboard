<script setup lang="ts">
// Réglages email d'UN connecteur, embarqués dans la carte connecteur ORG (refonte
// « email par connecteur »). Deux sections persistées indépendamment (comme
// ConnectorTransforms persiste par geste, pas de gros bouton global) :
//  (a) expéditeurs : adresses d'envoi de `email_send` (la 1re = défaut), éditables.
//      PAS de select transport — le transport DÉRIVE du connecteur (affiché en
//      lecture seule via <Tag>).
//  (b) fenêtre calme : heures où l'envoi est différé (toggle + plage HH:00 + tz).
// L'org_admin règle ; les autres voient en lecture seule (le backend impose
// ORG_ADMIN sur le PUT). Erreurs en toast(humanize). Émet `changed` après save.
import { computed, ref } from 'vue'
import ConfigSection from './config/ConfigSection.vue'
import EditableCollection from './config/EditableCollection.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import Toggle from './Toggle.vue'
import { useToast } from '@/composables/useToast'
import { setOrgEmailSettings } from '@/api/console'
import type { EmailBlock, EmailSender, QuietHours } from '@/types/api'
import { humanize } from '@/lib/errors'
import { DEFAULT_QUIET_HOURS, TIMEZONES } from '@/lib/email'

const props = defineProps<{
  connector: string
  block: EmailBlock | null
  transport: string
  quietDefault: QuietHours
  resendKeySet: boolean
  orgId: number
  isOrgAdmin: boolean
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const { toast } = useToast()

const canEdit = computed(() => props.isOrgAdmin)
// resend exige la clé d'org posée sur la carte connecteur elle-même.
const keyMissing = computed(() => props.connector === 'resend' && !props.resendKeySet)

// ── (a) expéditeurs ───────────────────────────────────────────────────────
// Copie locale éditable de la liste (le bloc props est en lecture, reload après save).
const senders = ref<EmailSender[]>((props.block?.senders ?? []).map((s) => ({ ...s })))
const draft = ref<{ email: string; name: string; reply_to: string }>({ email: '', name: '', reply_to: '' })
const sendersDirty = ref(false)
const savingSenders = ref(false)

function addSender() {
  const email = draft.value.email.trim()
  if (!email) return
  const s: EmailSender = { email }
  if (draft.value.name.trim()) s.name = draft.value.name.trim()
  if (draft.value.reply_to.trim()) s.reply_to = draft.value.reply_to.trim()
  senders.value.push(s)
  draft.value = { email: '', name: '', reply_to: '' }
  sendersDirty.value = true
}
function removeSender(index: number) {
  senders.value.splice(index, 1)
  sendersDirty.value = true
}
async function saveSenders() {
  if (!canEdit.value) return
  savingSenders.value = true
  try {
    // PUT REMPLACE la liste de CE connecteur → on envoie la liste complète.
    await setOrgEmailSettings(props.orgId, props.connector, { senders: senders.value })
    sendersDirty.value = false
    toast('expéditeurs enregistrés')
    emit('changed')
  } catch (e) { toast(humanize(e)) }
  finally { savingSenders.value = false }
}

// ── (b) fenêtre calme ─────────────────────────────────────────────────────
// Copie locale : présente = active ; absente = défaut plateforme à l'envoi.
const quiet = ref<QuietHours | null>(props.block?.quiet_hours ? { ...props.block.quiet_hours } : null)
const quietDirty = ref(false)
const savingQuiet = ref(false)
const quietEnabled = computed(() => quiet.value != null)

function toggleQuiet(on: boolean) {
  if (on) quiet.value = quiet.value ?? { ...(props.quietDefault ?? DEFAULT_QUIET_HOURS) }
  else quiet.value = null
  quietDirty.value = true
}
// <input type=time> ↔ heure entière 0..23 (HH:00).
function hourToTime(h: number): string { return `${String(h).padStart(2, '0')}:00` }
function timeToHour(v: string): number { return Math.max(0, Math.min(23, parseInt(v.split(':')[0] || '0', 10))) }
function setStart(v: string) { if (quiet.value) { quiet.value.start = timeToHour(v); quietDirty.value = true } }
function setEnd(v: string) { if (quiet.value) { quiet.value.end = timeToHour(v); quietDirty.value = true } }
function setTz(tz: string) { if (quiet.value) { quiet.value.tz = tz; quietDirty.value = true } }

async function saveQuiet() {
  if (!canEdit.value) return
  // Active = on POSE la fenêtre ; désactivée = on EFFACE (retour défaut plateforme).
  if (quiet.value && quiet.value.start === quiet.value.end) {
    toast('les heures de début et de fin doivent différer')
    return
  }
  savingQuiet.value = true
  try {
    if (quiet.value) {
      await setOrgEmailSettings(props.orgId, props.connector, { quiet_hours: quiet.value })
      toast('fenêtre calme enregistrée')
    } else {
      await setOrgEmailSettings(props.orgId, props.connector, { clear_quiet_hours: true })
      toast('fenêtre calme désactivée (défaut plateforme à l\'envoi)')
    }
    quietDirty.value = false
    emit('changed')
  } catch (e) { toast(humanize(e)) }
  finally { savingQuiet.value = false }
}
</script>

<template>
  <div class="ce">
    <p v-if="keyMissing" class="helptext ce-note">
      pose d'abord la <strong>clé resend de l'org</strong> (sur la carte ci-dessus) — sans elle, ce connecteur ne peut pas envoyer.
    </p>

    <!-- (a) expéditeurs -->
    <ConfigSection label="expéditeurs"
      help="adresses d'envoi de email_send · la 1re est le défaut quand from_email est omis.">
      <template #status><Tag tone="cobalt" :title="`transport dérivé du connecteur ${connector}`">{{ transport }}</Tag></template>
      <EditableCollection :items="senders" empty-text="aucun expéditeur" @remove="removeSender">
        <template v-if="canEdit" #add>
          <input v-model="draft.email" class="inp ce-email" placeholder="email@org.com" />
          <input v-model="draft.name" class="inp ce-name" placeholder="nom (optionnel)" />
          <input v-model="draft.reply_to" class="inp ce-name" placeholder="reply-to (optionnel)" />
          <Btn kind="mini" icon="plus" @click="addSender">Ajouter</Btn>
        </template>
        <template #row="{ item, index, remove }">
          <span class="mono ce-addr">{{ (item as EmailSender).email }}</span>
          <span v-if="(item as EmailSender).name" class="ce-dim">{{ (item as EmailSender).name }}</span>
          <span class="ce-spacer" />
          <Tag v-if="index === 0" tone="olive">défaut</Tag>
          <Btn v-if="canEdit" kind="danger" icon="trash" @click="remove" />
        </template>
      </EditableCollection>
      <div v-if="canEdit && sendersDirty" class="ce-save">
        <Btn kind="mini" :disabled="savingSenders" @click="saveSenders">
          {{ savingSenders ? '…' : 'enregistrer les expéditeurs' }}
        </Btn>
      </div>
    </ConfigSection>

    <!-- (b) fenêtre calme -->
    <ConfigSection inline divider label="fenêtre calme"
      help="quand active, aucun envoi pendant la plage ; sinon défaut plateforme à l'envoi.">
      <Toggle :on="quietEnabled" :disabled="!canEdit" @change="toggleQuiet" />
    </ConfigSection>

    <ConfigSection v-if="quietEnabled && quiet" label="plage"
      help="heures pleines, fuseau de l'org. la plage peut enjamber minuit (ex. 22h → 7h).">
      <div class="ce-quiet">
        <label class="ce-q-field">
          <span class="ce-q-cap">de</span>
          <input type="time" step="3600" class="inp ce-q-time" :value="hourToTime(quiet.start)"
            :disabled="!canEdit" @change="setStart(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="ce-q-field">
          <span class="ce-q-cap">à</span>
          <input type="time" step="3600" class="inp ce-q-time" :value="hourToTime(quiet.end)"
            :disabled="!canEdit" @change="setEnd(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="ce-q-field ce-q-tz">
          <span class="ce-q-cap">fuseau</span>
          <select class="inp" :value="quiet.tz" :disabled="!canEdit"
            @change="setTz(($event.target as HTMLSelectElement).value)">
            <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
          </select>
        </label>
      </div>
    </ConfigSection>
    <div v-if="canEdit && quietDirty" class="ce-save">
      <Btn kind="mini" :disabled="savingQuiet" @click="saveQuiet">
        {{ savingQuiet ? '…' : 'Enregistrer la fenêtre calme' }}
      </Btn>
    </div>
  </div>
</template>

<style scoped>
.ce { display: flex; flex-direction: column; gap: 6px; }
.ce-note { margin: 4px 0 8px; }
.ce-email { width: 200px; }
.ce-name { width: 150px; }
.ce-addr { font-size: 12px; }
.ce-dim { font-size: 11.5px; color: var(--color-faint); }
.ce-spacer { flex: 1; }
.ce-save { padding-top: 4px; }
.ce-quiet { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
.ce-q-field { display: flex; flex-direction: column; gap: 4px; }
.ce-q-cap { font-size: 11px; color: var(--color-mute); }
.ce-q-time { width: 110px; }
.ce-q-tz { min-width: 200px; flex: 1; }
</style>

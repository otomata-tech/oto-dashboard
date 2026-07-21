<script setup lang="ts">
// Widget credential HÉBERGÉ (unipile, ADR 0024 R1) — rendu INLINE dans la
// ConnectorCard (fin de la carte ancrée #messaging). Option de connecteur : login
// hébergé Unipile (pas de cookie/extension), les outils agissent comme toi. L'option
// est débloquée par un admin (comp) ou par ta propre clé Unipile (BYO). Auto-suffisant.
import { computed, onMounted, ref } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import Tag from './Tag.vue'
import FormDialog from './FormDialog.vue'
import AccountShareSection from './AccountShareSection.vue'
import { getUnipileStatus, connectUnipile, disconnectUnipile, setCredential, deleteApiKey,
  getConnectorIdentities, setConnectorIdentity, getAccountGrants } from '@/api/console'
import { useFormDialog, type FormDialogField } from '@/composables/useFormDialog'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { UnipileStatus, ConnectorIdentity, AccountGrant } from '@/types/api'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const unipile = ref<UnipileStatus | null>(null)
const identities = ref<ConnectorIdentity[]>([])
const myGrants = ref<AccountGrant[]>([])   // grants accordés PAR moi (#55, face owner)
const loading = ref(true)

const channels = [
  { key: 'linkedin', label: 'linkedin', desc: 'recherche, scrape et messages en ton nom' },
  { key: 'whatsapp', label: 'whatsapp', desc: 'lire et envoyer des messages en ton nom' },
  { key: 'telegram', label: 'telegram', desc: 'lire et envoyer des messages en ton nom' },
  { key: 'instagram', label: 'instagram', desc: 'lire et envoyer des DM en ton nom' },
  { key: 'messenger', label: 'messenger', desc: 'lire et envoyer des messages en ton nom' },
  { key: 'twitter', label: 'x / twitter', desc: 'lire et envoyer des DM en ton nom' },
] as const

async function refresh() {
  unipile.value = await getUnipileStatus().catch(() => null)
  // Le backend décide quoi lister selon le mode : BYO → les comptes de la clé ;
  // revente → vide, SAUF comptes accordés par un propriétaire (#55). Le front
  // n'encode plus la logique de mode.
  identities.value = await getConnectorIdentities('unipile')
    .then(r => r.identities).catch(() => [])
  myGrants.value = await getAccountGrants()
    .then(r => r.granted_by_me).catch(() => [])
}
onMounted(async () => { await refresh(); loading.value = false })

// Identités d'un canal (ex. les comptes LinkedIn de la clé d'équipe).
function idsFor(channelKey: string): ConnectorIdentity[] {
  return identities.value.filter(i => (i.channel || '').toLowerCase() === channelKey)
}
// Grants accordés PAR moi sur ce canal (face owner de la section « opéré aussi par »).
function grantsFor(channelKey: string): AccountGrant[] {
  return myGrants.value.filter(g => (g.provider || '').toLowerCase() === channelKey)
}
// « partagé par X · <org> » : l'org dit D'OÙ vient le partage (le compte du
// propriétaire est connecté sous cette org — cf. owner.org_name, #55).
const ownerLabel = (i: ConnectorIdentity) => {
  if (!i.owner) return null
  const who = i.owner.name || i.owner.email || i.owner.sub
  return i.owner.org_name ? `${who} · ${i.owner.org_name}` : who
}
async function pick(id: string) {
  try { await setConnectorIdentity('unipile', id); toast('compte sélectionné'); await refresh() }
  catch (e) { toast(humanize(e)) }
}

async function go(channel: string, premium?: string) {
  const out = await connectUnipile(channel, premium)
  if (out.adopted) {
    // compte déjà connecté dans une autre org (même clé plateforme) → lié ici sans wizard
    toast(`${out.account_name || 'compte'} activé pour cette org`)
    await refresh()
    return
  }
  if (out.url) window.location.href = out.url
}

async function link(channel: string) {
  // LinkedIn : le produit premium se choisit À LA CONNEXION — Unipile ne connecte que
  // `classic` par défaut, et en changer après impose de tout reconnecter. Les autres
  // canaux n'ont pas de premium → on ne montre aucun réglage (pas de choix = pas de bruit).
  if (channel !== 'linkedin') {
    try { await go(channel) } catch (e) { toast(humanize(e)) }
    return
  }
  const fields: FormDialogField[] = [
    { key: 'product', label: 'produit LinkedIn', type: 'select', initial: 'classic',
      options: [
        { value: 'classic', label: 'Classique (par défaut)' },
        { value: 'recruiter', label: 'Recruiter' },
        { value: 'sales_navigator', label: 'Sales Navigator' },
      ] },
  ]
  openForm({
    title: 'connecter mon LinkedIn',
    description: "Ne choisis Recruiter ou Sales Navigator que si tu as le siège LinkedIn " +
      "correspondant : un seul des deux, et en changer impose de reconnecter le compte. " +
      "Ces produits proposent aussi la connexion par cookies, recommandée par Unipile.",
    fields, submitLabel: 'continuer',
    onConfirm: async (v) => {
      const p = String(v.product || 'classic')
      try { await go(channel, p === 'classic' ? undefined : p) }
      catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function drop(channel: string) {
  if (!await confirmAction({ title: `déconnecter ${channel} (unipile)`, danger: true, confirmLabel: 'Déconnecter', message: `déconnecter ton ${channel} ? les outils unipile cesseront d'agir en ton nom sur ce canal.` })) return
  try { await disconnectUnipile(channel); toast(`${channel} déconnecté`); await refresh() } catch (e) { toast(humanize(e)) }
}

// ── ma clé Unipile perso (BYO member) + version d'API ──────────────────────
// Clé personnelle scopée à l'org courante → PRIME sur la clé d'org/plateforme
// (cascade user > group > org > platform). La version v1/v2 SUIT cette clé
// (une clé v2 = compte Unipile v2 dédié). C'est le « switch v1/v2 depuis mon compte ».
const modeLabel = computed(() => {
  const m = unipile.value?.mode
  return m === 'user' ? 'ta clé perso' : m === 'group' ? "la clé d'équipe" : m === 'org' ? "la clé d'org"
    : m === 'platform' ? 'la clé plateforme oto' : '—'
})
function editMyKey() {
  const fields: FormDialogField[] = [
    { key: 'key', label: 'ta clé Unipile', type: 'password', required: true, placeholder: 'colle ta clé Unipile' },
  ]
  openForm({
    title: 'ma clé Unipile (perso)',
    description: "ta clé personnelle Unipile, scopée à l'org courante — elle prime sur la clé d'org. stockée chiffrée.",
    fields, submitLabel: 'enregistrer',
    onConfirm: async (v) => {
      try {
        await setCredential('unipile', { key: String(v.key ?? '') })
        toast('clé perso enregistrée'); await refresh()
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}
async function dropMyKey() {
  if (!await confirmAction({ title: 'retirer ma clé Unipile perso', danger: true, confirmLabel: 'Retirer',
    message: "retirer ta clé perso ? tu repasseras sur la clé d'org / plateforme." })) return
  try { await deleteApiKey('unipile'); toast('clé perso retirée'); await refresh() } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="hw">
    <div class="hw-head">
      <span class="dim hw-sub">login hébergé (sans cookie/extension) ; les outils agissent ensuite en ton nom.</span>
      <Tag v-if="!loading && !unipile?.subscribed" tone="saffron">demande l'activation à un admin</Tag>
    </div>
    <!-- Ma clé Unipile (perso) — prime sur la clé d'org. -->
    <div v-if="!loading" class="hw-mykey">
      <span class="dim hw-mykey-lbl">résout via {{ modeLabel }}</span>
      <Btn kind="mini" @click="editMyKey">{{ unipile?.mode === 'user' ? 'changer ma clé' : 'poser ma clé' }}</Btn>
      <Btn v-if="unipile?.mode === 'user'" kind="danger" @click="dropMyKey">retirer</Btn>
    </div>
    <div v-for="c in channels" :key="c.key" class="hw-channel">
      <div class="hw-row">
        <Dot :tone="unipile?.channels?.[c.key]?.connected ? 'olive' : (unipile?.subscribed ? 'saffron' : 'faint')" :size="8" />
        <div class="hw-id">
          <div class="hw-name">{{ c.label }}
            <Tag tone="cobalt">hébergé</Tag>
            <Tag v-if="unipile?.channels?.[c.key]?.connected" tone="olive">connecté</Tag>
          </div>
          <div class="hw-desc">
            {{ !unipile?.subscribed
              ? 'option non activée — demande à un admin (ou ajoute ta propre clé unipile)'
              : (unipile?.channels?.[c.key]?.connected
                ? `connecté le ${fmtDate(unipile?.channels?.[c.key]?.connected_at ?? null) ?? ''} · ${c.desc}`
                : (unipile?.elsewhere?.[c.key]
                  ? `${unipile.elsewhere[c.key]?.account_name || 'ton compte'} est connecté dans une autre de tes orgs — « Connecter » l'active ici`
                  : `relie ton ${c.label} pour commencer`)) }}
          </div>
        </div>
        <template v-if="unipile?.subscribed">
          <Btn v-if="unipile?.channels?.[c.key]?.connected" kind="danger" @click="drop(c.key)">Déconnecter</Btn>
          <Btn v-else kind="mini" @click="link(c.key)">Connecter</Btn>
        </template>
      </div>
      <!-- BYO : la clé porte plusieurs comptes → choisir lequel piloter (ADR 0024).
           Un compte ACCORDÉ par son propriétaire (#55) apparaît « partagé par X ». -->
      <div v-if="idsFor(c.key).length" class="hw-picker">
        <div v-for="idn in idsFor(c.key)" :key="idn.id" class="hw-acct">
          <Dot :tone="idn.is_default ? 'olive' : 'faint'" :size="7" />
          <span class="hw-acct-name">{{ idn.label || idn.id }}
            <Tag v-if="idn.is_default" tone="saffron">actif</Tag>
            <Tag v-if="idn.granted" tone="cobalt">partagé par {{ ownerLabel(idn) }}</Tag>
            <span v-if="idn.status && idn.status.toUpperCase() !== 'OK'" class="dim hw-acct-st">· {{ idn.status }}</span>
          </span>
          <Btn v-if="!idn.is_default" kind="mini" @click="pick(idn.id)">Utiliser ce compte</Btn>
        </div>
      </div>
      <!-- #55 face propriétaire : autoriser/révoquer des membres à opérer CE compte -->
      <AccountShareSection v-if="unipile?.channels?.[c.key]?.connected"
        :channel="c.key" :grants="grantsFor(c.key)" @changed="refresh" />
    </div>
    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
.hw { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.hw-head { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; }
.hw-sub { font-size: 11.5px; }
.hw-mykey { display: flex; align-items: center; gap: 10px; padding: 4px 0 6px; border-bottom: 1px solid var(--color-hair-soft); }
.hw-mykey-lbl { flex: 1; min-width: 0; font-size: 12px; display: flex; gap: 6px; align-items: center; }
.hw-channel { display: flex; flex-direction: column; border-bottom: 1px solid var(--color-hair-soft); }
.hw-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.hw-id { min-width: 0; flex: 1; }
.hw-name { font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.hw-desc { font-size: 11.5px; color: var(--color-mute); }
.hw-picker { display: flex; flex-direction: column; gap: 4px; padding: 2px 0 6px 18px; }
.hw-acct { display: flex; align-items: center; gap: 8px; }
.hw-acct-name { flex: 1; min-width: 0; font-size: 12px; display: flex; gap: 6px; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hw-acct-st { font-size: 11px; }
</style>

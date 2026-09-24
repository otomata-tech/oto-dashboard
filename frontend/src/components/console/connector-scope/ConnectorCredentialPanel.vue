<script setup lang="ts" generic="R">
// Panneau credential du drawer unifié : l'instance possédée à CE scope (clé perso/
// équipe/org/plateforme). Deux modes : single-instance (state + add/rotate/remove) ou
// multi-instance (`items` — plateforme : N clés/labels, chacune retirable). Édition via
// le levier de l'adaptateur (FormDialog ou CredentialFieldsDialog, hébergés par la vue).
import { computed, ref } from 'vue'
import type { CredentialLever } from './adapter'
import type { ConnectorMeta, VerifyResult } from '@/types/api'
import Dot from '@/components/console/Dot.vue'
import Btn from '@/components/console/Btn.vue'
import ConnectorKeyAccounts from '@/components/console/ConnectorKeyAccounts.vue'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{ lever: CredentialLever<R>; row: R; meta?: ConnectorMeta }>()
const emit = defineEmits<{ changed: [] }>()
const s = computed(() => props.lever.state(props.row))
const canEdit = computed(() => props.lever.canEdit(props.row))
const items = computed(() => props.lever.items?.(props.row) ?? null)

// Comptes NOMMÉS à ce palier (#121) — une clé PayFit par société d'un groupe. Offerts
// quand le levier sait en poser, que le connecteur en porte plusieurs (dérivé du
// descripteur, comme au panneau de connexion) et qu'une clé est déjà posée : le premier
// compte reste anonyme, la pose ordinaire ne change pas.
const accountsAt = computed(() => {
  const { accountScope, addAccount } = props.lever
  const multi = props.meta?.auth?.cardinality === 'multi_account'
  return accountScope && addAccount && multi && s.value.present ? accountScope : null
})
const addAccount = (existing: string[]) => props.lever.addAccount?.(props.row, existing)
// La sonde d'UN compte nommé, offerte à la liste aux mêmes conditions que « tester ».
const verifyAccount = computed(() => {
  const { verify, canVerify } = props.lever
  if (!verify || !(canVerify?.(props.row) ?? true)) return undefined
  return (account: string) => verify(props.row, account)
})
// Dès qu'un compte NOMMÉ existe, la ligne anonyme a migré (le serveur la renomme au
// premier compte nommé) : « Renouveler » la reposerait sans nom (refusé, 409) et
// « Retirer » viserait un compte qui n'existe plus. Chaque compte porte alors ses
// gestes dans la liste.
const namedAccounts = ref(0)
const singleGestures = computed(() => canEdit.value && !(accountsAt.value && namedAccounts.value > 0))

// Geste hors formulaire qui COMPLÈTE le credential (consentement OAuth). Il n'apparaît
// que s'il reste à faire — c'est le BACKEND qui le dit (`pending`), jamais la présence
// d'une clé : poser l'application CRÉE le credential, donc gater sur « une clé existe »
// masquerait le bouton exactement au moment où il devient nécessaire.
const connectCta = computed(() => props.lever.connect ?? null)
const connecting = ref(false)
async function connect() {
  if (!props.lever.connect) return
  connecting.value = true
  try { await props.lever.connect.start(props.row) }
  finally { connecting.value = false }
}

// Sonde « tester la connexion » (résultat éphémère) quand le levier l'expose, qu'une clé est
// posée, et que le levier ne la retient pas (`canVerify`) : c'est un POST sans `op`, que le
// serveur refuse en consultation (oto#211).
// Sans compte, la sonde vise la ligne ANONYME. Dès qu'un compte nommé existe à ce
// palier, cette ligne n'existe plus (le serveur l'a renommée) : ce bouton répondrait
// « aucune clé d'org posée » devant deux sociétés posées. Chaque société porte alors
// son propre « tester » dans la liste (`verifyAccount`).
const canTest = computed(() =>
  !!props.lever.verify && s.value.present && (props.lever.canVerify?.(props.row) ?? true)
  && !(accountsAt.value && namedAccounts.value > 0))
const testing = ref(false)
const testRes = ref<VerifyResult | null>(null)
async function test() {
  if (!props.lever.verify) return
  testing.value = true; testRes.value = null
  try { testRes.value = await props.lever.verify(props.row) }
  catch (e) { testRes.value = { ok: false, provider: '', error: humanize(e) } }
  finally { testing.value = false }
}
</script>

<template>
  <section class="ccp">
    <h4 class="ccp-h">{{ lever.title }}</h4>

    <!-- multi-instance : liste des clés (plateforme) -->
    <template v-if="items">
      <div v-for="it in items" :key="it.key" class="ccp-item">
        <span class="ccp-item-lbl"><Dot tone="cobalt" /> {{ it.label }}<span v-if="it.sub" class="ccp-sub"> · {{ it.sub }}</span></span>
        <Btn v-if="canEdit && lever.removeItem" kind="danger" @click="lever.removeItem(row, it.key)">{{ t('common.remove') }}</Btn>
      </div>
      <div v-if="!items.length" class="ccp-state dim">{{ t('connectorsUi.credential.noKey') }}</div>
      <div v-if="canEdit" class="ccp-actions"><Btn kind="mini" icon="plus" @click="lever.edit(row)">{{ t('connectorsUi.credential.addKey') }}</Btn></div>
      <div v-else class="helptext" style="margin-top: 8px">{{ t('connectorsUi.credential.readOnly') }}</div>
    </template>

    <!-- single-instance : team/org/user -->
    <template v-else>
      <div v-if="s.present" class="ccp-state"><Dot tone="olive" /> {{ s.label }}<span v-if="s.sub" class="ccp-sub"> · {{ s.sub }}</span></div>
      <div v-else class="ccp-state dim">{{ s.label }}</div>
      <div v-if="canEdit || canTest" class="ccp-actions">
        <Btn v-if="singleGestures" kind="mini" :icon="s.present ? undefined : 'plus'" @click="lever.edit(row)">{{ s.present ? t('connectorsUi.credential.renew') : t('connectorsUi.credential.addKey') }}</Btn>
        <Btn v-if="singleGestures && s.present && lever.remove" kind="danger" @click="lever.remove(row)">{{ t('common.remove') }}</Btn>
        <Btn v-if="canTest" kind="mini" :disabled="testing" @click="test">{{ testing ? t('connectorsUi.credential.testing') : t('connectorsUi.credential.test') }}</Btn>
        <Btn v-if="canEdit && connectCta?.available(row)" kind="mini" :disabled="connecting"
             @click="connect">{{ connecting ? t('connectorsUi.credential.opening') : connectCta.label(row) }}</Btn>
      </div>
      <p v-if="testRes" class="ccp-test" :style="{ color: testRes.ok ? 'var(--color-olive)' : 'var(--color-terra-ink)' }">
        {{ testRes.ok ? t('connectorsUi.credential.ok') : `✗ ${testRes.error}` }}
      </p>
      <p v-if="canEdit && connectCta?.available(row)" class="helptext" style="margin-top: 8px">
        {{ t('connectorsUi.credential.oauthHelp') }}
      </p>
      <ConnectorKeyAccounts v-if="accountsAt && meta" :connector="meta" :scope="accountsAt"
                            :add="addAccount" :verify="verifyAccount"
                            @named="(n) => namedAccounts = n" @changed="emit('changed')" />
      <div v-if="!canEdit && !canTest" class="helptext" style="margin-top: 8px">{{ t('connectorsUi.credential.readOnly') }}</div>
    </template>
  </section>
</template>

<style scoped>
.ccp { padding: 16px 20px; }
.ccp-h { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-faint); margin-bottom: 10px; }
.ccp-state { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.ccp-state.dim { color: var(--color-faint); }
.ccp-sub { color: var(--color-faint); font-size: 11.5px; }
.ccp-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--color-hair); }
.ccp-item-lbl { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-ink); }
.ccp-actions { display: flex; gap: 8px; margin-top: 12px; }
.ccp-test { font-size: 11.5px; margin-top: 8px; }
</style>

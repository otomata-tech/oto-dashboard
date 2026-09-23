<script setup lang="ts">
// Comptes NOMMÉS d'un connecteur à clé (oto-dashboard#121) — un compte du coffre =
// un workspace Slack, une organisation Zoho, un site du navigateur connecté. Le mot
// vient du registre (`auth.account_noun`) : l'écran l'affiche, il ne le devine pas.
//
// Piloté par la liste SERVIE (`/api/connectors/{c}/identities`), jamais par une clé
// composée reconstruite ici : quand le backend donnera aux instances un identifiant
// stable (chantier v3 L6), cet écran n'aura rien à changer.
//
// Le premier compte reste ANONYME (aucune friction sur la pose ordinaire) : ce bloc
// n'apparaît qu'une fois un credential posé, et le nom n'est demandé qu'à partir du
// deuxième — le serveur migre alors lui-même la ligne anonyme vers un libellé.
//
// Le MÊME bloc sert deux paliers (`scope`) : les comptes du membre (panneau de
// connexion) et ceux de l'org (panneau « clé partagée d'org » de /org/connectors — une
// clé PayFit par société d'un groupe). Les quatre routes prennent le palier
// (`identities?scope=`, `identities/default`, `PATCH identities/{id}`,
// `DELETE api-keys?scope=`) : seuls changent le droit d'écrire et les mots.
import { computed, onMounted, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import Tag from './Tag.vue'
import {
  deleteApiKey, getConnectorIdentities, renameConnectorIdentity, setConnectorIdentity,
} from '@/api/console'
import { useMe, canAdministerOrg, canWriteInOrg } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { explain, humanize } from '@/lib/errors'
import { accountWords } from '@/lib/accountNoun'
import type { ConnectorIdentity, ConnectorMeta, VerifyResult } from '@/types/api'

const props = withDefaults(defineProps<{
  connector: ConnectorMeta
  // Le palier dont on lit, choisit et retire les comptes.
  scope?: 'member' | 'org'
  // Poser un compte de plus (le geste de l'adaptateur) ; absent = pas d'ajout offert.
  add?: (existing: string[]) => void
  // Sonder UN compte (palier org : la sonde prend un `account`) ; absent = pas de test.
  verify?: (account: string) => Promise<VerifyResult>
}>(), { scope: 'member', add: undefined, verify: undefined })
// `named` : combien de comptes NOMMÉS sont posés — le panneau d'org retire alors ses
// gestes « clé unique », qui viseraient un compte anonyme qui n'existe plus.
// `changed` : une écriture ici (défaut, retrait) — le parent relit ce qu'il affiche.
const emit = defineEmits<{ named: [n: number]; changed: [] }>()
const { me, reload } = useMe()
const { toast } = useToast()
const { confirmAction, promptText } = usePrompt()

const w = computed(() => accountWords(props.connector.auth?.account_noun))
const noun = computed(() => w.value.noun)
const atOrg = computed(() => props.scope === 'org')
// Qui résout avec ces comptes : l'agent du membre, ou celui de chaque membre de l'org.
const agent = computed(() => (atOrg.value ? "l'agent de chaque membre" : 'ton agent'))
const accounts = ref<ConnectorIdentity[]>([])
const loading = ref(true)
const unreadable = ref(false)
const busy = ref('')
// Par défaut, retirer, ajouter : des écritures, refusées en consultation (oto#212). La liste
// des comptes reste lue. Au palier org, le serveur exige en plus l'admin d'org.
const canWrite = computed(() => (atOrg.value ? canAdministerOrg(me.value) : canWriteInOrg(me.value)))

// Un compte du coffre a pour id son NOM ('' = la ligne mono historique).
const named = computed(() => accounts.value.filter((a) => a.id !== ''))
const names = computed(() => named.value.map((a) => a.id))
const labelOf = (a: ConnectorIdentity) => a.label || a.id || `${noun.value} par défaut`
// Liste seulement quand il y a plusieurs comptes : avec un seul, la pile de provenance
// au-dessus dit déjà tout (palier membre). Au palier org, rien au-dessus ne nomme le
// compte : un seul compte NOMMÉ se liste, sinon il n'aurait plus de geste de retrait.
const listed = computed(() => accounts.value.length > 1 || (atOrg.value && named.value.length > 0))
watch(() => named.value.length, (n) => emit('named', n), { immediate: true })

// ⚠️ RIEN ne pose de compte par défaut tout seul. Le serveur n'écrit `is_default` que
// sur le geste explicite (`_keyed_select`) : après une deuxième pose, AUCUNE ligne ne
// le porte, et la cascade refuse alors de choisir à la place de l'utilisateur — elle
// lève « plusieurs comptes configurés, aucun marqué par défaut, précise lequel ».
// L'écran doit donc dire cet état, sinon l'utilisateur ajoute un compte et voit ses
// outils cesser de répondre sans qu'aucune surface ne l'explique.
const noDefault = computed(() => accounts.value.length > 1
  && !accounts.value.some((a) => a.is_default))

async function load() {
  loading.value = true
  try {
    const res = await getConnectorIdentities(props.connector.name, props.scope)
    accounts.value = res.supported ? res.identities : []
    unreadable.value = false
  } catch {
    // Un incident de lecture ne doit masquer NI le reste du panneau, NI le geste
    // d'ajout : le bloc n'est monté que sur un credential déjà posé, donc « poser un
    // compte de plus » reste vrai même quand la liste ne se lit pas. On le dit.
    accounts.value = []
    unreadable.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

// La liste suit le PROFIL. Le dialogue d'ajout est hébergé par `ConnectorScopeView`, à
// côté du panneau : une pose réussie ne démonte rien ici, et sans ce lien la liste
// resterait sur son instantané de montage — « ajouté » au toast, un seul compte à
// l'écran. `me` est le signal partagé de toutes les écritures de credential (chaque
// geste de l'adaptateur le recharge), et il est aussi le bon : les comptes sont lus au
// palier membre de l'ORG DE CONTEXTE, qui change avec lui.
watch(me, load)

async function makeDefault(a: ConnectorIdentity) {
  busy.value = a.id
  try {
    await setConnectorIdentity(props.connector.name, a.id, props.scope)
    toast(`${labelOf(a)} utilisé${w.value.e} par défaut`)
    await Promise.all([load(), reload()])
    emit('changed')
  } catch (e) { toast(humanize(e)) } finally { busy.value = '' }
}

// Le verdict de la dernière sonde, par compte : un compte, un résultat, sous sa ligne.
const tested = ref<Record<string, VerifyResult>>({})
async function test(a: ConnectorIdentity) {
  if (!props.verify) return
  busy.value = a.id
  try { tested.value = { ...tested.value, [a.id]: await props.verify(a.id) } }
  catch (e) { tested.value = { ...tested.value, [a.id]: { ok: false, provider: '', error: humanize(e) } } }
  finally { busy.value = '' }
}

// Le nom EST ce que l'agent passe en `_account=` : le renommer change la cible, pas un
// libellé d'affichage. Un nom déjà pris est refusé ici et par le serveur (l'écriture
// écraserait l'autre clé).
async function rename(a: ConnectorIdentity) {
  const next = (await promptText(`renommer ${w.value.ce}`, {
    label: 'nom', value: a.id, required: true,
    hint: `${agent.value} ${w.value.pronom} vise par ce nom (_account) : une procédure qui cite l'ancien devra suivre.`,
  }))?.trim()
  if (!next || next === a.id) return
  if (names.value.includes(next)) { toast(`« ${next} » est déjà pris`); return }
  busy.value = a.id
  try {
    await renameConnectorIdentity(props.connector.name, a.id, next, props.scope)
    toast(`${noun.value} renommé${w.value.e} : ${next}`)
    await Promise.all([load(), reload()])
    emit('changed')
  } catch (e) { toast(explain(e)) } finally { busy.value = '' }
}

async function remove(a: ConnectorIdentity) {
  const ok = await confirmAction({
    title: `retirer ${w.value.ce}`,
    danger: true,
    confirmLabel: 'Retirer',
    message: `retirer les identifiants ${props.connector.label} de « ${labelOf(a)} » ? `
      + `les outils qui ${w.value.pronom} visaient ne résoudront plus.`,
  })
  if (!ok) return
  busy.value = a.id
  try {
    await deleteApiKey(props.connector.name, props.scope, a.id)
    toast(`${noun.value} retiré${w.value.e}`)
    await Promise.all([load(), reload()])
    emit('changed')
  } catch (e) { toast(humanize(e)) } finally { busy.value = '' }
}
</script>

<template>
  <div v-if="!loading" class="ka">
    <!-- Liste seulement quand il y a plusieurs comptes (ou, à l'org, un compte nommé —
         cf. `listed`) : une liste d'un élément que la pile dit déjà est du bruit. -->
    <template v-if="listed">
      <div class="eyebrow ka-head">
        <template v-if="atOrg">{{ w.plural }} {{ connector.label }} de l'org</template>
        <template v-else>tes {{ w.plural }} {{ connector.label }}</template>
      </div>
      <template v-for="a in accounts" :key="a.id">
      <div class="ka-row">
        <Dot :tone="a.is_default ? 'olive' : 'faint'" :size="8" />
        <span class="ka-name">{{ labelOf(a) }}</span>
        <Tag v-if="a.is_default" tone="olive">par défaut</Tag>
        <span v-if="canWrite" class="ka-actions">
          <Btn v-if="!a.is_default" kind="mini" :disabled="busy === a.id"
               @click="makeDefault(a)">Par défaut</Btn>
          <Btn v-if="verify" kind="mini" :disabled="busy === a.id" @click="test(a)">tester</Btn>
          <Btn v-if="a.id !== ''" kind="mini" :disabled="busy === a.id" @click="rename(a)">Renommer</Btn>
          <Btn kind="danger" :disabled="busy === a.id" @click="remove(a)">Retirer</Btn>
        </span>
      </div>
      <p v-if="tested[a.id]" class="ka-test"
         :style="{ color: tested[a.id]!.ok ? 'var(--color-olive)' : 'var(--color-terra-ink)' }">
        {{ tested[a.id]!.ok ? `✓ ${labelOf(a)} : connexion OK` : `✗ ${labelOf(a)} : ${tested[a.id]!.error}` }}
      </p>
      </template>
      <!-- Tant qu'aucun n'est marqué, la cascade ne tranche pas : le dire là où le
           geste qui répare est à portée de clic. -->
      <p v-if="noDefault" class="helptext ka-warn">
        <Dot tone="saffron" :size="8" />
        {{ w.aucun }} par défaut : {{ agent }} devra préciser {{ w.lequel }} viser à chaque
        appel. choisis-en {{ w.e ? 'une' : 'un' }} pour qu'il résolve tout seul.
      </p>
      <p v-else-if="accounts.length > 1" class="helptext ka-note">
        {{ w.le }} par défaut sert quand rien n'est précisé ; {{ agent }} peut viser
        {{ w.lun }} des autres à l'appel.
      </p>
    </template>

    <div v-if="add && canWrite" class="ka-add">
      <Btn kind="mini" @click="add(names)">
        Ajouter {{ w.un }}
      </Btn>
      <span v-if="accounts.length === 1" class="helptext ka-hint">
        {{ w.second }} vit à côté {{ w.e ? 'de la première' : 'du premier' }} — chacun ses identifiants.
      </span>
      <span v-else-if="unreadable" class="helptext ka-hint">
        <template v-if="atOrg">les {{ w.plural }} de l'org</template><template v-else>tes {{ w.plural }}</template>
        déjà posé{{ w.e }}s n'ont pas pu être listé{{ w.e }}s — réessaie pour les voir.
      </span>
    </div>
  </div>
</template>

<style scoped>
.ka { margin-top: 14px; border-top: 1px solid var(--color-hair-soft); padding-top: 12px; }
.ka-head { margin-bottom: 9px; }
.ka-row { display: flex; align-items: center; gap: 9px; padding: 5px 0; }
.ka-name { font-size: 12.5px; font-weight: 600; color: var(--color-ink); }
.ka-actions { margin-left: auto; display: flex; gap: 6px; }
.ka-test { margin: -2px 0 6px 17px; font-size: 11.5px; }
.ka-note { margin: 8px 0 0; }
.ka-warn { margin: 8px 0 0; display: flex; align-items: baseline; gap: 7px; }
.ka-add { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.ka-hint { margin: 0; }
</style>

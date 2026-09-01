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
import { computed, onMounted, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import Tag from './Tag.vue'
import { deleteApiKey, getConnectorIdentities, setConnectorIdentity } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import type { ConnectorIdentity, MyConnector } from '@/types/api'
import type { ConnectionLever } from './connector-scope/adapter'

const props = defineProps<{ connector: MyConnector; lever: ConnectionLever<MyConnector> }>()
const { me, reload } = useMe()
const { toast } = useToast()
const { confirmAction } = usePrompt()

const noun = computed(() => props.connector.auth.account_noun || 'compte')
const accounts = ref<ConnectorIdentity[]>([])
const loading = ref(true)
const unreadable = ref(false)
const busy = ref('')

// Un compte du coffre a pour id son NOM ('' = la ligne mono historique).
const named = computed(() => accounts.value.filter((a) => a.id !== ''))
const names = computed(() => named.value.map((a) => a.id))
const labelOf = (a: ConnectorIdentity) => a.label || a.id || `${noun.value} par défaut`

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
    const res = await getConnectorIdentities(props.connector.name)
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
    await setConnectorIdentity(props.connector.name, a.id)
    toast(`${labelOf(a)} utilisé par défaut`)
    await Promise.all([load(), reload()])
  } catch (e) { toast(humanize(e)) } finally { busy.value = '' }
}

async function remove(a: ConnectorIdentity) {
  const ok = await confirmAction({
    title: `retirer ce ${noun.value}`,
    danger: true,
    confirmLabel: 'Retirer',
    message: `retirer les identifiants ${props.connector.label} de « ${labelOf(a)} » ? `
      + 'les outils qui le visaient ne résoudront plus.',
  })
  if (!ok) return
  busy.value = a.id
  try {
    await deleteApiKey(props.connector.name, 'member', a.id)
    toast(`${noun.value} retiré`)
    await Promise.all([load(), reload()])
  } catch (e) { toast(humanize(e)) } finally { busy.value = '' }
}
</script>

<template>
  <div v-if="!loading" class="ka">
    <!-- Liste seulement quand il y a plusieurs comptes : avec un seul, la pile de
         provenance au-dessus dit déjà tout, et une liste d'un élément est du bruit. -->
    <template v-if="accounts.length > 1">
      <div class="eyebrow ka-head">tes {{ noun }}s {{ connector.label }}</div>
      <div v-for="a in accounts" :key="a.id" class="ka-row">
        <Dot :tone="a.is_default ? 'olive' : 'faint'" :size="8" />
        <span class="ka-name">{{ labelOf(a) }}</span>
        <Tag v-if="a.is_default" tone="olive">par défaut</Tag>
        <span class="ka-actions">
          <Btn v-if="!a.is_default" kind="mini" :disabled="busy === a.id"
               @click="makeDefault(a)">Par défaut</Btn>
          <Btn kind="danger" :disabled="busy === a.id" @click="remove(a)">Retirer</Btn>
        </span>
      </div>
      <!-- Tant qu'aucun n'est marqué, la cascade ne tranche pas : le dire là où le
           geste qui répare est à portée de clic. -->
      <p v-if="noDefault" class="helptext ka-warn">
        <Dot tone="saffron" :size="8" />
        aucun {{ noun }} par défaut : ton agent devra préciser lequel viser à chaque
        appel. choisis-en un pour qu'il résolve tout seul.
      </p>
      <p v-else class="helptext ka-note">
        le {{ noun }} par défaut sert quand rien n'est précisé ; ton agent peut viser
        l'un des autres à l'appel.
      </p>
    </template>

    <div v-if="lever.addAccount" class="ka-add">
      <Btn kind="mini" @click="lever.addAccount(connector, names)">
        Ajouter un {{ noun }}
      </Btn>
      <span v-if="accounts.length === 1" class="helptext ka-hint">
        un second {{ noun }} vit à côté du premier — chacun ses identifiants.
      </span>
      <span v-else-if="unreadable" class="helptext ka-hint">
        tes {{ noun }}s déjà posés n'ont pas pu être listés — réessaie pour les voir.
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
.ka-note { margin: 8px 0 0; }
.ka-warn { margin: 8px 0 0; display: flex; align-items: baseline; gap: 7px; }
.ka-add { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.ka-hint { margin: 0; }
</style>

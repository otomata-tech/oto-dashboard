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
import { computed, onMounted, ref } from 'vue'
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
const { reload } = useMe()
const { toast } = useToast()
const { confirmAction } = usePrompt()

const noun = computed(() => props.connector.auth.account_noun || 'compte')
const accounts = ref<ConnectorIdentity[]>([])
const loading = ref(true)
const busy = ref('')

// Un compte du coffre a pour id son NOM ('' = la ligne mono historique).
const named = computed(() => accounts.value.filter((a) => a.id !== ''))
const names = computed(() => named.value.map((a) => a.id))
const labelOf = (a: ConnectorIdentity) => a.label || a.id || `${noun.value} par défaut`

async function load() {
  loading.value = true
  try {
    const res = await getConnectorIdentities(props.connector.name)
    accounts.value = res.supported ? res.identities : []
  } catch {
    // Un incident de lecture ne doit pas masquer le reste du panneau : on n'affiche
    // simplement pas la liste (le credential effectif est dit par la pile au-dessus).
    accounts.value = []
  } finally {
    loading.value = false
  }
}
onMounted(load)

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
  <div v-if="!loading && accounts.length" class="ka">
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
      <p class="helptext ka-note">
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
.ka-add { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.ka-hint { margin: 0; }
</style>

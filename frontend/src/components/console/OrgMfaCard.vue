<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Tag from './Tag.vue'
import { getOrgMfa, setOrgMfa } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'

// MFA obligatoire de l'org : lecture pour tout membre, bascule pour l'org_admin.
// L'activation impose un 2ᵉ facteur à tous les membres au prochain login (Logto).
const props = defineProps<{ orgId: number; canManage: boolean }>()

const { toast } = useToast()
const { confirmAction } = usePrompt()

const requireMfa = ref(false)
const loading = ref(true)
const error = ref(false)
const busy = ref(false)

async function reload() {
  loading.value = true
  error.value = false
  try {
    requireMfa.value = (await getOrgMfa(props.orgId)).require_mfa
  } catch (e) {
    error.value = true
    toast(humanize(e))
  } finally {
    loading.value = false
  }
}

async function toggle() {
  const enabling = !requireMfa.value
  if (enabling && !await confirmAction({
    title: 'imposer le MFA à toute l\'org',
    confirmLabel: 'Activer',
    message: 'tous les membres devront configurer et utiliser un 2ᵉ facteur (application, passkey) à leur prochaine connexion — ils ne pourront plus se connecter sans.',
  })) return
  busy.value = true
  try {
    await setOrgMfa(props.orgId, enabling)
    requireMfa.value = enabling
    toast(enabling ? 'MFA imposé aux membres de l\'org' : 'MFA non imposé')
  } catch (e) {
    toast(humanize(e))
  } finally {
    busy.value = false
  }
}

onMounted(reload)
watch(() => props.orgId, reload)
</script>

<template>
  <ConsoleCard title="sécurité · MFA obligatoire"
    sub="impose un 2ᵉ facteur (application, passkey) à tous les membres de l'org à leur prochaine connexion.">
    <template v-if="canManage" #actions>
      <Btn kind="mini" :disabled="busy || loading || error" @click="toggle">
        {{ requireMfa ? 'Désactiver' : 'Activer' }}
      </Btn>
    </template>

    <p v-if="loading" class="helptext" style="padding: 8px 2px">chargement…</p>
    <p v-else-if="error" class="helptext" style="padding: 8px 2px">état MFA indisponible.</p>
    <div v-else class="mfa-state">
      <Tag :tone="requireMfa ? 'olive' : 'ink'">{{ requireMfa ? 'imposé' : 'non imposé' }}</Tag>
      <span class="helptext">
        {{ requireMfa
          ? 'les membres doivent utiliser un 2ᵉ facteur pour se connecter.'
          : 'le 2ᵉ facteur reste au choix de chaque membre.' }}
      </span>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.mfa-state { display: flex; align-items: center; gap: 8px; padding: 8px 2px; }
</style>

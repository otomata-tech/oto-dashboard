<script setup lang="ts">
import { computed, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import Tag from '@/components/console/Tag.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import AccountTokensCard from '@/components/console/AccountTokensCard.vue'
import SecurityCard from '@/components/console/SecurityCard.vue'
import AgentContextCard from '@/components/console/AgentContextCard.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { uploadAvatar, deleteAvatar, getAgentReadme, setAgentReadme } from '@/api/console'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me, reload } = useMe()
const { logout } = useAuth()

const busy = ref(false)

const displayName = computed(() => me.value?.name || me.value?.email || '')
// Rôle plateforme lisible (3 paliers, cf. useMe). Pas le rôle d'org (porté par l'identité).
const roleLabel = computed(() =>
  me.value?.role === 'super_admin' ? 'super admin'
    : me.value?.role === 'admin' ? 'admin' : 'membre')

async function onDropFile(file: File) {
  try {
    validateImage(file) // miroir backend (png/jpeg/webp ≤ 2 Mo) — le Dropzone pré-valide déjà
    busy.value = true
    await uploadAvatar(file)
    await reload()
    toast('avatar updated')
  } catch (err) {
    toast(humanize(err))
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!await confirmAction({ title: 'remove avatar', danger: true, confirmLabel: 'remove', message: 'remove your avatar?' })) return
  try {
    busy.value = true
    await deleteAvatar()
    await reload()
    toast('avatar removed')
  } catch (err) {
    toast(humanize(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="content-inner narrow fadein">
    <ConsoleCard title="profile" sub="your identity across oto — synced from your login.">
      <div class="profile-row">
        <Avatar :src="me?.avatar_url" :name="displayName" :size="72" />
        <div class="profile-meta">
          <div class="profile-name">{{ displayName || '—' }}</div>
          <div class="profile-email">{{ me?.email }}</div>
        </div>
      </div>

      <Dropzone
        class="mt-4"
        :accept="IMAGE_ACCEPT_ATTR"
        :max-size-mb="2"
        :busy="busy"
        :label="me?.avatar_url ? 'changer l\'avatar' : 'déposer un avatar'"
        hint="png, jpeg ou webp · glisser-déposer ou cliquer · max 2 Mo"
        @select="onDropFile"
        @error="toast"
      />
      <div v-if="me?.avatar_url" class="profile-actions">
        <Btn kind="danger" :disabled="busy" @click="remove">remove avatar</Btn>
      </div>
    </ConsoleCard>

    <ConsoleCard title="compte & accès" sub="comment tu te connectes — et sous quel rôle.">
      <div class="acc-rows">
        <div class="acc-row">
          <span class="acc-k">email</span>
          <span class="acc-v">{{ me?.email || '—' }}</span>
        </div>
        <div class="acc-row">
          <span class="acc-k">rôle plateforme</span>
          <span class="acc-v"><Tag :tone="me?.role === 'member' ? 'ink' : 'saffron'">{{ roleLabel }}</Tag></span>
        </div>
      </div>
      <p class="acc-note">
        ton compte est fixé par ta connexion (claude.ai / Logto). pour agir sous un autre
        compte, reconnecte le connecteur OTO dans claude.ai. l'organisation et l'équipe
        actives se changent depuis l'identité, en haut du menu.
      </p>
      <div class="profile-actions">
        <Btn icon="logout" @click="() => logout()">se déconnecter</Btn>
      </div>
    </ConsoleCard>

    <SecurityCard />

    <!-- Niveau USER du concept agent_readme : injecté à chaque session, après les
         readme plateforme / org / équipe (cumulable). -->
    <AgentReadmeCard title="agent readme · toi"
      sub="ta prose libre, injectée au début de chaque session de ton agent — après celles de la plateforme, de ton org et de ton équipe."
      :can-edit="true" allow-empty
      placeholder="ex. je préfère des réponses courtes ; mes clients sont des PME ; signe mes emails « Alexis »."
      :load="getAgentReadme" :save="setAgentReadme" />

    <AgentContextCard />

    <AccountTokensCard />
  </div>
</template>

<style scoped>
.profile-row { display: flex; align-items: center; gap: 18px; }
.profile-name { font-weight: 600; font-size: 15px; color: var(--color-ink); }
.profile-email { font-size: 12.5px; color: var(--color-mute); }
.profile-actions { display: flex; gap: 10px; margin-top: 18px; }

.acc-rows { display: flex; flex-direction: column; gap: 2px; }
.acc-row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 2px; border-bottom: 1px solid var(--color-hair-soft);
}
.acc-row:last-child { border-bottom: 0; }
.acc-k {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--color-faint); width: 130px; flex: none;
}
.acc-v { font-size: 13px; color: var(--color-ink); font-weight: 500; }
.acc-note { font-size: 12px; color: var(--color-mute); line-height: 1.5; margin: 14px 0 0; }
</style>

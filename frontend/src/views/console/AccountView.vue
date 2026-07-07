<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import Tag from '@/components/console/Tag.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import AccountTokensCard from '@/components/console/AccountTokensCard.vue'
import SecurityCard from '@/components/console/SecurityCard.vue'
import AgentContextCard from '@/components/console/AgentContextCard.vue'
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import LocaleSwitch from '@/components/console/LocaleSwitch.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { useAuth } from '@/composables/useAuth'
import { uploadAvatar, deleteAvatar, getAgentReadme, setAgentReadme } from '@/api/console'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'
import { analyticsEnabled, consent, grantConsent, denyConsent } from '@/lib/analytics'

const { t } = useI18n()
const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me, reload } = useMe()
const { logout } = useAuth()

const busy = ref(false)

const displayName = computed(() => me.value?.name || me.value?.email || '')
// Consentement analytics (RGPD) : n'a de sens que si PostHog est configuré. `granted`
// = capture active ; tout autre état (denied/null) = rien collecté. Retrait à tout moment.
const analyticsOn = analyticsEnabled()
const analyticsGranted = computed(() => consent.value === 'granted')
// Rôle plateforme lisible (3 paliers, cf. useMe). Pas le rôle d'org (porté par l'identité).
const roleLabel = computed(() =>
  me.value?.role === 'super_admin' ? t('account.role.super')
    : me.value?.role === 'admin' ? t('account.role.admin') : t('account.role.member'))

async function onDropFile(file: File) {
  try {
    validateImage(file) // miroir backend (png/jpeg/webp ≤ 2 Mo) — le Dropzone pré-valide déjà
    busy.value = true
    await uploadAvatar(file)
    await reload()
    toast(t('account.avatarUpdated'))
  } catch (err) {
    toast(humanize(err))
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!await confirmAction({ title: t('account.removeAvatarTitle'), danger: true, confirmLabel: t('common.remove'), message: t('account.removeAvatarConfirm') })) return
  try {
    busy.value = true
    await deleteAvatar()
    await reload()
    toast(t('account.avatarRemoved'))
  } catch (err) {
    toast(humanize(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="content-inner narrow fadein">
    <ConsoleCard :title="t('account.profileTitle')" :sub="t('account.profileSub')">
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
        :label="me?.avatar_url ? t('account.changeAvatar') : t('account.dropAvatar')"
        :hint="t('account.avatarHint')"
        @select="onDropFile"
        @error="toast"
      />
      <div v-if="me?.avatar_url" class="profile-actions">
        <Btn kind="danger" :disabled="busy" @click="remove">{{ t('account.removeAvatarBtn') }}</Btn>
      </div>
    </ConsoleCard>

    <ConsoleCard :title="t('account.accessTitle')" :sub="t('account.accessSub')">
      <div class="acc-rows">
        <div class="acc-row">
          <span class="acc-k">{{ t('account.email') }}</span>
          <span class="acc-v">{{ me?.email || '—' }}</span>
        </div>
        <div class="acc-row">
          <span class="acc-k">{{ t('account.platformRole') }}</span>
          <span class="acc-v"><Tag :tone="me?.role === 'member' ? 'ink' : 'saffron'">{{ roleLabel }}</Tag></span>
        </div>
        <div class="acc-row">
          <span class="acc-k">{{ t('common.language') }}</span>
          <span class="acc-v"><LocaleSwitch /></span>
        </div>
      </div>
      <p class="acc-note">
        {{ t('account.accessNote') }}
      </p>
      <div class="profile-actions">
        <Btn icon="logout" @click="() => logout()">{{ t('common.signOut') }}</Btn>
      </div>
    </ConsoleCard>

    <SecurityCard />

    <!-- Confidentialité : retrait/révision du consentement analytics (RGPD), déplacé
         ici depuis le bouton flottant. Caché si PostHog n'est pas configuré. -->
    <ConsoleCard v-if="analyticsOn" :title="t('account.privacyTitle')" :sub="t('account.privacySub')">
      <div class="acc-rows">
        <div class="acc-row">
          <span class="acc-k">{{ t('account.privacyState') }}</span>
          <span class="acc-v">
            <Tag :tone="analyticsGranted ? 'olive' : 'ink'">
              {{ analyticsGranted ? t('account.privacyGranted') : t('account.privacyDenied') }}
            </Tag>
          </span>
        </div>
      </div>
      <p class="acc-note">{{ analyticsGranted ? t('account.privacyOn') : t('account.privacyOff') }}</p>
      <div class="profile-actions">
        <Btn v-if="analyticsGranted" @click="denyConsent">{{ t('account.privacyDisable') }}</Btn>
        <Btn v-else @click="grantConsent">{{ t('account.privacyEnable') }}</Btn>
      </div>
    </ConsoleCard>

    <!-- Niveau USER du concept agent_readme : injecté à chaque session, après les
         readme plateforme / org / équipe (cumulable). -->
    <AgentReadmeCard :title="t('account.readmeTitle')"
      :sub="t('account.readmeSub')"
      :can-edit="true" allow-empty
      :placeholder="t('account.readmePlaceholder')"
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

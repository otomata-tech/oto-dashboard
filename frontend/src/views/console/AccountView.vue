<script setup lang="ts">
import { computed, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe } from '@/composables/useMe'
import { uploadAvatar, deleteAvatar } from '@/api/console'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me, reload } = useMe()

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

const displayName = computed(() => me.value?.name || me.value?.email || '')

function pick() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // permet de re-sélectionner le même fichier
  if (!file) return
  try {
    validateImage(file)
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
  <div class="content-inner fadein">
    <ConsoleCard title="profile" sub="your identity across oto — synced from your login.">
      <div class="profile-row">
        <Avatar :src="me?.avatar_url" :name="displayName" :size="72" />
        <div class="profile-meta">
          <div class="profile-name">{{ displayName || '—' }}</div>
          <div class="profile-email">{{ me?.email }}</div>
        </div>
      </div>

      <div class="profile-actions">
        <input
          ref="fileInput"
          type="file"
          :accept="IMAGE_ACCEPT_ATTR"
          style="display: none"
          @change="onFile"
        />
        <Btn icon="pen" :disabled="busy" @click="pick">{{ me?.avatar_url ? 'change avatar' : 'upload avatar' }}</Btn>
        <Btn v-if="me?.avatar_url" kind="danger" :disabled="busy" @click="remove">remove</Btn>
      </div>
      <div class="helptext">png, jpeg or webp · up to 2 MB.</div>
    </ConsoleCard>
  </div>
</template>

<style scoped>
.profile-row { display: flex; align-items: center; gap: 18px; }
.profile-name { font-weight: 600; font-size: 15px; color: var(--color-ink); }
.profile-email { font-size: 12.5px; color: var(--color-mute); }
.profile-actions { display: flex; gap: 10px; margin-top: 18px; }
</style>

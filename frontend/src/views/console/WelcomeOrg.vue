<script setup lang="ts">
import { ref } from 'vue'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useMe } from '@/composables/useMe'
import { useToast } from '@/composables/useToast'
import { createMyOrg } from '@/api/console'
import { humanize } from '@/lib/errors'

const { reload } = useMe()
const { toast } = useToast()
const name = ref('')
const busy = ref(false)

async function create() {
  const n = name.value.trim()
  if (!n || busy.value) return
  busy.value = true
  try {
    await createMyOrg(n)
    await reload()          // me.active_org renseigné → le shell rend la console
  } catch (e) {
    toast(humanize(e))
    busy.value = false
  }
}
</script>

<template>
  <div class="state-empty" style="margin-top: 64px">
    <span class="o-medallion o-medallion-lg">o</span>
    <div class="se-title">create your <Squiggle>workspace</Squiggle>.</div>
    <div class="se-body">
      a workspace holds your team's shared keys, agent readme, procedures and prospects. you'll be its admin —
      invite teammates once it's set up.
    </div>
    <div style="display: flex; gap: 8px; width: 100%; max-width: 380px; margin-top: 6px">
      <input v-model="name" class="inp" placeholder="workspace name (e.g. acme)"
        :disabled="busy" @keyup.enter="create" />
      <Btn :disabled="busy" @click="create">{{ busy ? 'creating…' : 'create' }}</Btn>
    </div>
    <div class="se-body" style="font-size: 12px; margin-top: 2px">
      have an invitation? open the link from your email instead.
    </div>
  </div>
</template>

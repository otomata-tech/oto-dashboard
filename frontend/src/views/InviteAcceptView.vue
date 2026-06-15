<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Btn from '@/components/console/Btn.vue'
import Squiggle from '@/components/console/Squiggle.vue'
import { useAuth } from '@/composables/useAuth'
import { useMe } from '@/composables/useMe'
import { acceptInvite } from '@/api/console'
import { humanize } from '@/lib/errors'

const router = useRouter()
const { isAuthenticated, login } = useAuth()
const { reload } = useMe()

const state = ref<'working' | 'ok' | 'error'>('working')
const orgName = ref<string | null>(null)
const errMsg = ref('')

onMounted(async () => {
  const token = new URLSearchParams(window.location.search).get('token')
  if (!token) { state.value = 'error'; errMsg.value = 'this invitation link is missing its token.'; return }
  if (!isAuthenticated.value) { await login(`/invite?token=${encodeURIComponent(token)}`); return }
  try {
    const r = await acceptInvite(token)
    orgName.value = r.name
    await reload()
    state.value = 'ok'
  } catch (e) {
    errMsg.value = humanize(e)
    state.value = 'error'
  }
})
</script>

<template>
  <div class="invite-page">
    <div class="state-empty">
      <span class="o-medallion o-medallion-lg">o</span>

      <template v-if="state === 'working'">
        <div class="se-title">joining…</div>
        <div class="se-body">checking your invitation.</div>
      </template>

      <template v-else-if="state === 'ok'">
        <div class="se-title">welcome <Squiggle>aboard</Squiggle>.</div>
        <div class="se-body">you've joined <strong>{{ orgName }}</strong>. it's now your active workspace.</div>
        <div class="se-cta">
          <Btn @click="router.push('/console/overview')">go to console</Btn>
        </div>
      </template>

      <template v-else>
        <div class="se-title">invitation <Squiggle>expired</Squiggle>.</div>
        <div class="se-body">{{ errMsg }}</div>
        <div class="se-cta">
          <Btn kind="ghost" @click="router.push('/console/overview')">go to console</Btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.invite-page {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-bg);
  font-family: var(--font-sans); color: var(--color-ink);
}
</style>

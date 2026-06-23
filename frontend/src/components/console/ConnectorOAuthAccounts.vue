<script setup lang="ts">
// Widget credential OAuth MULTI-COMPTE (ADR 0024, B2) — rendu INLINE dans la
// ConnectorCard (fin de la carte ancrée #google). Auto-suffisant : charge son
// propre statut et porte link / make-default / revoke. Aujourd'hui câblé sur les
// endpoints Google (seul connecteur multi-compte) ; B3 généralisera aux autres
// flux oauth en injectant le jeu d'endpoints par connecteur.
import { onMounted, ref } from 'vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import Dot from './Dot.vue'
import { getGoogleStatus, startGoogleOauth, setGoogleDefault, revokeGoogle } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { humanize } from '@/lib/errors'
import { fmtDate } from '@/types/api'
import type { GoogleOauthStatus } from '@/types/api'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const status = ref<GoogleOauthStatus | null>(null)
const loading = ref(true)

async function refresh() { status.value = await getGoogleStatus().catch(() => null) }
onMounted(async () => { await refresh(); loading.value = false })

async function link() {
  try { const { auth_url } = await startGoogleOauth(); window.location.href = auth_url }
  catch (e) { toast(humanize(e)) }
}
async function makeDefault(email: string) {
  try { await setGoogleDefault(email); toast('default account updated'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
async function revoke(email: string) {
  if (!await confirmAction({ title: 'revoke google account', danger: true, confirmLabel: 'revoke', message: `revoke ${email}? tools using it will lose access.` })) return
  try { await revokeGoogle(email); toast('grant revoked'); await refresh() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="oa">
    <div v-if="status?.accounts?.length" class="oa-list">
      <div v-for="g in status.accounts" :key="g.email || ''" class="oa-row">
        <Dot tone="olive" :size="8" />
        <div class="oa-id">
          <div class="oa-email">{{ g.email }} <Tag v-if="g.is_default" tone="saffron">default</Tag></div>
          <div class="oa-scopes">{{ g.scopes.join(' · ') }} · granted {{ fmtDate(g.granted_at) ?? '—' }}</div>
        </div>
        <Btn v-if="!g.is_default" kind="mini" @click="makeDefault(g.email!)">make default</Btn>
        <Btn kind="danger" @click="revoke(g.email!)">revoke</Btn>
      </div>
    </div>
    <span v-else-if="!loading" class="dim oa-empty">no account linked yet — link one to unlock the connector's tools.</span>
    <Btn kind="mini" icon="plus" class="oa-add" @click="link">link account</Btn>
  </div>
</template>

<style scoped>
.oa { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.oa-list { display: flex; flex-direction: column; gap: 6px; }
.oa-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--color-hair-soft); }
.oa-id { min-width: 0; flex: 1; }
.oa-email { font-weight: 600; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.oa-scopes { font-size: 11px; color: var(--color-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oa-empty { font-size: 12px; }
.oa-add { align-self: flex-start; }
</style>

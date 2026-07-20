<script setup lang="ts">
// Carte d'accueil « À traiter » + « Récent » (lot 3 Ship 3, plan §6.4). Une file,
// deux voies : À traiter draine vers zéro (propositions à valider + invitations),
// Récent vieillit (propositions résolues + partages reçus). Affichée seulement si
// non vide (zéro-inbox = rien). Ouvre `ProposalReview` en place / accepte une invit.
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/console/Icon.vue'
import ProposalReview from '@/components/console/ProposalReview.vue'
import { ref } from 'vue'
import { useInbox } from '@/composables/useInbox'
import { useScopedLink } from '@/composables/useScopedLink'
import { fmtDate } from '@/types/api'
import type { InboxReviewItem } from '@/types/api'

const { inbox, load } = useInbox()
const router = useRouter()
const { scoped } = useScopedLink()
const reviewing = ref<InboxReviewItem | null>(null)

onMounted(() => { if (!inbox.value) void load() })

function acceptInvite(code?: string) {
  if (code) void router.push(`/invitation/${code}`)
}
function openRecent(r: { project_id?: number | null; doc_id?: number | null }) {
  if (r.doc_id && r.project_id) return void router.push(scoped(`/projects/${r.project_id}?doc=${r.doc_id}`))
  if (r.project_id) return void router.push(scoped(`/projects/${r.project_id}`))
}
async function onResolved() { await load() }
</script>

<template>
  <div v-if="inbox && (inbox.to_review.length || inbox.invitations.length || inbox.recent.length)" class="card ib">
    <!-- À traiter -->
    <template v-if="inbox.to_review.length || inbox.invitations.length">
      <div class="ib-hd">à traiter <span class="ib-count">{{ inbox.count }}</span></div>
      <div class="rowlist">
        <button v-for="it in inbox.to_review" :key="'r' + it.request_id" class="rowitem" @click="reviewing = it">
          <span class="ib-ic"><Icon name="pencil" :size="14" /></span>
          <span class="ib-main">
            <strong>{{ it.proposed_title || it.doc_title }}</strong>
            <span class="dim"> — {{ it.kind === 'create' ? 'nouvelle page' : 'modification' }} · {{ it.project_name }}</span>
          </span>
          <span class="dim ib-by">{{ it.requested_by || '' }}</span>
        </button>
        <button v-for="(iv, i) in inbox.invitations" :key="'i' + i" class="rowitem" @click="acceptInvite(iv.code)">
          <span class="ib-ic"><Icon name="users" :size="14" /></span>
          <span class="ib-main">Invitation à rejoindre <strong>{{ iv.org_name || 'une organisation' }}</strong></span>
          <span class="dim ib-by">{{ iv.invited_by || '' }}</span>
        </button>
      </div>
    </template>

    <!-- Récent -->
    <template v-if="inbox.recent.length">
      <div class="ib-hd ib-hd--sub">récent</div>
      <div class="rowlist">
        <button v-for="(r, i) in inbox.recent" :key="'x' + i" class="rowitem rowitem--muted" @click="openRecent(r)">
          <span class="ib-main">
            <template v-if="r.type === 'proposal_resolved'">
              Ta proposition « {{ r.proposed_title || r.doc_title }} » a été
              <strong :class="r.status === 'accepted' ? 'ok' : 'no'">{{ r.status === 'accepted' ? 'acceptée' : 'refusée' }}</strong>
            </template>
            <template v-else>
              <strong>{{ r.project_name }}</strong> partagé avec toi
            </template>
          </span>
          <span class="dim ib-by">{{ fmtDate(r.resolved_at || r.granted_at) }}</span>
        </button>
      </div>
    </template>

    <ProposalReview :item="reviewing" @close="reviewing = null" @resolved="onResolved" />
  </div>
</template>

<style scoped>
.ib { padding: 14px 16px; }
.ib-hd { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--color-saffron-ink); display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ib-hd--sub { color: var(--color-faint); margin-top: 16px; }
.ib-count { background: var(--color-saffron); color: #2c2112; border-radius: var(--radius-pill); padding: 0 7px; font-size: 10px; }
.rowitem { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; padding: 8px 8px; border: none; background: none; border-radius: var(--radius-md); cursor: pointer; font: inherit; font-size: 13px; color: var(--color-ink-soft); }
.rowitem:hover { background: var(--color-paper-2); }
.rowitem--muted { color: var(--color-mute); }
.ib-ic { flex: none; color: var(--color-mute); }
.ib-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ib-main strong { color: var(--color-ink); font-weight: 600; }
.ib-main strong.ok { color: var(--color-olive-ink); }
.ib-main strong.no { color: var(--color-terra-ink); }
.ib-by { flex: none; font-size: 11px; }
</style>

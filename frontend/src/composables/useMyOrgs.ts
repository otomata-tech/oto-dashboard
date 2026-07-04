import { ref } from 'vue'
import { getMyOrgs, listGroups } from '@/api/console'
import { useMe } from '@/composables/useMe'
import type { GroupListItem, Org } from '@/types/api'

// Mes orgs + mes équipes par org — cache module partagé (même durée de vie que la
// page ; une bascule d'org recharge la page, donc repart frais). Alimente le
// WorkspaceSwitcher : préchargé au survol du menu compte (popin instantanée),
// rafraîchi en fond quand un cache existe (stale-while-revalidate).
const orgs = ref<Org[] | null>(null)
let inflight: Promise<Org[]> | null = null

async function loadOrgs(force = false): Promise<Org[]> {
  if (orgs.value && !force) return orgs.value
  if (inflight) return inflight
  inflight = (async () => {
    try {
      orgs.value = (await getMyOrgs()).orgs
      return orgs.value
    } finally {
      inflight = null
    }
  })()
  return inflight
}

// Équipes d'une org dont JE suis membre (listGroups renvoie my_role=null sinon).
const teamsByOrg = ref<Record<number, GroupListItem[]>>({})
const teamsInflight = new Map<number, Promise<GroupListItem[]>>()

async function loadMyTeams(orgId: number, force = false): Promise<GroupListItem[]> {
  if (!force && teamsByOrg.value[orgId]) return teamsByOrg.value[orgId]
  const cur = teamsInflight.get(orgId)
  if (cur) return cur
  const p = (async () => {
    try {
      const groups = (await listGroups(orgId)).groups.filter((g) => g.my_role != null)
      teamsByOrg.value = { ...teamsByOrg.value, [orgId]: groups }
      return groups
    } finally {
      teamsInflight.delete(orgId)
    }
  })()
  teamsInflight.set(orgId, p)
  return p
}

// Préchargement opportuniste (survol/focus du trigger) : les erreurs sont avalées
// ICI SEULEMENT — l'ouverture réelle recharge et remonte l'erreur en toast.
function prefetch(): void {
  const { me } = useMe()
  loadOrgs().catch(() => {})
  const orgId = me.value?.active_org
  if (orgId != null) loadMyTeams(orgId).catch(() => {})
}

export function useMyOrgs() {
  return { orgs, loadOrgs, loadMyTeams, prefetch }
}

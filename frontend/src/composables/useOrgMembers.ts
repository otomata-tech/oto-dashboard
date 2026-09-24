// Les membres de l'org active, pour mettre un NOM sur un identifiant de compte
// (`lib/accountLabel.ts` : nom, à défaut adresse, à défaut l'identifiant). Chargés une fois
// par org et partagés entre les écrans qui en ont besoin, au lieu d'un `getOrg` par écran.
// Un échec de lecture laisse la liste vide : l'identifiant reste affiché, jamais un nom deviné.
import { ref, watch, type Ref } from 'vue'
import { getOrg } from '@/api/console'
import type { OrgMember } from '@/types/api'
import { useMe } from './useMe'

const byOrg = new Map<number, Ref<OrgMember[]>>()

export function useOrgMembers(): Ref<OrgMember[]> {
  const { me } = useMe()
  const current = ref<OrgMember[]>([])
  watch(() => me.value?.active_org ?? null, async (org) => {
    if (org == null) { current.value = []; return }
    let cached = byOrg.get(org)
    if (!cached) {
      cached = ref<OrgMember[]>([])
      byOrg.set(org, cached)
      getOrg(org).then((o) => { cached!.value = o.members ?? [] }).catch(() => { byOrg.delete(org) })
    }
    const c = cached
    current.value = c.value
    watch(c, (v) => { if (me.value?.active_org === org) current.value = v })
  }, { immediate: true })
  return current
}

<script setup lang="ts">
// Partage d'une ressource possédée (oto_resource, ADR 0030) — dialog UNIQUE pour
// projet / tableau datastore / procédure. Le destinataire est un PRINCIPAL :
// membre de l'org active (picker), équipe (groupe de l'org active), org entière
// (une de mes orgs ou un id de livraison client), ou email libre. Autonome : charge
// les grants (getResource), partage (shareResource), révoque (unshareResource) et
// émet `changed` pour que le parent rafraîchisse sa propre vue.
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import Tag from './Tag.vue'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import {
  getMyOrgs, getOrg, getResource, listGroups, shareResource, unshareResource,
} from '@/api/console'
import type { GroupListItem, NamespaceShare, Org, OrgMember, SharePrincipal } from '@/types/api'
import { humanize } from '@/lib/errors'

const props = withDefaults(defineProps<{
  open: boolean
  resourceType: 'project' | 'datastore_namespace' | 'doctrine'
  resourceId: string
  resourceLabel?: string
  permissions?: ('read' | 'write')[]
}>(), { permissions: () => ['write', 'read'] })
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

const { toast } = useToast()
const { me } = useMe()

type Mode = 'member' | 'team' | 'org' | 'orgid' | 'email'
const mode = ref<Mode>('member')
const permission = ref<'read' | 'write'>(props.permissions[0] ?? 'write')
const memberSub = ref('')
const groupId = ref('')
const orgId = ref('')
const orgIdFree = ref('')
const email = ref('')

const grants = ref<NamespaceShare[]>([])
const members = ref<OrgMember[]>([])
const groups = ref<GroupListItem[]>([])
const myOrgs = ref<Org[]>([])
const loading = ref(false)
const busy = ref(false)

async function refreshGrants() {
  try { grants.value = (await getResource(props.resourceType, props.resourceId)).grants }
  catch (e) { toast(humanize(e)) }
}

async function loadPickers() {
  const org = me.value?.active_org
  const [m, g, o] = await Promise.all([
    org != null ? getOrg(org).then((d) => d.members ?? []).catch(() => []) : Promise.resolve([]),
    org != null ? listGroups(org).then((d) => d.groups).catch(() => []) : Promise.resolve([]),
    getMyOrgs().then((d) => d.orgs).catch(() => []),
  ])
  members.value = m.filter((x) => x.sub !== me.value?.sub && !!x.email)
  groups.value = g
  myOrgs.value = o.filter((x) => x.id !== org)
}

watch(() => props.open, async (o) => {
  if (!o) return
  mode.value = 'member'
  permission.value = props.permissions[0] ?? 'write'
  memberSub.value = ''; groupId.value = ''; orgId.value = ''; orgIdFree.value = ''; email.value = ''
  loading.value = true
  try { await Promise.all([refreshGrants(), loadPickers()]) }
  finally { loading.value = false }
})

// Principal choisi selon le mode — null si la sélection est incomplète/invalide.
const principal = computed<SharePrincipal | null>(() => {
  if (mode.value === 'member') {
    const m = members.value.find((x) => x.sub === memberSub.value)
    return m?.email ? { email: m.email } : null
  }
  if (mode.value === 'team') return groupId.value ? { group_id: Number(groupId.value) } : null
  if (mode.value === 'org') return orgId.value ? { org_id: Number(orgId.value) } : null
  if (mode.value === 'orgid') {
    const n = Number(orgIdFree.value.trim())
    return Number.isInteger(n) && n > 0 ? { org_id: n } : null
  }
  const e = email.value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { email: e } : null
})

async function add() {
  if (!principal.value || busy.value) return
  busy.value = true
  try {
    await shareResource(props.resourceType, props.resourceId, principal.value, permission.value)
    toast('partagé')
    memberSub.value = ''; groupId.value = ''; orgId.value = ''; orgIdFree.value = ''; email.value = ''
    await refreshGrants()
    emit('changed')
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

// Un grant se révoque par son principal reconstruit (user → email ; org/groupe → id).
function principalOf(g: NamespaceShare): SharePrincipal | null {
  if (g.principal_type === 'group') return { group_id: Number(g.principal_id) }
  if (g.principal_type === 'org') return { org_id: Number(g.principal_id) }
  return g.email ? { email: g.email } : null
}
async function revoke(g: NamespaceShare) {
  const p = principalOf(g)
  if (!p) return
  try {
    await unshareResource(props.resourceType, props.resourceId, p)
    toast('accès retiré')
    await refreshGrants()
    emit('changed')
  } catch (e) { toast(humanize(e)) }
}

const who = (g: NamespaceShare) => g.label || g.email || g.principal_id || '—'
const kindLabel = (g: NamespaceShare) =>
  g.principal_type === 'group' ? 'équipe' : g.principal_type === 'org' ? 'org' : 'membre'
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="open" class="modal-overlay" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="partager">
        <header class="sp-head">
          <div class="sp-head-txt">
            <h3 class="modal-title">partager</h3>
            <p v-if="resourceLabel" class="modal-desc">{{ resourceLabel }}</p>
          </div>
          <button class="sp-close" aria-label="fermer" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <div class="sp-body">
          <div class="sp-add">
            <select v-model="mode" class="inp" aria-label="type de destinataire">
              <option value="member">membre de l'org</option>
              <option value="team">équipe</option>
              <option value="org">une de mes orgs</option>
              <option value="orgid">org cliente (id)</option>
              <option value="email">email libre</option>
            </select>

            <select v-if="mode === 'member'" v-model="memberSub" class="inp sp-grow">
              <option value="" disabled>choisir un membre…</option>
              <option v-for="m in members" :key="m.sub" :value="m.sub">{{ m.name || m.email }}</option>
            </select>
            <select v-else-if="mode === 'team'" v-model="groupId" class="inp sp-grow">
              <option value="" disabled>choisir une équipe…</option>
              <option v-for="g in groups" :key="g.group_id" :value="String(g.group_id)">{{ g.name }}</option>
            </select>
            <select v-else-if="mode === 'org'" v-model="orgId" class="inp sp-grow">
              <option value="" disabled>choisir une org…</option>
              <option v-for="o in myOrgs" :key="o.id" :value="String(o.id)">{{ o.name }}</option>
            </select>
            <input v-else-if="mode === 'orgid'" v-model="orgIdFree" class="inp sp-grow"
              inputmode="numeric" placeholder="id de l'org destinataire" @keyup.enter="add" />
            <input v-else v-model="email" class="inp sp-grow" type="email"
              placeholder="collègue@exemple.com" @keyup.enter="add" />

            <select v-if="permissions.length > 1" v-model="permission" class="inp" aria-label="droit">
              <option value="write">édition</option>
              <option value="read">lecture</option>
            </select>
            <Btn kind="mini" icon="plus" :disabled="busy || !principal" @click="add">partager</Btn>
          </div>
          <p v-if="mode === 'team' && !groups.length && !loading" class="dim sp-hint">
            aucune équipe dans ton org active — crée un département dans « groups ».
          </p>
          <p v-if="mode === 'orgid'" class="dim sp-hint">
            livraison client : donne l'accès à une org dont tu n'es pas membre, par son id.
          </p>

          <div class="sp-list">
            <div v-if="loading" class="dim" style="padding: 8px 0">chargement…</div>
            <div v-for="g in grants" :key="(g.principal_type || 'user') + (g.principal_id || g.email || '')" class="sp-item">
              <span class="sp-who">{{ who(g) }}</span>
              <Tag :tone="g.principal_type === 'group' ? 'saffron' : g.principal_type === 'org' ? 'terra' : 'ink'">
                {{ kindLabel(g) }}
              </Tag>
              <Tag :tone="g.permission === 'write' ? 'olive' : 'cobalt'">
                {{ g.permission === 'write' ? 'édition' : 'lecture' }}
              </Tag>
              <Btn v-if="principalOf(g)" kind="danger" icon="trash" @click="revoke(g)" />
            </div>
            <div v-if="!loading && !grants.length" class="dim" style="padding: 8px 0">
              pas encore partagé — choisis un membre, une équipe ou une org.
            </div>
          </div>
        </div>

        <footer class="sp-foot">
          <span style="flex: 1" />
          <Btn kind="ghost" @click="emit('close')">fermer</Btn>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: color-mix(in srgb, var(--color-ink) 30%, transparent); backdrop-filter: blur(2px);
}
.modal {
  width: 100%; max-width: 560px; background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.sp-head { display: flex; align-items: flex-start; gap: 11px; padding: 16px 18px 8px; }
.sp-head-txt { flex: 1; min-width: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: var(--color-ink); margin: 0; }
.modal-desc { font-size: 11.5px; color: var(--color-mute); margin: 3px 0 0; word-break: break-all; }
.sp-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.sp-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.sp-body { padding: 4px 18px 8px; }
.sp-add { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.sp-grow { flex: 1; min-width: 150px; }
/* rangée flex : les .inp reprennent une largeur naturelle (layout local, pas de skin) */
.sp-add .inp { width: auto; max-width: 100%; }
.sp-hint { font-size: 11.5px; margin: 0 0 8px; }
.sp-list { margin-top: 6px; }
.sp-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--color-hair-soft); }
.sp-who { flex: 1; min-width: 0; font-size: 13px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; }
.sp-foot {
  display: flex; align-items: center; gap: 8px; padding: 10px 18px 16px;
  border-top: 1px solid var(--color-hair-soft);
}
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity .15s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>

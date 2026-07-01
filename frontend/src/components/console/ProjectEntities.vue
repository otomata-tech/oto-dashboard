<script setup lang="ts">
// Entités liées d'un projet (ADR 0032 §4) : tableau / procédure / connecteur / base,
// rendues en grille de cartes typées. Picker des VRAIES entités (sélecteurs réels) +
// surcharge de connecteur préparée par projet (identité + instructions). Enfant de
// ProjectDetailView ; toute mutation passe par linkProject/unlinkProject et remonte la
// liste fraîche au parent (`update:links`) + signale l'activité (`changed`).
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Tag from '@/components/console/Tag.vue'
import Icon from '@/components/console/Icon.vue'
import {
  linkProject, unlinkProject,
  getNamespaces, getConnectors, getDoctrine, getMementoWorkspaces, getConnectorIdentities,
} from '@/api/console'
import type { ProjectLink, ProjectLinkType, ConnectorIdentity } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'

const props = defineProps<{ projectId: number; links: ProjectLink[]; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:links': [ProjectLink[]]; changed: [] }>()
const { toast } = useToast()
const { confirmAction } = usePrompt()

const LINK_GROUPS: { type: ProjectLinkType; label: string; icon: string }[] = [
  { type: 'tableau', label: 'Tableaux', icon: 'db' },
  { type: 'procedure', label: 'Procédures', icon: 'doc' },
  { type: 'connecteur', label: 'Connecteurs', icon: 'plug' },
  { type: 'base', label: 'Bases de connaissances', icon: 'book' },
]
const TYPE_ICON: Record<string, string> = Object.fromEntries(LINK_GROUPS.map((g) => [g.type, g.icon]))

// Deep-link vers l'entité liée dans le dashboard (navigable). `target_ref` = id de
// namespace (tableau) / slug de doctrine (procédure) / nom de connecteur / slug de
// base. Connecteur & base n'ont pas de deep-link fin → on renvoie vers leur section.
function entityHref(l: ProjectLink): string | null {
  const ref = encodeURIComponent(l.target_ref)
  switch (l.target_type) {
    case 'tableau': return `/data/${ref}`
    case 'procedure': return `/doctrine/${ref}`
    case 'connecteur': return '/connectors?tab=mine'
    case 'base': return '/documents'
    default: return null
  }
}
const linksByType = computed(() => {
  const out: Record<string, ProjectLink[]> = {}
  for (const l of props.links) (out[l.target_type] ??= []).push(l)
  return out
})

// ── liens : formulaire « Lier une entité » à vrais sélecteurs (type → entité) ──
type LinkOption = { value: string; label: string }
async function entitiesFor(type: ProjectLinkType): Promise<LinkOption[]> {
  if (type === 'tableau') return (await getNamespaces()).namespaces.map((n) => ({ value: String(n.id), label: n.namespace }))
  if (type === 'connecteur') return (await getConnectors()).connectors.map((c) => ({ value: c.name, label: c.label || c.name }))
  if (type === 'procedure') return ((await getDoctrine()).instructions ?? []).map((i) => ({ value: String(i.id), label: i.title }))
  const w = await getMementoWorkspaces()
  const seen = new Set<string>()
  return [...w.orgs.flatMap((o) => o.workspaces), ...w.shared, ...w.pinned]
    .filter((x) => !seen.has(x.slug) && seen.add(x.slug))
    .map((x) => ({ value: x.slug, label: x.name }))
}

const linking = ref(false)
const linkType = ref<ProjectLinkType | ''>('')
const linkRef = ref('')
const linkLabel = ref('')
const linkRole = ref('')
const linkLabelEdited = ref(false)
const linkOpts = ref<LinkOption[]>([])
const linkLoading = ref(false)

function startLinking() {
  linking.value = true
  linkType.value = ''; linkRef.value = ''; linkLabel.value = ''; linkRole.value = ''
  linkLabelEdited.value = false; linkOpts.value = []
}
function cancelLinking() { linking.value = false }

async function onTypeChange() {
  linkRef.value = ''; linkLabel.value = ''; linkLabelEdited.value = false; linkOpts.value = []
  const t = linkType.value
  if (!t) return
  linkLoading.value = true
  try { linkOpts.value = await entitiesFor(t) }
  catch (e) { toast(humanize(e)) }
  finally { linkLoading.value = false }
}
function onRefChange() {
  if (!linkLabelEdited.value) linkLabel.value = linkOpts.value.find((o) => o.value === linkRef.value)?.label ?? ''
}
async function submitLink() {
  const t = linkType.value
  if (!t || !linkRef.value) return
  const label = linkLabel.value.trim() || linkOpts.value.find((o) => o.value === linkRef.value)?.label
  const role = linkRole.value.trim() || undefined
  try {
    const { links } = await linkProject(props.projectId, t, linkRef.value, label, role)
    emit('update:links', links); emit('changed')
    linking.value = false
  } catch (e) { toast(humanize(e)) }
}

// ── surcharge connecteur préfaite par projet (ADR 0032 §4, B2) ──
const cfgRef = ref<string | null>(null)       // target_ref du connecteur en cours d'édition
const cfgIdentity = ref('')
const cfgInstructions = ref('')
const cfgIdentities = ref<ConnectorIdentity[]>([])
const cfgIdentitiesSupported = ref(false)
const cfgLoading = ref(false)
const cfgSaving = ref(false)
// connecteur dont on édite la surcharge (formulaire rendu pleine largeur sous la grille)
const cfgLink = computed(() => props.links.find((l) => l.target_type === 'connecteur' && l.target_ref === cfgRef.value) ?? null)

async function openConfig(l: ProjectLink) {
  cfgRef.value = l.target_ref
  cfgIdentity.value = l.config?.identity_id ?? ''
  cfgInstructions.value = l.config?.instructions_md ?? ''
  cfgIdentities.value = []; cfgIdentitiesSupported.value = false
  cfgLoading.value = true
  try {
    const r = await getConnectorIdentities(l.target_ref)
    cfgIdentitiesSupported.value = r.supported
    cfgIdentities.value = r.identities
  } catch { /* identité non gérée par ce connecteur — on garde juste les instructions */ }
  finally { cfgLoading.value = false }
}
function closeConfig() { cfgRef.value = null }

async function saveConfig(l: ProjectLink) {
  const config = {
    identity_id: cfgIdentity.value || undefined,
    instructions_md: cfgInstructions.value.trim() || undefined,
  }
  cfgSaving.value = true
  try {
    const { links } = await linkProject(props.projectId, 'connecteur', l.target_ref, l.label ?? undefined, l.role ?? undefined, config)
    emit('update:links', links); emit('changed')
    cfgRef.value = null; toast('surcharge enregistrée')
  } catch (e) { toast(humanize(e)) }
  finally { cfgSaving.value = false }
}

async function removeLink(l: ProjectLink) {
  if (!await confirmAction({ title: 'Délier', danger: true, confirmLabel: 'Délier',
    message: `Délier ${l.label || l.target_ref} ?` })) return
  try {
    const { links } = await unlinkProject(props.projectId, l.target_type, l.target_ref)
    emit('update:links', links); emit('changed')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <section class="surface-card">
    <div class="card-eb-row">
      <span class="card-eb">entités liées · {{ links.length }}</span>
      <button v-if="!readOnly && !linking" class="btn-soft btn-soft--xs" @click="startLinking">+ lier</button>
    </div>

    <div v-if="linking" class="pj-linkform">
      <label class="pj-fld">
        <span class="pj-fld__lbl">Type</span>
        <select v-model="linkType" class="pj-input" @change="onTypeChange">
          <option value="" disabled>choisir…</option>
          <option v-for="g in LINK_GROUPS" :key="g.type" :value="g.type">{{ g.label }}</option>
        </select>
      </label>
      <label class="pj-fld">
        <span class="pj-fld__lbl">Entité</span>
        <select v-model="linkRef" class="pj-input" :disabled="!linkType || linkLoading" @change="onRefChange">
          <option value="" disabled>{{ linkLoading ? 'chargement…' : !linkType ? 'choisis un type' : linkOpts.length ? 'choisir…' : 'aucune entité de ce type' }}</option>
          <option v-for="o in linkOpts" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <label class="pj-fld">
        <span class="pj-fld__lbl">Nom affiché <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">(optionnel)</span></span>
        <input v-model="linkLabel" class="pj-input" placeholder="(optionnel — par défaut le nom de l'entité)" @input="linkLabelEdited = true" />
      </label>
      <label class="pj-fld">
        <span class="pj-fld__lbl">Rôle <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">(optionnel)</span></span>
        <input v-model="linkRole" class="pj-input" placeholder="pourquoi cette entité est ici / ce qu'elle apporte au projet" />
      </label>
      <div class="pj-linkform__act">
        <button class="ent__lnk" @click="cancelLinking">annuler</button>
        <button class="btn-soft" :disabled="!linkRef" @click="submitLink">lier</button>
      </div>
    </div>

    <template v-for="g in LINK_GROUPS" :key="g.type">
      <template v-if="linksByType[g.type]?.length">
        <div class="ent-grouphd"><Icon :name="g.icon" :size="13" /><span>{{ g.label }}</span></div>
        <div class="ent-grid">
          <div v-for="l in linksByType[g.type]" :key="l.target_ref" class="ent">
            <span class="ent__ico"><Icon :name="TYPE_ICON[l.target_type] || 'doc'" :size="15" /></span>
            <div class="ent__body">
              <div class="ent__top">
                <component :is="entityHref(l) ? RouterLink : 'span'" :to="entityHref(l) || undefined"
                  class="ent__name" :class="{ 'ent__name--link': entityHref(l) }">
                  {{ l.label || l.target_ref }}
                  <Icon v-if="entityHref(l)" name="ext" :size="11" class="ent__go" />
                </component>
                <Tag v-if="l.cross_project" tone="saffron" title="Cette entité est aussi liée par un autre projet — éviter les modifications brutales">partagé</Tag>
                <Tag v-if="g.type === 'connecteur' && (l.config?.identity_id || l.config?.instructions_md)" tone="olive" title="Connecteur reconfiguré pour ce projet">surchargé</Tag>
              </div>
              <div v-if="l.role" class="ent__role">{{ l.role }}</div>
              <div v-if="g.type === 'connecteur' && l.config?.instructions_md" class="ent__cfg">↳ {{ l.config.instructions_md }}</div>
              <div v-if="!readOnly" class="ent__act">
                <button v-if="g.type === 'connecteur'" class="ent__lnk" @click="cfgRef === l.target_ref ? closeConfig() : openConfig(l)">{{ cfgRef === l.target_ref ? 'fermer' : 'configurer' }}</button>
                <button class="ent__lnk" @click="removeLink(l)">délier</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- surcharge connecteur : formulaire pleine largeur sous la grille -->
    <div v-if="cfgLink" class="pj-cfgform">
      <p class="dim" style="font-size: 11px; margin: 0 0 2px">Surcharge de <b>{{ cfgLink.label || cfgLink.target_ref }}</b> <b>pour ce projet</b> — préparée ici, appliquée par l'agent au chargement du projet.</p>
      <label v-if="cfgIdentitiesSupported && cfgIdentities.length" class="pj-fld">
        <span class="pj-fld__lbl">Identité (compte)</span>
        <select v-model="cfgIdentity" class="pj-input">
          <option value="">(défaut du compte)</option>
          <option v-for="idn in cfgIdentities" :key="idn.id" :value="idn.id">{{ idn.label || idn.id }}{{ idn.channel ? ` · ${idn.channel}` : '' }}</option>
        </select>
      </label>
      <p v-else-if="cfgLoading" class="dim" style="font-size: 11px">chargement des identités…</p>
      <label class="pj-fld">
        <span class="pj-fld__lbl">Instructions de surcharge <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">(prose, optionnel)</span></span>
        <textarea v-model="cfgInstructions" class="pj-input" rows="3" placeholder="ex. ne filtrer les accords que par thème mutuelle"></textarea>
      </label>
      <div class="pj-linkform__act">
        <button class="ent__lnk" @click="closeConfig">annuler</button>
        <button class="btn-soft" :disabled="cfgSaving" @click="saveConfig(cfgLink)">enregistrer</button>
      </div>
    </div>

    <p v-if="!links.length && !linking" class="dim" style="font-size: 12px">aucune entité liée — utilise « + lier ».</p>
  </section>
</template>

<style scoped>
.surface-card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 12px; padding: 18px; }
.card-eb { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
.card-eb-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
.btn-soft { display: inline-flex; align-items: center; background: var(--color-surface); color: var(--color-ink-soft); border: 1px solid var(--color-hair); border-radius: 7px; padding: 5px 11px; font-family: var(--font-sans); font-size: 11.5px; font-weight: 600; text-transform: lowercase; cursor: pointer; transition: background 180ms; }
.btn-soft:hover { background: var(--color-paper-2); }
.btn-soft:disabled { opacity: .5; cursor: not-allowed; }
.btn-soft--xs { padding: 4px 9px; font-size: 11px; }

.ent-grouphd { display: flex; align-items: center; gap: 6px; margin: 13px 0 7px; font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--color-faint); }
.ent-grouphd svg { color: var(--color-faint); }
.ent-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(228px, 1fr)); gap: 9px; }
.ent { display: flex; gap: 10px; align-items: flex-start; background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 10px; padding: 11px 12px; transition: transform 180ms var(--ease-out), box-shadow 180ms; }
.ent:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -12px rgba(44, 33, 18, .35); }
.ent__ico { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: var(--color-paper-2); border: 1px solid var(--color-hair); color: var(--color-ink-soft); }
.ent__body { flex: 1; min-width: 0; }
.ent__top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ent__name { display: inline-flex; align-items: center; gap: 4px; color: var(--color-ink); font-weight: 600; font-size: 12.5px; text-decoration: none; }
.ent__name--link { color: var(--color-cobalt); cursor: pointer; }
.ent__name--link:hover { text-decoration: underline; }
.ent__go { opacity: .55; flex: none; }
.ent__name--link:hover .ent__go { opacity: 1; }
.ent__role { font-size: 11px; color: var(--color-mute); font-style: italic; margin-top: 3px; line-height: 1.4; }
.ent__cfg { font-size: 10.5px; color: var(--color-olive-ink); margin-top: 4px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.ent__act { display: flex; gap: 11px; margin-top: 6px; }
.ent__lnk { background: none; border: 0; padding: 0; font-family: var(--font-sans); font-size: 11px; color: var(--color-mute); cursor: pointer; }
.ent__lnk:hover { color: var(--color-ink); text-decoration: underline; }

.pj-linkform { display: flex; flex-direction: column; gap: 9px; padding: 12px 13px; margin-bottom: 10px; border: 1px solid var(--color-hair); border-radius: 10px; background: var(--color-paper-2); }
.pj-cfgform { display: flex; flex-direction: column; gap: 9px; padding: 11px 12px 12px; margin-top: 11px; border: 1px solid var(--color-hair); border-radius: 10px; background: var(--color-paper-2); }
.pj-fld { display: flex; flex-direction: column; gap: 4px; }
.pj-fld__lbl { font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--color-mute); }
.pj-input { width: 100%; border: 1px solid var(--color-hair); border-radius: 8px; padding: 7px 10px; font-family: var(--font-sans); font-size: 13px; background: var(--color-surface); color: var(--color-ink); box-sizing: border-box; }
.pj-input:disabled { opacity: .55; cursor: not-allowed; }
.pj-linkform__act { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 2px; }
</style>

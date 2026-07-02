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
  { type: 'page', label: 'Pages memento', icon: 'doc' },
]
const TYPE_ICON: Record<string, string> = Object.fromEntries(LINK_GROUPS.map((g) => [g.type, g.icon]))

// Nom affiché d'un lien : `label` (posé au lien) sinon le nom RÉSOLU par le backend
// (procédure : `title` de la doctrine ; tableau : `namespace`) — `target_ref` est un
// id stable (ADR 0032), l'afficher nu est le bug « la procédure s'appelle 25 ».
function linkName(l: ProjectLink): string {
  return l.label || l.title || l.namespace || l.target_ref
}

// Deep-link vers l'entité liée dans le dashboard (navigable). `target_ref` = id de
// namespace (tableau) / id stable de procédure (ADR 0032) / nom de connecteur /
// slug de base. Connecteur → fiche détail marketplace (?connector=,
// ConnectorDetail.vue) ; base n'a pas de deep-link fin → on renvoie vers sa section.
function entityHref(l: ProjectLink): string | null {
  const ref = encodeURIComponent(l.target_ref)
  switch (l.target_type) {
    case 'tableau': return `/data/${ref}`
    case 'procedure': return `/procedures/${ref}`
    case 'connecteur': return `/connectors?tab=marketplace&connector=${ref}`
    case 'base': return '/documents'
    case 'page': return l.target_ref   // URL memento complète (lien externe, cf. hrefInfo)
    default: return null
  }
}
// Résout l'élément + attributs du lien : `<a>` externe pour une URL http(s) (page
// memento), `RouterLink` interne sinon, `span` si non navigable. Une seule source.
function hrefInfo(l: ProjectLink): { el: unknown; to?: string; href?: string } {
  const h = entityHref(l)
  if (!h) return { el: 'span' }
  if (/^https?:\/\//i.test(h)) return { el: 'a', href: h }
  return { el: RouterLink, to: h }
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
  if (type === 'page') return []   // page memento = saisie d'URL (pas de picker), cf. template
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
// Multi-binding (#57) : pour un CONNECTEUR, on choisit aussi l'IDENTITÉ (compte) — c'est
// la clé du binding. Lier le même connecteur avec une autre identité = 2e binding.
const linkIdentity = ref('')
const linkIdentities = ref<ConnectorIdentity[]>([])
const linkIdentityLoading = ref(false)

function startLinking() {
  linking.value = true
  linkType.value = ''; linkRef.value = ''; linkLabel.value = ''; linkRole.value = ''
  linkLabelEdited.value = false; linkOpts.value = []
  linkIdentity.value = ''; linkIdentities.value = []
}
function cancelLinking() { linking.value = false }

async function onTypeChange() {
  linkRef.value = ''; linkLabel.value = ''; linkLabelEdited.value = false; linkOpts.value = []
  linkIdentity.value = ''; linkIdentities.value = []
  const t = linkType.value
  if (!t) return
  linkLoading.value = true
  try { linkOpts.value = await entitiesFor(t) }
  catch (e) { toast(humanize(e)) }
  finally { linkLoading.value = false }
}
async function onRefChange() {
  if (!linkLabelEdited.value) linkLabel.value = linkOpts.value.find((o) => o.value === linkRef.value)?.label ?? ''
  linkIdentity.value = ''; linkIdentities.value = []
  if (linkType.value === 'connecteur' && linkRef.value) {
    linkIdentityLoading.value = true
    try { const r = await getConnectorIdentities(linkRef.value); linkIdentities.value = r.supported ? r.identities : [] }
    catch { linkIdentities.value = [] }
    finally { linkIdentityLoading.value = false }
  }
}
async function submitLink() {
  const t = linkType.value
  if (!t || !linkRef.value) return
  let label = linkLabel.value.trim() || linkOpts.value.find((o) => o.value === linkRef.value)?.label
  const role = linkRole.value.trim() || undefined
  const identity_ref = t === 'connecteur' ? (linkIdentity.value || undefined) : undefined
  // Défaut de libellé : « connecteur · compte » quand une identité est choisie (lisible).
  if (t === 'connecteur' && identity_ref && !linkLabelEdited.value) {
    const idn = linkIdentities.value.find((i) => i.id === identity_ref)
    if (idn) label = `${label} · ${idn.label || idn.id}`
  }
  try {
    const { links } = await linkProject(props.projectId, t, linkRef.value, label, role, undefined, identity_ref)
    emit('update:links', links); emit('changed')
    linking.value = false
  } catch (e) { toast(humanize(e)) }
}

// ── surcharge d'un BINDING connecteur (#57) : l'identité est la CLÉ (choisie au lien) ;
// ici on n'édite que les instructions. Un binding = (target_ref, identity_ref).
function bindingKey(l: ProjectLink): string { return `${l.target_ref}|${l.identity_ref ?? ''}` }
const cfgRef = ref<string | null>(null)       // bindingKey du binding en cours d'édition
const cfgInstructions = ref('')
const cfgSaving = ref(false)
const cfgLink = computed(() => props.links.find((l) => l.target_type === 'connecteur' && bindingKey(l) === cfgRef.value) ?? null)

function openConfig(l: ProjectLink) {
  cfgRef.value = bindingKey(l)
  cfgInstructions.value = l.config?.instructions_md ?? ''
}
function closeConfig() { cfgRef.value = null }

async function saveConfig(l: ProjectLink) {
  cfgSaving.value = true
  try {
    // Re-lie le MÊME binding (identity_ref inchangé) → met à jour ses instructions.
    const { links } = await linkProject(props.projectId, 'connecteur', l.target_ref,
      l.label ?? undefined, l.role ?? undefined,
      { instructions_md: cfgInstructions.value.trim() || undefined }, l.identity_ref ?? undefined)
    emit('update:links', links); emit('changed')
    cfgRef.value = null; toast('surcharge enregistrée')
  } catch (e) { toast(humanize(e)) }
  finally { cfgSaving.value = false }
}

async function removeLink(l: ProjectLink) {
  if (!await confirmAction({ title: 'Délier', danger: true, confirmLabel: 'Délier',
    message: `Délier ${linkName(l)} ?` })) return
  try {
    const { links } = await unlinkProject(props.projectId, l.target_type, l.target_ref, l.identity_ref ?? undefined)
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
      <label v-if="linkType === 'page'" class="pj-fld">
        <span class="pj-fld__lbl">URL de la page</span>
        <input v-model="linkRef" class="pj-input" type="url" inputmode="url" placeholder="https://…/page memento" />
      </label>
      <label v-else class="pj-fld">
        <span class="pj-fld__lbl">Entité</span>
        <select v-model="linkRef" class="pj-input" :disabled="!linkType || linkLoading" @change="onRefChange">
          <option value="" disabled>{{ linkLoading ? 'chargement…' : !linkType ? 'choisis un type' : linkOpts.length ? 'choisir…' : 'aucune entité de ce type' }}</option>
          <option v-for="o in linkOpts" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <label v-if="linkType === 'connecteur' && linkRef && (linkIdentities.length || linkIdentityLoading)" class="pj-fld">
        <span class="pj-fld__lbl">Identité (compte) <span class="dim" style="font-weight: 400; text-transform: none; letter-spacing: 0">— lier N fois pour N comptes</span></span>
        <select v-model="linkIdentity" class="pj-input" :disabled="linkIdentityLoading">
          <option value="">{{ linkIdentityLoading ? 'chargement…' : '(défaut du compte)' }}</option>
          <option v-for="idn in linkIdentities" :key="idn.id" :value="idn.id">{{ idn.label || idn.id }}{{ idn.channel ? ` · ${idn.channel}` : '' }}</option>
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
          <div v-for="l in linksByType[g.type]" :key="bindingKey(l)" class="ent">
            <span class="ent__ico"><Icon :name="TYPE_ICON[l.target_type] || 'doc'" :size="15" /></span>
            <div class="ent__body">
              <div class="ent__top">
                <component :is="hrefInfo(l).el" :to="hrefInfo(l).to" :href="hrefInfo(l).href"
                  :target="hrefInfo(l).href ? '_blank' : undefined"
                  :rel="hrefInfo(l).href ? 'noopener noreferrer' : undefined"
                  class="ent__name" :class="{ 'ent__name--link': !!entityHref(l) }">
                  {{ linkName(l) }}
                  <Icon v-if="entityHref(l)" name="ext" :size="11" class="ent__go" />
                </component>
                <Tag v-if="l.cross_project" tone="saffron" title="Cette entité est aussi liée par un autre projet — éviter les modifications brutales">partagé</Tag>
                <Tag v-if="g.type === 'connecteur' && l.config?.instructions_md" tone="olive" title="Instructions de surcharge pour ce projet">surchargé</Tag>
              </div>
              <div v-if="g.type === 'connecteur' && l.identity_ref" class="ent__ident" title="Compte utilisé par ce binding">compte : {{ l.identity_ref }}</div>
              <div v-if="l.role" class="ent__role">{{ l.role }}</div>
              <div v-if="g.type === 'connecteur' && l.config?.instructions_md" class="ent__cfg">↳ {{ l.config.instructions_md }}</div>
              <div v-if="!readOnly" class="ent__act">
                <button v-if="g.type === 'connecteur'" class="ent__lnk" @click="cfgRef === bindingKey(l) ? closeConfig() : openConfig(l)">{{ cfgRef === bindingKey(l) ? 'fermer' : 'configurer' }}</button>
                <button class="ent__lnk" @click="removeLink(l)">délier</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- surcharge connecteur : formulaire pleine largeur sous la grille -->
    <div v-if="cfgLink" class="pj-cfgform">
      <p class="dim" style="font-size: 11px; margin: 0 0 2px">Surcharge de <b>{{ cfgLink.label || cfgLink.target_ref }}</b><template v-if="cfgLink.identity_ref"> (compte {{ cfgLink.identity_ref }})</template> <b>pour ce projet</b> — l'identité est fixée au lien ; délie + relie pour en changer.</p>
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
.ent__ident { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); margin-top: 3px; overflow-wrap: anywhere; }
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

<script setup lang="ts">
// Carte « guides on-demand » (ADR 0042, tout-DB) — les how-to que l'agent CHARGE à la
// demande via `oto_guide`, par opposition aux readmes (injectés à chaque session). Un
// scope éditable (platform | org | user) : liste + créer / éditer / supprimer, éditeur
// inline. Les guides des AUTRES scopes visibles sont listés en référence lecture seule
// (découverte) — sauf sur la carte platform (les guides org/user de l'admin n'y ont
// pas leur place).
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import { getGuides, getGuide, setGuide, deleteGuide } from '@/api/console'
import type { Guide, GuideScope } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  scope: GuideScope
  canEdit: boolean
  title: string
  sub: string
}>()

const { toast } = useToast()
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

const guides = ref<Guide[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)
const confirming = ref<string | null>(null)     // slug en attente de confirmation de suppression
const openInherited = ref<Set<string>>(new Set()) // corps hérités dépliés (lecture seule)
const inheritedBody = ref<Record<string, string>>({})
const SCOPE_LABEL: Record<string, string> = { platform: 'plateforme', org: 'org', user: 'perso' }

// Éditeur inline : slug ciblé ('' = création), + brouillon. `creating` = slug libre.
const editing = ref<string | null>(null)
const creating = ref(false)
const draft = ref({ slug: '', title: '', description: '', body_md: '' })

const mine = computed(() => guides.value.filter((g) => g.scope === props.scope))
// hérités (lecture seule) = tout ce qui n'est pas du scope éditable de la carte :
// carte USER → plateforme + org ; carte ORG → plateforme ; carte PLATFORM → rien
// (les guides org/user de l'admin connecté ne concernent pas l'écran plateforme).
const inherited = computed(() =>
  props.scope === 'platform' ? [] : guides.value.filter((g) => g.scope !== props.scope))

async function load() {
  try {
    guides.value = (await getGuides()).guides
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

function startCreate() {
  creating.value = true
  editing.value = '__new__'
  draft.value = { slug: '', title: '', description: '', body_md: '' }
}

async function startEdit(g: Guide) {
  busy.value = true
  try {
    const full = await getGuide(props.scope, g.slug)
    creating.value = false
    editing.value = g.slug
    draft.value = { slug: g.slug, title: g.title || '', description: g.description || '', body_md: full.body_md || '' }
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

function cancelEdit() {
  editing.value = null
  creating.value = false
}

async function save() {
  const d = draft.value
  const slug = d.slug.trim()
  if (creating.value && !SLUG_RE.test(slug)) {
    toast('slug invalide — minuscules, chiffres, tirets (ex. cadence-outreach).'); return
  }
  if (!d.body_md.trim()) { toast('le corps du guide est vide.'); return }
  busy.value = true
  try {
    await setGuide(props.scope, slug, d.body_md, d.title.trim(), d.description.trim())
    toast(creating.value ? 'guide créé' : 'guide mis à jour')
    cancelEdit()
    await load()
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

async function remove(g: Guide) {
  busy.value = true
  try {
    await deleteGuide(props.scope, g.slug)
    toast('guide supprimé')
    confirming.value = null
    await load()
  } catch (e) { toast(humanize(e)) }
  finally { busy.value = false }
}

function inheritedKey(g: Guide) { return `${g.scope}:${g.slug}` }
async function toggleInherited(g: Guide) {
  const k = inheritedKey(g)
  const s = new Set(openInherited.value)
  if (s.has(k)) { s.delete(k); openInherited.value = s; return }
  s.add(k); openInherited.value = s
  if (inheritedBody.value[k] === undefined) {
    try { inheritedBody.value = { ...inheritedBody.value, [k]: (await getGuide(g.scope, g.slug)).body_md || '' } }
    catch (e) { toast(humanize(e)) }
  }
}
</script>

<template>
  <ConsoleCard :title="title" :sub="sub">
    <template v-if="canEdit && !editing" #actions>
      <Btn kind="mini" icon="plus" @click="startCreate">Nouveau guide</Btn>
    </template>

    <p v-if="!loaded" class="dim-note">chargement…</p>
    <p v-else-if="error" class="dim-note" style="color: var(--color-terra-ink)">{{ error }}</p>

    <template v-else>
      <!-- Éditeur inline (création ou édition) -->
      <div v-if="editing" class="gd-editor">
        <input v-if="creating" v-model="draft.slug" class="gd-inp" placeholder="slug (ex. cadence-outreach)" />
        <div v-else class="gd-slugfixed"><code>{{ draft.slug }}</code></div>
        <input v-model="draft.title" class="gd-inp" placeholder="titre lisible" />
        <input v-model="draft.description" class="gd-inp" placeholder="description courte (aide l'agent à choisir)" />
        <textarea v-model="draft.body_md" rows="10" class="gd-inp gd-body"
          placeholder="markdown — le how-to que l'agent charge quand il en a besoin." />
        <div class="gd-actions">
          <Btn kind="mini" :disabled="busy" @click="cancelEdit">Annuler</Btn>
          <Btn :disabled="busy" @click="save">{{ creating ? 'Créer' : 'Enregistrer' }}</Btn>
        </div>
      </div>

      <!-- Guides du scope (éditables) -->
      <div v-if="mine.length" class="gd-list">
        <div v-for="g in mine" :key="g.slug" class="gd-row">
          <div class="gd-main">
            <div class="gd-title">{{ g.title || g.slug }} <code class="gd-slug">{{ g.slug }}</code></div>
            <div v-if="g.description" class="dim-note">{{ g.description }}</div>
          </div>
          <template v-if="canEdit">
            <template v-if="confirming === g.slug">
              <span class="dim-note">supprimer ?</span>
              <Btn kind="mini" :disabled="busy" @click="remove(g)">Oui</Btn>
              <Btn kind="mini" :disabled="busy" @click="confirming = null">Non</Btn>
            </template>
            <template v-else>
              <Btn kind="mini" :disabled="busy" @click="startEdit(g)">Éditer</Btn>
              <Btn kind="mini" :disabled="busy" @click="confirming = g.slug">Supprimer</Btn>
            </template>
          </template>
        </div>
      </div>
      <p v-else-if="!editing" class="dim-note">
        aucun guide {{ scope === 'platform' ? 'plateforme' : scope === 'org' ? "d'org" : 'perso' }} —
        un how-to que l'agent charge à la demande
        (waterfall d'enrichissement, cadence d'outreach, diagnostic d'un connecteur…).
        {{ canEdit ? '' : "seul un admin d'org peut en créer." }}
      </p>

      <!-- Guides hérités (plateforme + org pour la carte user), référence lecture seule.
           L'agent les charge aussi à la demande — tu ne les édites pas ici. -->
      <div v-if="inherited.length" class="gd-platform">
        <div class="gd-plat-head">hérités · lecture seule · chargés aussi par ton agent</div>
        <div v-for="g in inherited" :key="inheritedKey(g)" class="gd-plat-row">
          <div class="gd-plat-line" @click="toggleInherited(g)">
            <Icon name="chevd" :size="12" class="gd-chev" :class="{ open: openInherited.has(inheritedKey(g)) }" />
            <span class="gd-title">{{ g.title || g.slug }}</span>
            <code class="gd-slug">{{ g.slug }}</code>
            <span class="gd-plat-scope">{{ SCOPE_LABEL[g.scope] || g.scope }}</span>
            <span v-if="g.description" class="dim-note gd-plat-desc">{{ g.description }}</span>
          </div>
          <pre v-if="openInherited.has(inheritedKey(g))" class="gd-plat-body">{{ inheritedBody[inheritedKey(g)] ?? '…' }}</pre>
        </div>
      </div>
    </template>
  </ConsoleCard>
</template>

<style scoped>
.dim-note { font-size: 12px; color: var(--color-mute); }
.gd-list { display: flex; flex-direction: column; }
.gd-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 0;
  border-top: 1px solid var(--color-hair-soft);
}
.gd-row:first-child { border-top: 0; }
.gd-main { flex: 1; min-width: 0; }
.gd-title { font-size: 13.5px; font-weight: 600; color: var(--color-ink); }
.gd-slug { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-saffron-ink); font-weight: 400; margin-left: 6px; }

.gd-editor { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.gd-inp {
  width: 100%; box-sizing: border-box; font-family: var(--font-sans); font-size: 13px;
  color: var(--color-ink); background: var(--color-bg);
  border: 1px solid var(--color-hair); border-radius: 8px; padding: 8px 10px; outline: none;
}
.gd-inp:focus-visible { outline: 2px solid var(--color-saffron); outline-offset: 1px; }
.gd-body { font-family: var(--font-mono); font-size: 12.5px; line-height: 1.55; resize: vertical; }
.gd-slugfixed code { font-family: var(--font-mono); font-size: 12.5px; color: var(--color-saffron-ink); }
.gd-actions { display: flex; gap: 10px; justify-content: flex-end; }

.gd-platform { margin-top: 14px; border-top: 1px solid var(--color-hair-soft); padding-top: 10px; }
.gd-plat-head {
  font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--color-mute); margin-bottom: 6px;
}
.gd-plat-scope {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--color-cobalt-ink, #35507a);
  background: var(--color-cobalt-soft, #e6ecf5); border-radius: var(--radius-pill, 999px);
  padding: 1px 7px; flex: none;
}
.gd-plat-line { display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer; }
.gd-plat-desc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gd-chev { color: var(--color-faint); transition: transform 0.15s; }
.gd-chev.open { transform: rotate(180deg); }
.gd-plat-body {
  white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.5;
  max-height: 300px; overflow: auto; margin: 4px 0 8px 20px;
  background: var(--color-paper-3, #f5f1e8); border: 1px solid var(--color-hair-soft, #e3dccd);
  border-radius: 8px; padding: 10px 12px; color: var(--color-ink-soft, #4a463d);
}
</style>

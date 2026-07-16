<script setup lang="ts">
// Projets — couche d'organisation (ADR 0030). INDEX (grille de projets). Refonte UX :
// barre d'en-tête (titre + compteur + Nouveau projet) au lieu d'une ConsoleCard ; cartes
// ORIENTÉES ÉTAT (pastilles modèle / mcp live / owner) + bascule cartes ↔ tableau dense
// persistée. Le détail vit sur sa page `/projects/:id`. Consomme oto_project.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/console/Icon.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import NameDialog from '@/components/console/NameDialog.vue'
import ProjectCreateDialog from '@/components/console/ProjectCreateDialog.vue'
import type { ProjectOwnerPayload } from '@/components/console/ProjectCreateDialog.vue'
import { listProjects, listProjectTemplates, createProject, copyProject, listGroups } from '@/api/console'
import type { Project } from '@/types/api'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { useMe, isPlatformOperator } from '@/composables/useMe'

const router = useRouter()
const { toast } = useToast()
const { me } = useMe()

const projects = ref<Project[]>([])
const templates = ref<Project[]>([])
const loaded = ref(false)
const error = ref<string | null>(null)

// Disposition persistée (cartes ↔ tableau dense).
const LAYOUT_KEY = 'oto.projects.layout'
const layout = ref<'cards' | 'rows'>(((): 'cards' | 'rows' => {
  const v = localStorage.getItem(LAYOUT_KEY)
  return v === 'rows' ? 'rows' : 'cards'
})())
function setLayout(v: 'cards' | 'rows') { layout.value = v; localStorage.setItem(LAYOUT_KEY, v) }

interface NameDialogConfig { title: string; description?: string; initial: string; submitLabel: string; onConfirm: (name: string) => Promise<void> }
const nameOpen = ref(false)
const nameConfig = ref<NameDialogConfig | null>(null)

async function load() {
  try {
    const [ps, ts] = await Promise.all([listProjects(), listProjectTemplates().catch(() => ({ projects: [] }))])
    projects.value = ps.projects
    templates.value = ts.projects
  } catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(load)

function openProject(id: number) { router.push(`/projects/${id}`) }
// ADR 0049 : le badge dit le SCOPE owner — org / équipe (pôle) / oto (bibliothèque) / perso.
function ownerLabel(p: Project): string {
  if (p.owner_type === 'org') return 'org'
  if (p.owner_type === 'group') return 'équipe'
  if (p.owner_type === 'platform') return 'oto'
  return 'perso'
}
// Pastilles ORIENTÉES ÉTAT — dérivées des seuls champs portés par la liste (pas d'appel
// backend par carte) : modèle / mcp live / partagé / lecture / à vérifier (règle `chipsFor`
// de la maquette). Tons sémantiques ; `lecture` = neutre (pas de ton).
type Chip = { tone?: 'saffron' | 'olive' | 'cobalt'; label: string }
function chipsFor(p: Project): Chip[] {
  const out: Chip[] = []
  if (p.is_template) out.push({ tone: 'saffron', label: 'modèle' })
  if (p.mcp_access && p.mcp_access !== 'off') out.push({ tone: 'olive', label: 'mcp live' })
  if (p.shared) out.push({ tone: 'cobalt', label: 'partagé' })
  if (p.can_write === false) out.push({ label: 'lecture' })
  if (p.has_audit) out.push({ tone: 'saffron', label: 'à vérifier' })
  return out
}
function briefSnippet(p: Project): string {
  const s = (p.brief_md ?? '').replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim()
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}

// Création SCOPÉE (ADR 0049) : org active (défaut) / une de mes équipes / bibliothèque
// plateforme (opérateur). Les équipes sont chargées à l'ouverture du dialog — celles où
// je suis membre, ou TOUTES celles de l'org si j'en suis admin (même règle que le backend).
const createOpen = ref(false)
const createGroups = ref<{ id: number; name: string }[]>([])
async function create() {
  createGroups.value = []
  const orgId = me.value?.active_org
  if (orgId) {
    try {
      const { groups } = await listGroups(orgId)
      const admin = me.value?.org_role === 'org_admin'
      createGroups.value = groups
        .filter((g) => admin || g.my_role != null)
        .map((g) => ({ id: g.group_id ?? g.id, name: g.name }))
    } catch { /* pas d'équipes proposées — le scope org reste disponible */ }
  }
  createOpen.value = true
}
async function doCreate(payload: ProjectOwnerPayload) {
  try {
    const p = await createProject(payload.name, '', payload.owner)
    toast('projet créé')
    openProject(p.id)
  } catch (e) { toast(humanize(e)); throw e }
}
function useTemplate(t: Project) {
  nameConfig.value = {
    title: `Utiliser « ${t.name} »`, description: "Copie ce modèle dans un nouveau projet (l'original reste intact).", initial: t.name, submitLabel: 'Copier',
    onConfirm: async (name) => { try { const p = await copyProject(t.id, name); toast('projet créé depuis le modèle'); openProject(p.id) } catch (e) { toast(humanize(e)); throw e } },
  }
  nameOpen.value = true
}
const hasProjects = computed(() => loaded.value && !error.value && projects.value.length > 0)
</script>

<template>
  <div class="content-inner fadein">
    <!-- barre d'en-tête -->
    <header class="pl-head">
      <div class="pl-head__id">
        <h1 class="pl-head__t">Projets</h1>
        <span v-if="hasProjects" class="pl-head__n">{{ projects.length }} projets</span>
      </div>
      <div v-if="hasProjects" class="pl-seg" role="group" aria-label="disposition">
        <button class="pl-seg__b" :class="{ on: layout === 'cards' }" @click="setLayout('cards')">cartes</button>
        <button class="pl-seg__b" :class="{ on: layout === 'rows' }" @click="setLayout('rows')">tableau</button>
      </div>
      <button class="pl-new" @click="create"><Icon name="plus" :size="14" /> Nouveau projet</button>
    </header>

    <!-- états -->
    <p v-if="error" class="dim" style="font-size: 13px">{{ error }}</p>
    <p v-else-if="!loaded" class="dim" style="font-size: 13px">chargement…</p>
    <div v-else-if="!projects.length" class="pl-empty">
      <p class="pl-empty__t">Aucun projet</p>
      <p class="pl-empty__s">Un projet est un conteneur de travail — un but et ses entités (tableaux, connecteurs, procédures). Partageable, reprenable dans Claude.</p>
      <button class="pl-new" @click="create"><Icon name="plus" :size="14" /> Créer un projet</button>
    </div>

    <!-- cartes -->
    <div v-else-if="layout === 'cards'" class="pl-cards">
      <button v-for="p in projects" :key="p.id" class="pl-card" @click="openProject(p.id)">
        <div class="pl-card__head">
          <span class="pl-card__name">{{ p.name }}</span>
          <span class="pl-card__owner">{{ ownerLabel(p) }}</span>
        </div>
        <div class="pl-card__chips">
          <Tag v-for="c in chipsFor(p)" :key="c.label" :tone="c.tone">{{ c.label }}</Tag>
        </div>
        <p v-if="briefSnippet(p)" class="pl-card__brief">{{ briefSnippet(p) }}</p>
        <p v-else class="pl-card__brief pl-card__brief--empty">pas encore de brief.</p>
        <div class="pl-card__foot">
          <span>maj {{ fmtDate(p.updated_at) }}</span>
          <template v-if="p.entity_count != null">
            <span class="pl-card__sep"></span><span>{{ p.entity_count }} entités</span>
          </template>
          <span class="pl-card__go"><Icon name="chevron-right" :size="15" /></span>
        </div>
      </button>
    </div>

    <!-- tableau dense -->
    <div v-else class="pl-table">
      <div class="pl-row pl-row--head">
        <span>projet</span><span>état</span><span>maj</span><span class="pl-row__num">entités</span><span></span>
      </div>
      <button v-for="p in projects" :key="p.id" class="pl-row" @click="openProject(p.id)">
        <span class="pl-row__name"><span class="pl-row__nt">{{ p.name }}</span><span class="pl-row__owner">{{ ownerLabel(p) }}</span></span>
        <span class="pl-row__chips"><Tag v-for="c in chipsFor(p)" :key="c.label" :tone="c.tone">{{ c.label }}</Tag></span>
        <span class="pl-row__maj">{{ fmtDate(p.updated_at) }}</span>
        <span class="pl-row__num">{{ p.entity_count ?? '—' }}</span>
        <span class="pl-row__go"><Icon name="chevron-right" :size="15" /></span>
      </button>
    </div>

    <!-- modèles -->
    <template v-if="hasProjects && templates.length">
      <div class="pl-tpl-hd">
        <span class="pl-tpl-hd__k">modèles</span>
        <span class="pl-tpl-hd__line"></span>
        <span class="pl-tpl-hd__s">projets publiés — copie prête à personnaliser</span>
      </div>
      <div class="pl-cards">
        <div v-for="t in templates" :key="t.id" class="pl-card pl-card--tpl">
          <div class="pl-card__head">
            <span class="pl-card__name">{{ t.name }}</span>
            <Tag tone="saffron">modèle</Tag>
          </div>
          <p v-if="briefSnippet(t)" class="pl-card__brief">{{ briefSnippet(t) }}</p>
          <p v-else class="pl-card__brief pl-card__brief--empty">pas de brief.</p>
          <div><Btn kind="mini" icon="copy" @click="useTemplate(t)">Utiliser ce modèle</Btn></div>
        </div>
      </div>
    </template>

    <NameDialog v-if="nameConfig" v-model:open="nameOpen"
      :title="nameConfig.title" :description="nameConfig.description"
      :initial="nameConfig.initial" :submit-label="nameConfig.submitLabel"
      :on-confirm="nameConfig.onConfirm" placeholder="Prospection Marseille" />

    <!-- Création scopée (ADR 0049) : org / équipe / bibliothèque plateforme. -->
    <ProjectCreateDialog v-model:open="createOpen" :org-name="me?.active_org_name"
      :groups="createGroups" :can-platform="isPlatformOperator(me)" :on-confirm="doCreate" />
  </div>
</template>

<style scoped>
/* barre d'en-tête */
.pl-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pl-head__id { flex: 1 1 auto; display: flex; align-items: center; gap: 10px; }
.pl-head__t { font-size: 20px; font-weight: 700; letter-spacing: -.02em; margin: 0; color: var(--color-ink); }
.pl-head__n { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--color-faint); }
.pl-seg { display: inline-flex; border: 1px solid var(--color-hair); border-radius: var(--radius-pill); padding: 2px; background: var(--color-surface); }
.pl-seg__b { border: 0; background: transparent; border-radius: var(--radius-pill); padding: 5px 13px; font-family: var(--font-sans); font-size: 12px; font-weight: 600; color: var(--color-mute); cursor: pointer; }
.pl-seg__b.on { background: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.pl-new { height: 36px; display: inline-flex; align-items: center; gap: 7px; padding: 0 16px; border: 1px solid var(--color-ink); background: var(--color-ink); border-radius: var(--radius-pill); font-family: var(--font-sans); font-size: 12.5px; font-weight: 700; color: var(--color-bg); cursor: pointer; white-space: nowrap; transition: transform var(--t-fast) var(--ease-out); }

/* empty */
.pl-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 22px; border: 1px dashed var(--color-hair); border-radius: var(--radius-md); background: var(--color-paper); }
.pl-empty__t { font-size: 15px; font-weight: 700; color: var(--color-ink); margin: 0; }
.pl-empty__s { font-size: 13px; line-height: 1.55; color: var(--color-ink-soft); margin: 0; max-width: 520px; }

/* cartes */
.pl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(288px, 1fr)); gap: 14px; }
.pl-card { display: flex; flex-direction: column; gap: 10px; text-align: left; cursor: pointer; padding: 16px 17px; border: 1px solid var(--border-card); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-card); font: inherit; transition: transform .15s var(--ease-out), box-shadow .15s; }
.pl-card__head { display: flex; align-items: flex-start; gap: 8px; }
.pl-card__name { flex: 1; min-width: 0; font-weight: 700; font-size: 15px; letter-spacing: -.01em; color: var(--color-ink); }
.pl-card__owner { display: inline-flex; align-items: center; font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; padding: 2.5px 8px; border-radius: var(--radius-pill); border: 1px solid var(--color-hair); color: var(--color-mute); }
.pl-card__chips { display: flex; flex-wrap: wrap; gap: 5px; min-height: 1px; }
.pl-card__brief { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--color-ink-soft); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 37px; }
.pl-card__brief--empty { color: var(--color-faint); font-style: italic; }
.pl-card__foot { display: flex; align-items: center; gap: 10px; margin-top: 2px; padding-top: 10px; border-top: 1px solid var(--color-hair-soft); font-family: var(--font-mono); font-size: 10px; letter-spacing: .04em; color: var(--color-faint); }
.pl-card__go { margin-left: auto; display: inline-flex; color: var(--color-mute); }
.pl-card__sep { width: 3px; height: 3px; border-radius: var(--radius-pill); background: var(--color-faint); }
.pl-card--tpl { cursor: default; box-shadow: none; border-style: dashed; background: var(--color-paper); }

/* tableau dense */
.pl-table { border: 1px solid var(--border-card); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-card); overflow: hidden; }
.pl-row { display: grid; grid-template-columns: 1fr auto 132px 72px 28px; gap: 14px; align-items: center; width: 100%; text-align: left; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--color-hair-soft); background: transparent; font: inherit; cursor: pointer; }
.pl-row:last-child { border-bottom: 0; }
.pl-row--head { cursor: default; border-bottom: 1px solid var(--color-hair); font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--color-faint); }
.pl-row__name { min-width: 0; display: flex; align-items: center; gap: 9px; }
.pl-row__nt { font-weight: 600; font-size: 13.5px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-row__owner { font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--color-faint); }
.pl-row__chips { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
.pl-row__maj { font-family: var(--font-mono); font-size: 11px; color: var(--color-mute); }
.pl-row__num { font-family: var(--font-mono); font-size: 11px; color: var(--color-mute); text-align: right; }
.pl-row--head .pl-row__num { text-align: right; }
.pl-row__go { display: inline-flex; color: var(--color-faint); }

/* modèles */
.pl-tpl-hd { display: flex; align-items: center; gap: 9px; margin-top: 16px; }
.pl-tpl-hd__k { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--color-mute); }
.pl-tpl-hd__line { flex: 1; height: 1px; background: var(--color-hair-soft); }
.pl-tpl-hd__s { font-size: 12px; color: var(--color-faint); }
@media (max-width: 560px) { .pl-tpl-hd__s { display: none; } }

/* Effets de survol réservés aux pointeurs qui savent survoler (souris). Sur tactile,
 * un :hover à transform capture le 1er tap (la carte « se soulève » au lieu d'ouvrir) —
 * on ne les sert donc pas là où hover n'existe pas, pour que le tap = clic direct. */
@media (hover: hover) {
  .pl-new:hover { transform: translateY(-1px); }
  .pl-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-pop); }
  .pl-card--tpl:hover { transform: none; box-shadow: none; }
  .pl-row:hover:not(.pl-row--head) { background: var(--color-paper-2); }
}
</style>

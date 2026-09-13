// Ce que l'ADRESSE d'une page projet désigne — une page (`?doc=<id>`), un tableau lié
// (`/projects/:id/data/:nsRef`) — et ce que l'écran dit quand elle ne l'ouvre pas (oto#203).
//
// Avant oto#203, la page résolvait l'adresse contre le rail et, faute de résultat, ne
// touchait pas la sélection : au montage elle retombait sur l'accueil (le brief sous une
// adresse qui désigne autre chose), en navigation l'objet PRÉCÉDENT restait affiché sous la
// nouvelle adresse. Désormais :
//  - page listée → ouverte depuis la liste ;
//  - id de page hors liste → `oto_doc op=get` : une page de CE projet s'affiche (la liste
//    était en retard ou n'a pas chargé) ; celle d'un autre projet se nomme, avec le lien vers
//    son projet ; un refus s'affiche avec son code ;
//  - tableau → le lien du projet, par `target_ref` (ce que l'écran met dans l'adresse), puis
//    `datastore_id`, puis le nom ; un nom porté par plusieurs liens liste les candidats.
// Une adresse qui ne désigne rien (`/projects/:id`) ne touche pas la sélection : connecteurs,
// procédures et fichiers n'ont pas d'adresse propre. Règle commune : `lib/routeTarget.ts`.
import { ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getDoc } from '@/api/console'
import type { Doc, ProjectLink } from '@/types/api'
import { useScopedLink } from '@/composables/useScopedLink'
import { resolveTarget, targetRefusal, type TargetChoice } from '@/lib/routeTarget'

export interface ProjectTargetRefusal {
  title: string
  code: string | null
  detail: string | null
  choices: TargetChoice[]
}

export function useProjectTarget(o: {
  projectId: number
  docs: Ref<Doc[]>
  tableLinks: () => ProjectLink[]
  sel: Ref<string>
  linkKey: (l: ProjectLink) => string
}) {
  const route = useRoute()
  const { t } = useI18n()
  const { scoped } = useScopedLink()
  const refusal = ref<ProjectTargetRefusal | null>(null)
  // Lecture par id en vol : l'écran attend, il n'affiche rien d'autre en attendant.
  const pending = ref(false)
  // Une page de CE projet absente de la liste chargée, lue par son id.
  const outsideDoc = ref<Doc | null>(null)
  // Jeton de la dernière résolution : une réponse arrivée après un changement d'adresse
  // n'écrase pas ce que l'adresse demande désormais.
  let seq = 0

  function refuse(title: string, detail: string | null, code: string | null = null, choices: TargetChoice[] = []) {
    o.sel.value = ''   // aucune entité du rail n'est celle demandée
    refusal.value = { title, code, detail, choices }
  }

  function selectTable(raw: string) {
    const r = resolveTarget(raw, o.tableLinks(),
      [(l) => l.target_ref, (l) => l.datastore_id, (l) => l.datastore])
    if (r.kind === 'found') { o.sel.value = o.linkKey(r.item); return }
    if (r.kind === 'unknown') { refuse(t('target.table.notFound', { raw }), t('target.table.notLinked')); return }
    refuse(t('target.table.ambiguous', { raw }), t('target.table.pick'), null, r.candidates.map((l) => ({
      key: o.linkKey(l),
      label: l.datastore ?? l.target_ref,
      hint: l.datastore_id != null ? `#${l.datastore_id}` : null,
      to: scoped(`/projects/${o.projectId}/data/${l.target_ref}`),
    })))
  }

  async function selectDoc(raw: string, mine: number) {
    const r = resolveTarget(raw, o.docs.value, [(d) => d.id])
    if (r.kind === 'found') { o.sel.value = `doc:${r.item.id}`; return }
    if (!/^[1-9]\d*$/.test(raw)) {
      refuse(t('target.doc.notFound', { what: `« ${raw} »` }), t('target.doc.notAnId'))
      return
    }
    const id = Number(raw)
    const what = `#${id}`
    o.sel.value = ''
    pending.value = true
    try {
      const d = await getDoc(id)
      if (mine !== seq) return
      if (d.id !== id) {
        refuse(t('target.doc.notFound', { what }), t('target.doc.otherId', { got: d.id }))
      } else if (d.project_id !== o.projectId) {
        refuse(t('target.doc.notFound', { what }), t('target.doc.otherProject'), null, [{
          key: `project:${d.project_id}`,
          label: t('target.doc.openInProject'),
          to: scoped(`/projects/${d.project_id}?doc=${id}`),
        }])
      } else {
        outsideDoc.value = d
        o.sel.value = `doc:${id}`
      }
    } catch (e) {
      if (mine !== seq) return
      const { code, detail } = targetRefusal(what, e)
      refuse(t('target.doc.notFound', { what }), detail, code)
    } finally {
      if (mine === seq) pending.value = false
    }
  }

  /** Résout l'adresse courante — une fois le projet et ses pages chargés : une liste pas
   * encore là n'est pas une preuve d'absence. */
  async function selectFromRoute() {
    const mine = ++seq
    refusal.value = null
    outsideDoc.value = null
    pending.value = false
    const ns = route.params.nsRef
    if (typeof ns === 'string' && ns) { selectTable(ns); return }
    const doc = route.query.doc
    if (typeof doc === 'string' && doc) await selectDoc(doc, mine)
  }

  return { refusal, pending, outsideDoc, selectFromRoute }
}

// La session d'édition d'une ligne EXISTANTE, et son brouillon (oto#213).
//
//   · ouvrir : la ligne est RELUE en forme réinscriptible — jamais prise dans la page, dont
//     les cases sont à plat et les vides assumés indiscernables — et le brouillon en naît ;
//   · enregistrer : seule la différence part, sur la révision lue ; rien à écrire = aucun appel ;
//   · refus : un conflit relit et fait trancher, une réservation se dit, un refus du schéma
//     se rattache à sa colonne. Rien n'est jamais renvoyé sans un nouveau geste de la personne.
import { computed, ref, shallowRef, watch } from 'vue'
import { getRewritableRow, updateNamespaceRow } from '@/api/console'
import type { DatastoreRow, DatastoreSchema, RewritableRow } from '@/types/api'
import { explain } from '@/lib/errors'
import { formFields } from '@/lib/datastoreForm'
import { brouillonDeLigne, correctif, type Brouillon, type CompositeSaisi } from '@/lib/rowDraft'
import { estEnveloppee, type Couches } from '@/lib/rowCells'
import { refusDeLigne, type RefusDeLigne } from '@/lib/rowRefusal'
import { colonnesOpposees, conflitTranche, reprendreBrouillon, type Choix } from '@/lib/rowConflict'

type Ligne = Record<string, unknown>

export interface SourceDuFormulaire {
  schema: () => DatastoreSchema | null | undefined
  ligne: () => DatastoreRow | null   // la ligne passée à la fiche (page), `null` à l'ajout
  connues: () => string[]            // colonnes connues du tableau
  ajoutees: () => string[]           // champs ajoutés dans la fiche
  sansCouches: () => boolean         // écarter les couches servies à plat (édition)
}

export function useRowEditor(src: SourceDuFormulaire) {
  // ── le brouillon ───────────────────────────────────────────────────────────
  const scalars = ref<Record<string, string>>({})
  const empties = ref<Record<string, boolean>>({})
  const composites = ref<Record<string, CompositeSaisi>>({})
  const couches = ref<Record<string, Couches>>({})     // commentaire et lien d'une case (oto#216)
  const brouillon = (): Brouillon =>
    ({ scalaires: scalars.value, vides: empties.value, composites: composites.value, couches: couches.value })
  const champsDe = (ligne: Ligne | null) =>
    formFields(src.schema(), ligne, src.connues(), src.ajoutees(), src.sansCouches())

  function poser(b: Brouillon) {
    scalars.value = b.scalaires
    empties.value = b.vides
    composites.value = b.composites
    couches.value = b.couches
  }
  const poserLigne = (ligne: Ligne | null) => poser(brouillonDeLigne(champsDe(ligne), ligne))

  /** « Vide assumé » : l'activer vide la saisie ; saisir une valeur le désactive. */
  function basculerVide(cle: string, actif: boolean) {
    if (actif) scalars.value[cle] = ''
    empties.value[cle] = actif
  }
  watch(scalars, (s) => {
    for (const [cle, actif] of Object.entries(empties.value))
      if (actif && (s[cle] ?? '').trim()) empties.value[cle] = false
  }, { deep: true })

  // ── la session ─────────────────────────────────────────────────────────────
  const lu = shallowRef<RewritableRow | null>(null)
  const relue = shallowRef<RewritableRow | null>(null)
  const etat = ref<'inactive' | 'lecture' | 'prete' | 'echec'>('inactive')
  const echecLecture = ref<string | null>(null)
  const refus = ref<RefusDeLigne | null>(null)
  const echecEcriture = ref<string | null>(null)
  const echecRelecture = ref<string | null>(null)
  const envoi = ref(false)
  const choix = ref<Record<string, Choix>>({})
  let adresse: { ns: string; id: string } | null = null
  let session = 0

  /** Les champs du formulaire : ceux de la ligne relue dès qu'elle est là. */
  const champs = computed(() => champsDe(lu.value ?? src.ligne()))

  async function lire(ns: string, id: string): Promise<RewritableRow> {
    const ligne = await getRewritableRow(ns, id)
    // Sans révision, pas d'écriture conditionnelle : l'édition ne s'ouvre pas, plutôt
    // que de risquer d'écraser une écriture concurrente.
    if (typeof ligne._revision !== 'string' || !ligne._revision) throw new Error('revision_missing')
    return ligne
  }

  function oublierRefus() {
    refus.value = null
    echecEcriture.value = null
    echecRelecture.value = null
    relue.value = null
    choix.value = {}
  }

  /** Ferme la session ; le brouillon est reposé sur `ligne` (lecture seule, ajout). */
  function fermer(ligne: Ligne | null = null) {
    session++
    adresse = null
    lu.value = null
    etat.value = 'inactive'
    echecLecture.value = null
    oublierRefus()
    poserLigne(ligne)
  }

  /** Ouvre l'édition : la ligne de la page reste affichée, en lecture, le temps de la relire. */
  async function ouvrir(ns: string, id: string) {
    fermer(src.ligne())
    const s = session
    adresse = { ns, id }
    etat.value = 'lecture'
    try {
      const ligne = await lire(ns, id)
      if (s !== session) return
      lu.value = ligne
      poserLigne(ligne)
      etat.value = 'prete'
    } catch (e) {
      if (s !== session) return
      echecLecture.value = explain(e)
      etat.value = 'echec'
    }
  }
  const rouvrir = () => { if (adresse) void ouvrir(adresse.ns, adresse.id) }

  /** Le corps d'un AJOUT : la différence avec une ligne vide. */
  const aAjouter = () => correctif(champs.value, {}, brouillon())

  /** Écrit la différence sur la révision lue. `inchangee` : rien à écrire, aucun appel.
   * `null` : refusée ou en échec — le brouillon reste, et rien n'est renvoyé. */
  async function enregistrer(): Promise<DatastoreRow | 'inchangee' | null> {
    const base = lu.value
    if (!adresse || !base || envoi.value) return null
    const corps = correctif(champs.value, base, brouillon())
    if (!Object.keys(corps).length) return 'inchangee'
    const s = session
    oublierRefus()
    envoi.value = true
    try {
      return await updateNamespaceRow(adresse.ns, adresse.id, corps, base._revision)
    } catch (e) {
      if (s !== session) return null
      const r = refusDeLigne(e)
      if (!r) echecEcriture.value = explain(e)
      else {
        refus.value = r
        if (r.sorte === 'conflit') await relire()
      }
      return null
    } finally {
      envoi.value = false
    }
  }

  /** Relit la version actuelle après un conflit — sans rien renvoyer. */
  async function relire() {
    if (!adresse) return
    const s = session
    echecRelecture.value = null
    try {
      const ligne = await lire(adresse.ns, adresse.id)
      if (s === session) relue.value = ligne
    } catch (e) {
      if (s === session) echecRelecture.value = explain(e)
    }
  }

  // ── le conflit : ce qui s'oppose, et la reprise tranchée ───────────────────
  const champsDuConflit = computed(() =>
    (lu.value && relue.value ? champsDe({ ...lu.value, ...relue.value }) : []))
  const opposees = computed(() => (lu.value && relue.value
    ? colonnesOpposees(champsDuConflit.value, lu.value, relue.value, brouillon())
    : null))
  const tranche = computed(() => !!opposees.value && conflitTranche(opposees.value, choix.value))
  const choisir = (cle: string, c: Choix) => { choix.value = { ...choix.value, [cle]: c } }

  /** La personne a tranché : le brouillon est repris sur la version relue, qui devient la
   * base — sa révision comprise. Rien n'est envoyé : réenregistrer reste son geste. */
  function reprendre() {
    if (!lu.value || !relue.value || !tranche.value) return
    poser(reprendreBrouillon(champsDuConflit.value, lu.value, relue.value, brouillon(), choix.value))
    lu.value = relue.value
    oublierRefus()
  }

  // ── le refus du schéma, rattaché à sa colonne ──────────────────────────────
  const refusInvalide = computed(() => (refus.value?.sorte === 'invalide' ? refus.value : null))
  const refusDuChamp = (cle: string) =>
    (refusInvalide.value?.colonne === cle ? refusInvalide.value : null)
  /** Les fautes d'une colonne composite, par élément puis par sous-champ (oto#219). Un élément
   * désigné par son identité (`[clé, valeur]`) est retrouvé dans la saisie ; un objet (pas une
   * liste) n'a qu'un élément, le rang 0. `message` rend le texte à afficher. */
  function erreursDeColonne(cle: string, message: (attendu: string | null) => string):
    Record<number, Record<string, string>> {
    const out: Record<number, Record<string, string>> = {}
    const saisie = composites.value[cle]
    for (const f of refusInvalide.value?.fautes ?? []) {
      if (f.colonne !== cle || !f.champ) continue
      let rang = f.element
      if (rang == null && f.identite && saisie?.sorte === 'elements') {
        const [k, v] = f.identite
        const i = saisie.elements.findIndex((e) => (e.textes[k] ?? '') === v)
        rang = i >= 0 ? i : null
      }
      if (rang == null && saisie?.sorte === 'objet') rang = 0
      if (rang != null) (out[rang] ??= {})[f.champ] = message(f.attendu)
    }
    return out
  }
  /** L'origine d'une case relue : elle se LIT, elle ne s'écrit jamais (oto#216). */
  const origineDe = (cle: string): string | null => {
    const c = lu.value?.[cle]
    return estEnveloppee(c) && c.origine != null ? String(c.origine) : null
  }
  /** Un refus qu'aucun champ affiché ne peut porter se dit en tête de la fiche. */
  const refusHorsChamp = computed(() =>
    !!refusInvalide.value && !champs.value.some((d) => d.key === refusInvalide.value?.colonne))

  return {
    scalars, empties, composites, champs, basculerVide,
    lu, etat, echecLecture, refus, echecEcriture, echecRelecture, envoi,
    ouvrir, rouvrir, fermer, aAjouter, enregistrer, relire,
    choix, opposees, tranche, choisir, reprendre, refusDuChamp, refusHorsChamp, erreursDeColonne,
    couches, origineDe,
  }
}

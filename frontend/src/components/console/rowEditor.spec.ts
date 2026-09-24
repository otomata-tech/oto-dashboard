// ─────────────────────────────────────────────────────────────────────────────
// L'ÉDITEUR DE LIGNES monté contre un FAUX STORE à compare-and-set (oto#213).
//
// Le défaut : la fiche prenait la ligne dans la page (à plat, sans révision), élaguait
// les vides et les éléments vides, et renvoyait la projection entière sans précondition
// — un aller-retour effaçait les vides assumés, et une écriture concurrente était écrasée.
//
// Le faux store rejoue le contrat (#204 étape 2) là où il décide du résultat :
//   · la révision : `?expected_revision` ≠ courante → 409 et RIEN n'est écrit ;
//   · la réservation : 409 `row_locked` ;
//   · une valeur écrite garde `origine` et les SEULES couches `comment`/`link` envoyées —
//     une couche non renvoyée tombe ; `{valeur: null, comment}` efface la valeur et LAISSE
//     le comment, orphelin (comme en prod, v1.335.0) — seul un `null` nu efface tout ;
//   · le contrat à deux gestes (oto#140, 23/09/2026), dans son état FINAL : `null` retire
//     la valeur, vide assumé compris (sur un requis : 400 `row_invalid` + `expected_column`),
//     `@empty` la marque ; `""` et `[]` REMPLACENT la valeur en place (06/10/2026) ;
//     `@clear` et `@keep` → 400 (08/10/2026) ;
//   · `@empty` sur `of.key`, dans une colonne json, une liste de valeurs ou un objet
//     → 400 ; `origine` dans un corps → 400.
// Une colonne non nommée n'est pas touchée. Ce banc juge l'ÉTAT DU STORE et les requêtes
// parties, jamais ce que l'écran croit avoir fait.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { i18n } from '@/lib/i18n'
import type { DatastoreSchema } from '@/types/api'

vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ getAccessToken: async () => 'jeton-de-banc' }) }))
vi.mock('@/lib/busy', () => ({ beginBusy: () => {}, endBusy: () => {} }))

import RowDrawer from './RowDrawer.vue'

type Ligne = Record<string, unknown>
const SCHEMA: DatastoreSchema = {
  fields: [
    { key: 'societe', role: 'title', type: 'text', required: true },
    { key: 'siret', type: 'text', required: true },
    { key: 'pays', type: 'text' },
    { key: 'ville', type: 'text' },
    { key: 'effectif', type: 'number' },
    { key: 'meta', type: 'json' },
    {
      key: 'contacts', type: 'list',
      of: { key: 'email', fields: [{ key: 'email' }, { key: 'nom', required: true }, { key: 'fonction' }] },
    },
    { key: 'idcc', type: 'list', of: { type: 'text' } },
    { key: 'siege', type: 'object', fields: [{ key: 'rue' }] },
  ],
}
const DEPART = (): Ligne => ({
  societe: { valeur: 'ACME', origine: 'sirene' },
  siret: '123',
  pays: 'FR',
  ville: { valeur: 'Paris', comment: 'siège', link: 'https://annuaire/paris' },
  effectif: { valeur: '@empty' },
  meta: { a: 1 },
  contacts: [
    { email: 'a@x.fr', nom: 'Alice', fonction: 'DG' },
    { email: 'b@x.fr', nom: 'Bob', fonction: { valeur: '@empty', comment: 'poste vacant' } },
    { email: { valeur: 'c@x.fr', comment: 'vu' }, nom: 'Chloé', fonction: '' },
  ],
  idcc: ['1486'],
  siege: { rue: '1 rue X' },
})

// ── le faux store ────────────────────────────────────────────────────────────
const store = { rev: 7, ligne: DEPART(), reservee: false, sansRevision: false }
const requetes: Array<{ methode: string; chemin: string; query: string; corps?: Ligne }> = []
const nonSimulees: string[] = []

const copie = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const estObjet = (v: unknown): v is Ligne => !!v && typeof v === 'object' && !Array.isArray(v)
const enveloppee = (v: unknown): v is Ligne => estObjet(v) && 'valeur' in v
const valeurDe = (v: unknown) => (enveloppee(v) ? v.valeur : v)
const VIDE_ASSUME = '@empty'
const RETIRES = ['@clear', '@keep']             // refusés à partir du 08/10/2026
const contient = (mots: string[]) => {
  const f = (v: unknown): boolean =>
    mots.includes(v as string) || (!!v && typeof v === 'object' && Object.values(v).some(f))
  return f
}
const contientVideAssume = contient([VIDE_ASSUME])
const contientRetire = contient(RETIRES)
const contientOrigine = (v: unknown): boolean =>
  !!v && typeof v === 'object' && Object.entries(v).some(([k, x]) => k === 'origine' || contientOrigine(x))
const repondre = (status: number, corps: unknown) =>
  ({ ok: status < 400, status, statusText: '', json: async () => corps }) as unknown as Response
const refuser = (status: number, error: string, details?: Ligne) =>
  repondre(status, { error, detail: `refus du store : ${error}`, details })

/** La case après écriture : `origine` survit, seules les couches ENVOYÉES restent. */
function caseApres(avant: unknown, envoyee: unknown, valeur: unknown): unknown {
  const couches: Ligne = {}
  if (enveloppee(envoyee)) for (const k of ['comment', 'link']) if (k in envoyee) couches[k] = envoyee[k]
  if (enveloppee(avant) && avant.origine !== undefined) couches.origine = avant.origine
  if (valeur === null && !Object.keys(couches).length) return undefined
  return Object.keys(couches).length || valeur === '@empty' ? { valeur, ...couches } : valeur
}

/** Applique le corps sur une COPIE ; rend un refus, ou null quand la ligne est écrite. */
function fusionner(corps: Ligne): Response | null {
  if (contientOrigine(corps)) return refuser(400, 'invalid_row_input')
  if (contientRetire(corps)) return refuser(400, 'row_invalid')
  const suivante = copie(store.ligne)
  for (const [col, v] of Object.entries(corps)) {
    const f = SCHEMA.fields!.find((x) => x.key === col)
    const val = valeurDe(v)
    const avant = suivante[col]
    const listeDeRecords = f?.type === 'list' && !!f.of?.key
    if (!listeDeRecords && (f?.type === 'json' || f?.type === 'list' || f?.type === 'object') && contientVideAssume(val))
      return refuser(400, 'row_invalid', { expected_column: col })
    let apres: unknown
    if (val === null) {
      if (f?.required) return refuser(400, 'row_invalid', { expected_column: col })
      apres = caseApres(avant, v, null)
    } else if (listeDeRecords) {
      const items: Ligne[] = []
      for (const item of val as Ligne[]) {
        const out: Ligne = {}
        for (const [k, c] of Object.entries(item)) {
          const cv = valeurDe(c)
          if (cv === VIDE_ASSUME && k === f!.of!.key)
            return refuser(400, 'row_invalid', { expected_column: col })
          // Un sous-champ requis vidé dans un ÉLÉMENT : le serveur refuse SANS
          // `details.expected_column` — le chemin n'est que dans la phrase.
          if (cv === null && f!.of!.fields?.find((s) => s.key === k)?.required)
            return repondre(400, { error: 'row_invalid', detail: `écriture refusée : ${col}[${items.length}].${k} est requis` })
          const cellule = caseApres(undefined, c, cv)
          if (cellule !== undefined) out[k] = cellule
        }
        items.push(out)
      }
      apres = caseApres(avant, v, items)
    } else apres = caseApres(avant, v, val)
    if (apres === undefined) delete suivante[col]
    else suivante[col] = apres
  }
  store.ligne = suivante
  store.rev++
  return null
}

beforeEach(() => {
  Object.assign(store, { rev: 7, ligne: DEPART(), reservee: false, sansRevision: false })
  requetes.length = 0
  nonSimulees.length = 0
  i18n.global.locale.value = 'fr'
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const u = new URL(url)
    const methode = init.method ?? 'GET'
    const query = u.searchParams.toString()
    const corps = init.body ? JSON.parse(String(init.body)) as Ligne : undefined
    requetes.push({ methode, chemin: u.pathname, query, corps })
    if (u.pathname === '/api/datastores/77/rows/r1/activity' && methode === 'GET' && !query)
      return repondre(200, { activity: [], key: null, retention_days: 30 })
    if (u.pathname === '/api/datastores/77/rows/r1') {
      if (methode === 'GET' && query === 'empties=sentinel&layers=nested') {
        const ligne = { _id: 'r1', ...copie(store.ligne) }
        return repondre(200, store.sansRevision ? ligne : { ...ligne, _revision: String(store.rev) })
      }
      if (methode === 'PATCH' && corps) {
        if (store.reservee) return refuser(409, 'row_locked')
        const attendue = u.searchParams.get('expected_revision')
        if (attendue !== null && attendue !== String(store.rev))
          return refuser(409, 'revision_conflict', { current_revision: String(store.rev) })
        return fusionner(corps) ?? repondre(200, { _id: 'r1', _revision: String(store.rev) })
      }
    }
    nonSimulees.push(`${methode} ${u.pathname}${u.search}`)
    return refuser(599, 'non_simulee')
  })
})

const apps: App[] = []
afterEach(() => {
  expect(nonSimulees).toEqual([])
  for (const a of apps.splice(0)) a.unmount()
  document.body.textContent = ''
})

const vider = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
}

async function monter() {
  const emis = { saved: 0, close: 0 }
  const app = createApp(RowDrawer, {
    open: true, row: { _id: 'r1', societe: 'ACME' }, fields: [], isNew: false, readOnly: false,
    schema: SCHEMA, datastore: '77',
    onSaved: () => { emis.saved++ }, onClose: () => { emis.close++ },
  })
  app.component('RouterLink', { template: '<a><slot /></a>' })
  app.use(i18n)
  app.mount(document.body.appendChild(document.createElement('div')))
  apps.push(app)
  await vider()
  return emis
}

// ── gestes ───────────────────────────────────────────────────────────────────
const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)
const champ = (cle: string) => q(`[data-field="${cle}"]`)!
const cellule = (col: string, i: number, cle: string) =>
  q(`[data-field="${col}"] [data-item="${i}"] [data-cell="${cle}"]`)!
function taper(el: Element | null, texte: string) {
  const input = el as HTMLInputElement
  input.value = texte
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const bouton = (texte: string, dans: ParentNode = document.body) =>
  [...dans.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) ?? null
async function cliquer(b: Element | null) {
  expect(b, 'bouton introuvable').not.toBeNull()
  ;(b as HTMLButtonElement).click()
  await vider()
}
const patches = () => requetes.filter((r) => r.methode === 'PATCH')
const relectures = () => requetes.filter((r) => r.methode === 'GET' && r.query === 'empties=sentinel&layers=nested')
const saisie = (cle: string) => (champ(cle).querySelector('input') as HTMLInputElement).value
const intactes = (sauf: string[]) => {
  const attendu = DEPART()
  for (const cle of Object.keys(attendu)) if (!sauf.includes(cle)) expect(store.ligne[cle], cle).toEqual(attendu[cle])
}

describe('la fiche relit la ligne, et n’écrit que la différence', () => {
  it('ouverture : relecture réinscriptible ; aller-retour sans modification = AUCUN PATCH', async () => {
    const emis = await monter()
    expect(relectures()).toHaveLength(1)
    await cliquer(bouton('Enregistrer'))
    expect(patches()).toEqual([])
    expect(emis.close).toBe(1)
    intactes([])
  })

  it('une modification : UNE colonne, sur la révision lue ; marqueurs et couches des autres intacts', async () => {
    const emis = await monter()
    taper(champ('siret').querySelector('input'), '456')
    await cliquer(bouton('Enregistrer'))
    expect(patches()).toHaveLength(1)
    expect(patches()[0]!.query).toBe('expected_revision=7')
    expect(patches()[0]!.corps).toEqual({ siret: '456' })
    expect(store.ligne.siret).toBe('456')
    intactes(['siret'])
    expect(emis.saved).toBe(1)
  })

  it('modifier la valeur d’une case qui porte un comment et un link les garde intacts', async () => {
    await monter()
    taper(champ('ville').querySelector('input'), 'Lyon')
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ ville: { valeur: 'Lyon', comment: 'siège', link: 'https://annuaire/paris' } })
    expect(store.ligne.ville).toEqual({ valeur: 'Lyon', comment: 'siège', link: 'https://annuaire/paris' })
    intactes(['ville'])
  })

  it('contacts[1].fonction = @empty survit à l’édition de contacts[0] et au retrait de contacts[2]', async () => {
    await monter()
    taper(cellule('contacts', 0, 'nom').querySelector('input'), 'Alicia')
    await nextTick()
    await cliquer(q('[data-field="contacts"] [data-item="2"] .sre-x'))
    await cliquer(bouton('Enregistrer'))
    expect(Object.keys(patches()[0]!.corps!)).toEqual(['contacts'])
    expect(store.ligne.contacts).toEqual([
      { email: 'a@x.fr', nom: 'Alicia', fonction: 'DG' },
      { email: 'b@x.fr', nom: 'Bob', fonction: { valeur: '@empty', comment: 'poste vacant' } },
    ])
    intactes(['contacts'])
  })
})

describe('vider, et le vide assumé', () => {
  it('vider un champ non requis envoie null, jamais "" ni @clear', async () => {
    await monter()
    taper(champ('pays').querySelector('input'), '')
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ pays: null })
    expect('pays' in store.ligne).toBe(false)
    intactes(['pays'])
  })

  it('vider une liste de valeurs, une colonne json, un sous-champ d’objet : null, jamais [] ni ""', async () => {
    await monter()
    taper(champ('idcc').querySelector('textarea'), '')
    taper(champ('meta').querySelector('input, textarea'), '')
    taper(champ('siege').querySelector('input'), '')
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ idcc: null, meta: null, siege: { rue: null } })
    expect('idcc' in store.ligne).toBe(false)
    expect('meta' in store.ligne).toBe(false)
    expect(store.ligne.siege).toEqual({ rue: null })
    intactes(['idcc', 'meta', 'siege'])
  })

  it('vider une liste de sous-records en retirant tous ses éléments : null', async () => {
    await monter()
    for (let i = 0; i < 3; i++) await cliquer(q('[data-field="contacts"] [data-item="0"] .sre-x'))
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ contacts: null })
    expect('contacts' in store.ligne).toBe(false)
    intactes(['contacts'])
  })

  it('vider une case qui porte un comment et un link : null NU, la case part entière, rien d’orphelin', async () => {
    await monter()
    taper(champ('ville').querySelector('input'), '')
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ ville: null })
    expect('ville' in store.ligne).toBe(false)
    intactes(['ville'])
  })

  it('vider une cellule d’élément qui porte un comment : null NU dans l’élément', async () => {
    await monter()
    taper(cellule('contacts', 2, 'email').querySelector('input'), '')
    await cliquer(bouton('Enregistrer'))
    expect((patches()[0]!.corps!.contacts as Ligne[])[2]!.email).toBeNull()
    expect((store.ligne.contacts as Ligne[])[2]).toEqual({ nom: 'Chloé', fonction: '' })
    intactes(['contacts'])
  })

  it('vider un champ requis : 400 rattaché au champ, rien d’écrit, pas de fausse réussite', async () => {
    const emis = await monter()
    taper(champ('siret').querySelector('input'), '')
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ siret: null })
    expect(champ('siret').querySelector('[role="alert"]')?.textContent).toContain('refus du store : row_invalid')
    expect(champ('pays').querySelector('[role="alert"]')).toBeNull()
    expect(store.rev).toBe(7)
    expect(emis.saved).toBe(0)
    expect(saisie('siret')).toBe('')
  })

  it('refus d’un élément de liste sans expected_column : en tête de fiche, jamais deviné depuis la phrase', async () => {
    const emis = await monter()
    taper(cellule('contacts', 0, 'nom').querySelector('input'), '')
    await cliquer(bouton('Enregistrer'))
    expect(patches()).toHaveLength(1)
    expect((patches()[0]!.corps!.contacts as Ligne[])[0]!.nom).toBeNull()
    // la phrase du serveur NOMME `contacts[0].nom` : aucun champ ne doit s'en saisir
    expect([...document.body.querySelectorAll('[data-field] [role="alert"]')]).toEqual([])
    expect(q('.rwr')?.textContent).toContain('écriture refusée : contacts[0].nom est requis')
    expect(store.rev).toBe(7)
    expect(emis.saved).toBe(0)
    expect((cellule('contacts', 0, 'nom').querySelector('input') as HTMLInputElement).value).toBe('')
  })

  it('activer « vide assumé » envoie @empty', async () => {
    await monter()
    await cliquer(champ('pays').querySelector('.vat'))
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ pays: '@empty' })
    expect(store.ligne.pays).toEqual({ valeur: '@empty' })
  })

  it('désactiver un vide assumé sans valeur envoie null', async () => {
    await monter()
    const bascule = champ('effectif').querySelector('.vat')!
    expect(bascule.getAttribute('aria-pressed')).toBe('true')   // lu : {"valeur":"@empty"}
    await cliquer(bascule)
    await cliquer(bouton('Enregistrer'))
    expect(patches()[0]!.corps).toEqual({ effectif: null })
    expect('effectif' in store.ligne).toBe(false)
  })

  it('aucune bascule sur l’identité d’une liste, une liste de valeurs, un objet, une colonne json', async () => {
    await monter()
    expect(cellule('contacts', 0, 'fonction').querySelector('.vat')).not.toBeNull()   // témoin
    expect(champ('pays').querySelector('.vat')).not.toBeNull()                         // témoin
    expect(cellule('contacts', 0, 'email').querySelector('.vat')).toBeNull()
    expect(champ('idcc').querySelector('.vat')).toBeNull()
    expect(champ('siege').querySelector('.vat')).toBeNull()
    expect(champ('meta').querySelector('.vat')).toBeNull()
  })
})

describe('les refus : le brouillon reste, rien n’est renvoyé', () => {
  it('écriture d’un tiers avant l’envoi : 409, brouillon gardé, version relue affichée, pas de second PATCH', async () => {
    await monter()
    store.ligne = { ...store.ligne, ville: 'Marseille' }   // le tiers écrit AVANT la frappe
    store.rev = 8
    taper(champ('ville').querySelector('input'), 'Lyon')
    await cliquer(bouton('Enregistrer'))
    await vider()
    expect(patches()).toHaveLength(1)
    expect(relectures()).toHaveLength(2)
    expect(store.ligne.ville).toBe('Marseille')
    expect(saisie('ville')).toBe('Lyon')
    const conflit = q('[data-col="ville"]')!
    expect(conflit.textContent).toContain('Marseille')
    expect(conflit.textContent).toContain('Lyon')
    expect((bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
  })

  it('la personne tranche puis réenregistre : sa colonne seule, sur la révision relue, le reste du tiers gardé', async () => {
    await monter()
    store.ligne = { ...store.ligne, ville: 'Marseille', idcc: ['9999'] }
    store.rev = 8
    taper(champ('ville').querySelector('input'), 'Lyon')
    await cliquer(bouton('Enregistrer'))
    const reprendre = bouton('reprendre sur la version relue') as HTMLButtonElement
    expect(reprendre.disabled).toBe(true)          // rien n'est tranché
    await cliquer(bouton('garder mon brouillon', q('[data-col="ville"]')!))
    await cliquer(reprendre)
    expect(patches()).toHaveLength(1)              // reprendre n'envoie rien
    await cliquer(bouton('Enregistrer'))
    expect(patches()).toHaveLength(2)
    expect(patches()[1]!.query).toBe('expected_revision=8')
    expect(patches()[1]!.corps).toEqual({ ville: 'Lyon' })
    expect(store.ligne.idcc).toEqual(['9999'])
  })

  it('row_locked : l’écran dit que la ligne est réservée, sans renvoi', async () => {
    const emis = await monter()
    store.reservee = true
    taper(champ('ville').querySelector('input'), 'Lyon')
    await cliquer(bouton('Enregistrer'))
    await vider()
    expect(patches()).toHaveLength(1)
    expect(document.body.textContent).toContain('cette ligne est réservée par un traitement en cours')
    expect(saisie('ville')).toBe('Lyon')
    expect(emis.saved).toBe(0)
  })

  it('sans révision servie, l’édition ne s’ouvre pas', async () => {
    store.sansRevision = true
    await monter()
    expect(champ('ville').querySelector('input')).toBeNull()
    expect(document.body.textContent).toContain('le serveur n\'a pas servi la révision de cette ligne')
    expect((bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
  })
})

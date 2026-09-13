import { inject, onBeforeUnmount, onMounted, provide, ref, type InjectionKey, type Ref } from 'vue'

// Le rafraîchissement de /automations, tenu par la PAGE et partagé par ses sections.
//
// Avant oto#205, la file relisait les 120 derniers travaux toutes les 30 s, onglet
// caché compris : 89 % des appels de la route venaient de ces relectures, et
// personne ne regardait. Deux règles désormais :
//   • rien ne part quand l'onglet est caché ; revenir sur l'onglet relit tout, une fois ;
//   • l'intervalle ne tourne que s'il existe une campagne VIVANTE — le reste ne bouge
//     pas tout seul, un clic sur « Rafraîchir » suffit.
//
// Chaque section s'INSCRIT avec son propre chargeur (une carte fermée ne relit rien,
// une liste démontée se désinscrit) ; la page appelle tous les inscrits d'un coup,
// et une section qui échoue n'empêche pas les autres de se relire.

type Chargeur = () => Promise<unknown>

interface Registre {
  inscrire: (fn: Chargeur) => () => void
  maintenant: Ref<number>
}

const CLE: InjectionKey<Registre> = Symbol('rafraichissement-automations')

export const INTERVALLE_MS = 30_000
/** L'horloge locale (séjours, « il y a ») avance sans rappeler le serveur. */
export const HORLOGE_MS = 10_000

export function ongletVisible(): boolean {
  return document.visibilityState !== 'hidden'
}

export function fournirRafraichissement(opts: { actif: () => boolean; intervalleMs?: number }) {
  const chargeurs = new Set<Chargeur>()
  const maintenant = ref(Date.now())
  const enCours = ref(false)
  let courant: Promise<void> | null = null

  async function toutCharger(): Promise<void> {
    if (courant) return courant
    enCours.value = true
    courant = (async () => {
      try {
        await Promise.allSettled([...chargeurs].map((fn) => fn()))
      } finally {
        maintenant.value = Date.now()
        enCours.value = false
        courant = null
      }
    })()
    return courant
  }

  provide(CLE, {
    inscrire: (fn) => { chargeurs.add(fn); return () => { chargeurs.delete(fn) } },
    maintenant,
  })

  let tick: ReturnType<typeof setInterval> | null = null
  let horloge: ReturnType<typeof setInterval> | null = null
  const surVisibilite = () => { if (ongletVisible()) void toutCharger() }

  onMounted(() => {
    document.addEventListener('visibilitychange', surVisibilite)
    tick = setInterval(() => {
      if (ongletVisible() && opts.actif()) void toutCharger()
    }, opts.intervalleMs ?? INTERVALLE_MS)
    horloge = setInterval(() => {
      if (ongletVisible()) maintenant.value = Date.now()
    }, HORLOGE_MS)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', surVisibilite)
    if (tick) clearInterval(tick)
    if (horloge) clearInterval(horloge)
  })

  return { toutCharger, enCours, maintenant }
}

/** Inscrit le chargeur d'une section pour la durée de sa vie. Hors de la page (la
 * carte des déclencheurs montée sur une procédure), il n'y a pas de registre : rien
 * n'est inscrit, et la section se charge seulement à son montage. */
export function inscrireRafraichissement(fn: Chargeur): void {
  const registre = inject(CLE, null)
  if (!registre) return
  let retirer: (() => void) | null = null
  onMounted(() => { retirer = registre.inscrire(fn) })
  onBeforeUnmount(() => { retirer?.() })
}

/** L'horloge de la page ; une horloge figée au montage hors de la page. */
export function useMaintenant(): Ref<number> {
  return inject(CLE, null)?.maintenant ?? ref(Date.now())
}

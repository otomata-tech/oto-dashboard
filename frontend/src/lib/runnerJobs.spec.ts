import { describe, it, expect } from 'vitest'
import type { RunnerJob } from '@/api/console'
import {
  GARDES, angleMort, aUneGarde, autresResultat, bail, bailExpire, bilanGardes,
  instant, outilsResultat, postesResultat, releveGarde,
  renvoiMuet, renvois, sejourMs, totalGardes,
} from './runnerJobs'

/** Une valeur de `result` qui TRAHIT le contrat déclaré. Le worker vit dans un
 * autre dépôt (`oto-runner`) et `JobResult` est `extra=allow` : le type nous
 * protège à l'écriture, il ne protège de rien à l'exécution. Ce cast sert à
 * fabriquer exprès la forme que le type interdit, pour vérifier qu'on ne la
 * recompte pas zéro en silence. */
function servi(v: unknown): string[] {
  return v as string[]
}

function job(over: Partial<RunnerJob> = {}): RunnerJob {
  return {
    id: 1, kind: 'start', run_id: null, payload: null, status: 'done',
    attempts: 1, max_attempts: 3, claimed_by: null, last_error: null,
    result: null, due_at: null, created_at: null, finished_at: null,
    ...over,
  }
}

describe('horodatages du runner', () => {
  it('lit un horodatage sans fuseau comme de l’UTC, pas comme de l’heure locale', () => {
    // Le backend sert « 2026-08-28 13:53:53 » : `Date.parse` le lirait en heure
    // LOCALE, et un travail de l'instant s'afficherait « il y a 2 h » l'été.
    expect(instant('2026-08-28 13:53:53')).toBe(Date.parse('2026-08-28T13:53:53Z'))
  })

  it('mesure un travail non conclu jusqu’à maintenant — c’est ce qui montre un agent bloqué', () => {
    const maintenant = Date.parse('2026-08-28T14:00:00Z')
    const enCours = job({ status: 'claimed', created_at: '2026-08-28 13:30:00' })
    expect(sejourMs(enCours, maintenant)).toBe(30 * 60_000)
  })

  it('arrête le compteur d’un travail conclu à sa conclusion', () => {
    const maintenant = Date.parse('2026-08-28T20:00:00Z')
    const fini = job({ created_at: '2026-08-28 13:30:00', finished_at: '2026-08-28 13:32:00' })
    expect(sejourMs(fini, maintenant)).toBe(2 * 60_000)
  })
})

describe('renvois du harnais', () => {
  // `claim_next_job` fait `attempts = attempts + 1` à CHAQUE prise, reprise d'un
  // bail mort comprise : la première prise est normale, les suivantes sont des
  // renvois. Ce test tient ce décalage — le lire à l'envers ferait signaler un
  // renvoi sur tous les travaux de la file.
  it('ne compte aucun renvoi sur une première prise', () => {
    expect(renvois(job({ attempts: 1 }))).toBe(0)
  })

  it('compte les prises au-delà de la première', () => {
    expect(renvois(job({ attempts: 3 }))).toBe(2)
  })

  it('distingue le renvoi SANS motif — un worker mort en cours de bail', () => {
    expect(renvoiMuet(job({ attempts: 2, last_error: null }))).toBe(true)
    // Avec un motif déclaré, c'est un échec de l'agent : il ne se soigne pas pareil.
    expect(renvoiMuet(job({ attempts: 2, last_error: 'amont en vrac' }))).toBe(false)
    expect(renvoiMuet(job({ attempts: 1 }))).toBe(false)
  })
})

describe('le bail du travail', () => {
  const t = (s: string) => Date.parse(s)

  it('dit EXPIRÉ sur une prise en cours dont la date est passée — le worker est parti', () => {
    const j = job({ status: 'claimed', lease_until: '2026-09-01 10:00:00' })
    const b = bail(j, t('2026-09-01T10:05:00Z'))
    expect(b.etat).toBe('expire')
    expect(b.resteMs).toBe(-5 * 60_000)
    expect(bailExpire(j, t('2026-09-01T10:05:00Z'))).toBe(true)
  })

  it('dit EN COURS tant que la date est à venir', () => {
    const j = job({ status: 'claimed', lease_until: '2026-09-01 10:10:00' })
    expect(bail(j, t('2026-09-01T10:05:00Z')).etat).toBe('en-cours')
  })

  // LE contresens à ne pas commettre. Sur un travail conclu, `lease_until` est le
  // bail qui ÉTAIT tenu : la date est vraie, elle est simplement PASSÉE. L'afficher
  // « expiré » accuserait de mort un travail qui s'est terminé normalement — et,
  // comme tous les travaux conclus ont une date passée, la file entière virerait
  // au rouge.
  it('ne dit JAMAIS « expiré » sur un travail conclu, même avec une date passée', () => {
    const fini = job({ status: 'done', lease_until: '2026-09-01 10:00:00' })
    const b = bail(fini, t('2026-09-01T18:00:00Z'))
    expect(b.etat).toBe('tenu')
    expect(bailExpire(fini, t('2026-09-01T18:00:00Z'))).toBe(false)
    // Un « dépassement » n'a de sens que sur une prise vivante.
    expect(b.resteMs).toBeNull()
    // La date reste lisible : on ne détruit pas une information vraie.
    expect(b.fin).toBe(t('2026-09-01T10:00:00Z'))
  })

  it('n’invente pas de bail là où le travail n’a jamais été pris', () => {
    expect(bail(job({ status: 'pending' }), Date.now()).etat).toBe('aucun')
    expect(bail(job({ status: 'pending', lease_until: null }), Date.now()).etat).toBe('aucun')
  })
})

describe('postes de garde', () => {
  // ⚠️ Ce sont des LISTES DE NOMS, pas des compteurs. On les avait lus comme des
  // entiers : une liste lue par un lecteur d'entier vaut zéro, et le bandeau ne
  // s'affichait donc jamais — le défaut déguisé en bonne nouvelle. Ce test tient
  // la forme réellement servie.
  it('lit les postes comme des listes de noms — un compteur les aurait vus à zéro', () => {
    const j = job({
      status: 'done',
      result: {
        valeurs_cliente_reparees: ['ville', 'telephone'],
        valeurs_cliente_detruites: ['siret'],
      },
    })
    expect(aUneGarde(j)).toBe(true)
    expect(totalGardes(j)).toBe(3)
    const r = releveGarde(j, GARDES[0]!)
    expect(r.etat).toBe('garni')
    expect(r.noms).toEqual(['ville', 'telephone'])
  })

  // LE piège du lot. `[]` et `null` s'affichent pareil sur un écran qui compte,
  // et l'un des deux dit que PERSONNE N'A REGARDÉ. Ils doivent donc sortir d'ici
  // par des états différents — sinon l'écran annonce « aucune destruction » là où
  // rien n'a été mesuré, exactement ce que ces postes existent pour empêcher.
  it('sépare « mesuré, rien trouvé » de « pas mesuré » — ils comptent 0 tous les deux', () => {
    const detruit = GARDES.find((g) => g.cle === 'valeurs_cliente_detruites')!
    const mesure = job({ status: 'done', result: { valeurs_cliente_detruites: [] } })
    const aveugle = job({ status: 'done', result: { valeurs_cliente_detruites: null } })

    expect(releveGarde(mesure, detruit).etat).toBe('neant')
    expect(releveGarde(aveugle, detruit).etat).toBe('non-mesure')
    // Le compteur ne les distingue PAS : c'est bien pour ça qu'il ne suffit pas.
    expect(totalGardes(mesure)).toBe(0)
    expect(totalGardes(aveugle)).toBe(0)
    // Le seul signal qui les sépare.
    expect(angleMort(mesure)).toBe(false)
    expect(angleMort(aveugle)).toBe(true)
  })

  it('distingue un poste ABSENT d’un poste à null — l’un se tait, l’autre avoue', () => {
    const detruit = GARDES.find((g) => g.cle === 'valeurs_cliente_detruites')!
    const muet = job({ result: { usage_tokens: 400 } })
    expect(releveGarde(muet, detruit).etat).toBe('absent')
    // Un travail qui ne déclare rien n'est pas un travail non mesuré : il est
    // d'avant les postes de garde. L'accuser d'angle mort noierait le vrai signal.
    expect(angleMort(muet)).toBe(false)
    expect(totalGardes(job({ result: null }))).toBe(0)
  })

  it('ressort une forme qu’il ne sait pas lire au lieu de la compter zéro', () => {
    // La régression précédente en une ligne : un entier là où une liste est
    // attendue ne doit plus se lire « rien à signaler ».
    const j = job({ result: { valeurs_cliente_reparees: servi(2) } })
    const r = releveGarde(j, GARDES[0]!)
    expect(r.etat).toBe('illisible')
    expect(r.brut).toBe('2')
    expect(angleMort(j)).toBe(true)
  })

  it('compte les non-mesurés à côté du total, jamais fondus dedans', () => {
    const bilan = bilanGardes([
      job({ result: { valeurs_cliente_detruites: ['siret'] } }),
      job({ result: { valeurs_cliente_detruites: null } }),
      job({ result: { valeurs_cliente_detruites: null } }),
      job({ result: { valeurs_cliente_detruites: [] } }),
    ])
    const d = bilan.find((b) => b.cle === 'valeurs_cliente_detruites')!
    expect(d.n).toBe(1)
    expect(d.travaux).toBe(1)
    expect(d.nonMesure).toBe(2)
  })
})

describe('lecture du résultat', () => {
  it('nomme les postes connus et traduit le motif d’arrêt', () => {
    const postes = postesResultat(job({
      result: { claims: 1, writes: 3, steps: 12, stopped: 'end_turn', usage_tokens: 1500 },
    }))
    const par = Object.fromEntries(postes.map((p) => [p.cle, p.valeur]))
    expect(par.writes).toBe('3')
    expect(par.stopped).toBe('fin de tour')
    expect(par.usage_tokens).toBe('2k')
  })

  it('rend un motif d’arrêt inconnu tel quel plutôt que de l’inventer', () => {
    const postes = postesResultat(job({ result: { stopped: 'quelque_chose_de_neuf' } }))
    expect(postes.find((p) => p.cle === 'stopped')?.valeur).toBe('quelque_chose_de_neuf')
  })

  it('signale la réservation sans écriture, qui ne lève aucune erreur', () => {
    const postes = postesResultat(job({ result: { claims: 1, faux_depart: true } }))
    const issue = postes.find((p) => p.cle === 'faux_depart')
    expect(issue?.valeur).toBe('réservé, rien écrit')
    expect(issue?.ton).toBe('attention')
  })

  it('trie le relevé d’outils du plus appelé au moins', () => {
    const outils = outilsResultat(job({
      result: { tool_counts: { data_write: 2, fr_search: 9, oto_kb: 0 } },
    }))
    expect(outils.map((o) => o.outil)).toEqual(['fr_search', 'data_write'])
  })

  // LE test qui protège le contrat ouvert. `JobResult` est `extra=allow` côté
  // backend : le worker peut déclarer un champ que cet écran ne connaît pas. S'il
  // était filtré, « l'écran ne le montre pas » se lirait « le worker ne le produit
  // pas » — le pire des deux malentendus.
  it('rend sous sa clé brute un champ que le worker déclare et qu’on ne sait pas nommer', () => {
    const autres = autresResultat(job({
      result: { usage_tokens: 10, estampille: true, poste_inedit: 7 },
    }))
    const cles = autres.map((a) => a.cle)
    expect(cles).toContain('estampille')
    expect(cles).toContain('poste_inedit')
    // Ce qui est déjà rendu ailleurs ne se répète pas dans « autres ».
    expect(cles).not.toContain('usage_tokens')
  })

  it('ne range pas les postes de garde dans « autres » — ils ont leur bandeau', () => {
    const autres = autresResultat(job({ result: { valeurs_cliente_reparees: ['ville'] } }))
    expect(autres.map((a) => a.cle)).not.toContain('valeurs_cliente_reparees')
  })
})

describe('le worker démonté (01/09/2026) — ce que l’écran fait du silence', () => {
  /** La forme RÉELLE que le worker sert depuis qu'il a perdu son métier : plus
   * aucun poste de garde, plus de `claims`/`writes`, plus de `faux_depart`. Il
   * exécute des agents et ne sait plus ce qu'ils font — c'était le but.
   * Ces tests gravent le fait qu'un écran nourri de ce silence reste MUET au
   * lieu de devenir FAUX : un poste absent n'est pas un poste à zéro. */
  const DEMONTE = {
    usage_tokens: 12345, usage_input: 10000, usage_output: 2345,
    usage_cache_read: 9000, usage_cache_write: 0,
    stopped: 'end_turn', steps: 7, model: 'mistral-large-2512',
    tool_counts: { data_claim_next: 1, data_write: 1 },
  }

  it('ne rend aucun poste de garde, et surtout aucun à zéro', () => {
    const j = job({ result: DEMONTE })
    const etats = GARDES.map((g) => releveGarde(j, g).etat)
    expect(etats.every((e) => e === 'absent')).toBe(true)
    expect(aUneGarde(j)).toBe(false)
    expect(totalGardes(j)).toBe(0)
  })

  it('ne crie pas à l’angle mort : ne rien déclarer n’est pas ne pas avoir regardé', () => {
    // `non-mesure` dit « la garde a tourné sans pouvoir conclure ». Un worker qui
    // n'a plus de garde du tout ne doit pas emprunter ce mot-là.
    expect(angleMort(job({ result: DEMONTE }))).toBe(false)
  })

  it('n’invente ni réservation ni écriture quand le worker n’en parle plus', () => {
    const cles = postesResultat(job({ result: DEMONTE })).map((p) => p.cle)
    expect(cles).not.toContain('claims')
    expect(cles).not.toContain('writes')
    expect(cles).not.toContain('faux_depart')
    expect(cles).not.toContain('claim_vide')
  })

  it('rend quand même ce que le worker déclare VRAIMENT — coût, arrêt, modèle', () => {
    const cles = postesResultat(job({ result: DEMONTE })).map((p) => p.cle)
    expect(cles).toContain('usage_tokens')
    expect(cles).toContain('stopped')
    expect(cles).toContain('model')
    expect(cles).toContain('steps')
  })

  it('ne déverse pas les compteurs connus dans « autres »', () => {
    const autres = autresResultat(job({ result: DEMONTE })).map((a) => a.cle)
    expect(autres).toEqual([])
  })
})

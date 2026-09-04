// Ce que la traduction d'un cadencement doit garantir (oto-backend#860 ②).
//
// L'enjeu n'est pas la couverture, c'est la FIDÉLITÉ : une phrase fausse sur un
// horaire fait conclure « il tourne le lundi » à quelqu'un qui ne rouvrira pas la
// page. D'où la règle du module — on traduit ce qu'on sait lire, on rend `null` pour
// le reste, et l'écran montre alors l'expression brute.
import { describe, expect, it } from 'vitest'
import { cadenceEnMots } from './cadence'

describe('les formes courantes se disent', () => {
  it('tous les jours', () => {
    expect(cadenceEnMots('0 18 * * *')).toBe('tous les jours à 18 h')
    expect(cadenceEnMots('30 8 * * *')).toBe('tous les jours à 8 h 30')
  })
  it('minuit se dit, il ne se compte pas', () => {
    expect(cadenceEnMots('0 0 * * *')).toBe('tous les jours à minuit')
  })
  it('chaque semaine, avec le bon jour', () => {
    expect(cadenceEnMots('0 9 * * 1')).toBe('chaque lundi à 9 h')
    // 0 et 7 désignent tous deux dimanche dans un cron — les deux doivent le dire.
    expect(cadenceEnMots('0 9 * * 0')).toBe('chaque dimanche à 9 h')
    expect(cadenceEnMots('0 9 * * 7')).toBe('chaque dimanche à 9 h')
  })
  it('chaque mois', () => {
    expect(cadenceEnMots('0 7 1 * *')).toBe('le 1er de chaque mois à 7 h')
    expect(cadenceEnMots('0 7 15 * *')).toBe('le 15 de chaque mois à 7 h')
  })
  it('toutes les heures', () => {
    expect(cadenceEnMots('0 * * * *')).toBe('toutes les heures')
    expect(cadenceEnMots('20 * * * *')).toBe('toutes les heures, à 20 min')
  })
})

describe('ce qu’on ne sait pas dire se TAIT', () => {
  // ⚠️ Le cœur du module. Chacune de ces formes a une phrase courte tentante et
  // FAUSSE — c'est exactement là qu'une traduction approximative trompe.
  it.each([
    ['*/7 * * * *', 'un pas de 7 minutes n’est pas « toutes les heures »'],
    ['0 8,20 * * *', 'deux heures dans la journée, pas une'],
    ['0 8 * * 1-5', 'une plage de jours, pas un jour'],
    ['0 8 1 * 1', 'jour du mois ET jour de semaine : le cron les combine en OU'],
    ['0 8 * 3 *', 'restreint à un mois — « tous les jours » serait faux'],
    ['0 8 L * *', 'syntaxe étendue'],
    ['0 8 * * *  extra', 'six champs : on ne présume pas des secondes'],
  ])('%s → null (%s)', (cron) => {
    expect(cadenceEnMots(cron)).toBeNull()
  })

  it('une entrée vide ou absente ne fabrique rien', () => {
    expect(cadenceEnMots('')).toBeNull()
    expect(cadenceEnMots(null)).toBeNull()
    expect(cadenceEnMots(undefined)).toBeNull()
  })

  it('des valeurs hors bornes ne se traduisent pas', () => {
    expect(cadenceEnMots('0 25 * * *')).toBeNull()
    expect(cadenceEnMots('99 8 * * *')).toBeNull()
    expect(cadenceEnMots('0 8 32 * *')).toBeNull()
  })
})

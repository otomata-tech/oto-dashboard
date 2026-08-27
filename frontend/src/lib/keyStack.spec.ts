import { describe, it, expect } from 'vitest'
import { isInactiveTeam, rowState, relayOf, relayFor, isHealthKo } from './keyStack'
import type { ConnectorInstance } from '@/types/api'

function inst(p: Partial<ConnectorInstance> & { level: ConnectorInstance['level'] }): ConnectorInstance {
  return {
    ref: `${p.level}:${p.owner?.id ?? 'x'}`,
    connector: 'salesforce',
    name: 'Salesforce',
    owner: { type: p.level === 'member' ? 'user' : p.level, id: 1 },
    ...p,
  } as ConnectorInstance
}

describe('isInactiveTeam', () => {
  it('une clé de MON équipe active est vivante', () => {
    expect(isInactiveTeam(inst({ level: 'group', owner: { type: 'group', id: 7 } }), 7)).toBe(false)
  })
  it("une clé d'une AUTRE équipe est inerte — la cascade ne lit que l'équipe active", () => {
    expect(isInactiveTeam(inst({ level: 'group', owner: { type: 'group', id: 9 } }), 7)).toBe(true)
  })
  it('sans équipe active, toute clé d\'équipe est inerte', () => {
    expect(isInactiveTeam(inst({ level: 'group', owner: { type: 'group', id: 7 } }), null)).toBe(true)
  })
  it('compare les ids en tolérant string vs number (owner.id est typé large)', () => {
    expect(isInactiveTeam(inst({ level: 'group', owner: { type: 'group', id: '7' } }), 7)).toBe(false)
  })
  it('ne concerne que le palier équipe', () => {
    expect(isInactiveTeam(inst({ level: 'org' }), null)).toBe(false)
    expect(isInactiveTeam(inst({ level: 'member' }), null)).toBe(false)
  })
})

describe('rowState', () => {
  it('suspendue prime sur tout', () => {
    expect(rowState(inst({ level: 'member', suspended: true }), 'member', null)).toBe('suspended')
  })
  it('la clé du palier qui résout est « utilisée »', () => {
    expect(rowState(inst({ level: 'member' }), 'member', null)).toBe('used')
  })
  it('une clé plus lointaine est en réserve', () => {
    expect(rowState(inst({ level: 'org' }), 'member', null)).toBe('reserve')
  })
  it("l'équipe inactive n'est PAS « utilisée » même quand le palier équipe résout", () => {
    // Deux clés d'équipe, c'est le palier `group` qui résout : `level` seul ne dit pas
    // laquelle. Sans le test d'équipe active, les deux s'affichaient « utilisée ».
    const active = inst({ level: 'group', owner: { type: 'group', id: 7 } })
    const other = inst({ level: 'group', owner: { type: 'group', id: 9 } })
    expect(rowState(active, 'group', 7)).toBe('used')
    expect(rowState(other, 'group', 7)).toBe('inactive_team')
  })
  it('un prêt nominatif au même palier ne se déclare pas « utilisée »', () => {
    expect(rowState(inst({ level: 'member', via: 'shared_with_me' }), 'member', null)).toBe('reserve')
  })
})

describe('relayOf — ce que le dialog de retrait ANNONCE', () => {
  const member = inst({ level: 'member' })

  it("nomme la clé d'org quand elle prendrait bien la suite", () => {
    const org = inst({ level: 'org' })
    expect(relayOf([member, org], member, null)).toBe(org)
  })
  it('saute une clé suspendue', () => {
    const suspended = inst({ level: 'group', owner: { type: 'group', id: 7 }, suspended: true })
    const org = inst({ level: 'org' })
    expect(relayOf([member, suspended, org], member, 7)).toBe(org)
  })
  it('saute un prêt nominatif (il s\'utilise par épinglage, pas en repli)', () => {
    const lent = inst({ level: 'org', via: 'shared_with_me' })
    expect(relayOf([member, lent], member, null)).toBeNull()
  })
  it("n'annonce PAS une clé d'équipe inactive comme relais", () => {
    // Le bug visé par #75 : cette clé ne résoudra jamais (cascade = équipe active
    // seulement), l'annoncer en relais promet un filet qui n'existe pas.
    const otherTeam = inst({ level: 'group', owner: { type: 'group', id: 9 } })
    expect(relayOf([member, otherTeam], member, 7)).toBeNull()
  })
  it("mais retient bien la clé de l'équipe ACTIVE", () => {
    const myTeam = inst({ level: 'group', owner: { type: 'group', id: 7 } })
    expect(relayOf([member, myTeam], member, 7)).toBe(myTeam)
  })
  it('null quand rien ne prendrait le relais', () => {
    expect(relayOf([member], member, null)).toBeNull()
  })
})

describe('isHealthKo', () => {
  it('marque la clé membre de compte par défaut', () => {
    expect(isHealthKo(inst({ level: 'member' }), true)).toBe(true)
  })
  it("ne marque pas la clé d'org : le backend ne mesure pas sa santé", () => {
    expect(isHealthKo(inst({ level: 'org' }), true)).toBe(false)
  })
  it('ne marque pas une instance membre multi-compte (status_for ne lit que account="")', () => {
    expect(isHealthKo(inst({ level: 'member', account: 'ops@acme.io' }), true)).toBe(false)
  })
  it('ne marque rien quand la santé est bonne', () => {
    expect(isHealthKo(inst({ level: 'member' }), false)).toBe(false)
  })
})

describe('relayFor — multi-compte (oto-dashboard#121)', () => {
  const mine = (account: string) => inst({ level: 'member', ref: `member:${account}`, account })

  it("nomme le compte qui prend la suite quand il n'en reste qu'un", () => {
    const a = mine('otomata'), b = mine('client-x')
    const r = relayFor([a, b], a, null)
    expect(r).toEqual({ kind: 'instance', instance: b })
  })

  it("ne désigne AUCUN relais quand plusieurs comptes restent au même palier — la cascade demande lequel, elle n'en choisit pas un", () => {
    const a = mine('a'), b = mine('b'), c = mine('c')
    expect(relayFor([a, b, c], a, null)).toEqual({ kind: 'ambiguous', count: 2 })
    // …et la vue mince n'invente pas de filet de sécurité.
    expect(relayOf([a, b, c], a, null)).toBeNull()
  })

  it("ne descend pas au palier org tant qu'un compte reste au palier retiré — la cascade ne le ferait pas", () => {
    const a = mine('a'), b = mine('b'), org = inst({ level: 'org' })
    const r = relayFor([a, b, org], a, null)
    expect(r).toEqual({ kind: 'instance', instance: b })
  })

  it('mono-compte : le palier du dessous prend la suite, comme avant', () => {
    const m = inst({ level: 'member' }), org = inst({ level: 'org' })
    expect(relayFor([m, org], m, null)).toEqual({ kind: 'instance', instance: org })
  })

  it('plus rien de vivant : aucun relais', () => {
    const m = inst({ level: 'member' })
    expect(relayFor([m], m, null)).toEqual({ kind: 'none' })
  })

  it('une clé suspendue ou prêtée ne compte pas comme relais', () => {
    const m = inst({ level: 'member' })
    const susp = inst({ level: 'org', suspended: true })
    const lent = inst({ level: 'org', via: 'shared_with_me' })
    expect(relayFor([m, susp, lent], m, null)).toEqual({ kind: 'none' })
  })
})

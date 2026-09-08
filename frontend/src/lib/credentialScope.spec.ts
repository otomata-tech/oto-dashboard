// La PROPRIÉTÉ : un credential part au palier que le connecteur peut accepter.
//
// Ce n'est pas « ce formulaire-là envoie cette valeur-là ». Le palier ne se choisit
// pas à l'écran : il se DÉDUIT de ce que le connecteur déclare (`auth_modes`), comme
// le backend le déduit pour décider s'il accepte la pose. Les deux lectures doivent
// rendre le même verdict, sinon l'écran propose un formulaire que le serveur refuse.
//
// Le cas qui a produit cette règle : `http` (donc TOUS les ponts clients, ADR
// 0003/0037) est `byo_org` sans `byo_user`. Posé au palier membre — le défaut — il
// rend `404 unknown_provider : « Connecteur inconnu : http »`, quoi qu'on saisisse.
import { describe, expect, it } from 'vitest'
import { poseScope } from './credentialScope'

describe('poseScope — le palier se lit sur le connecteur, jamais sur l\'écran', () => {
  // Les formes RÉELLES du registre (mesurées sur GET /api/connectors, prod, 08/09/2026) :
  // 4 connecteurs servis sont `byo_org` SANS `byo_user` — http, resend, scaleway, linear.
  const cas: Array<[string[], 'member' | 'org' | null, string]> = [
    [['byo_user'], 'member', 'clé perso pure (la majorité du catalogue)'],
    [['byo_user', 'byo_org'], 'member', 'le membre peut poser LA SIENNE — elle prime'],
    [['byo_user', 'byo_org', 'platform'], 'member', 'idem, une clé plateforme en dessous'],
    [['byo_org'], 'org', 'http & les ponts clients : rien à poser en son nom propre'],
    [['byo_org', 'platform'], 'org', 'org ou plateforme, jamais le membre'],
    [['platform'], null, 'clé plateforme seule — aucun palier ne se saisit ici'],
    [[], null, 'rien de déclaré'],
  ]
  for (const [modes, attendu, pourquoi] of cas) {
    it(`[${modes.join(',')}] → ${attendu ?? 'aucune pose'} (${pourquoi})`, () => {
      expect(poseScope(modes)).toBe(attendu)
    })
  }

  // ⚠️ Un backend plus ancien peut ne pas servir `auth_modes` (le champ est
  // `Optional` au contrat). On ne DÉTOURNE alors rien : le comportement historique
  // (palier membre) vaut, parce que détourner sur une absence de donnée poserait une
  // clé d'org à qui n'a rien demandé. Le silence ne se lit pas « org ».
  it('sans auth_modes servi, on ne détourne pas : palier membre', () => {
    expect(poseScope(undefined)).toBe('member')
    expect(poseScope(null)).toBe('member')
  })
})

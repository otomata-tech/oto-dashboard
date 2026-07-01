// Lecture DÉCOUVERTE du descripteur d'auth unifié (ADR 0024) — libellés courts
// (chip de carte) et phrase explicative (fiche détail) dérivés de `auth.method`,
// sans branche par nom de connecteur. Distinct du mapping widget de la
// ConnectorCard (qui pilote le rendu du flux) : ici on EXPLIQUE la connexion à
// quelqu'un qui découvre le connecteur.
import type { AuthDescriptor, ConnectorMeta } from '@/types/api'

// Chip courte (grille de la library).
export function authChip(a: AuthDescriptor): string {
  switch (a.method) {
    case 'secret': return a.fields.length > 1 ? `${a.fields.length} champs` : 'clé api'
    case 'oauth': return 'oauth'
    case 'cookie': return 'session'
    case 'hosted': return 'compte hébergé'
    case 'remote': return 'bridge d\'org'
    default: return 'sans clé'
  }
}

// Phrase explicative (fiche détail) : comment on se connecte, concrètement.
export function authExplain(c: ConnectorMeta): string {
  const a = c.auth
  switch (a.method) {
    case 'secret':
      return a.fields.length > 1
        ? `un credential à ${a.fields.length} champs, à renseigner depuis « mes connecteurs ».`
        : 'une clé api à coller depuis « mes connecteurs ».'
    case 'oauth':
      return a.cardinality === 'multi_account'
        ? 'autorisation oauth — connecte un ou plusieurs comptes, aucune clé à copier.'
        : 'autorisation oauth en ton nom — aucune clé à copier.'
    case 'cookie':
      return 'ta session connectée, capturée une fois via une fenêtre de login hébergée (Live View).'
    case 'hosted':
      return 'connexion hébergée chez le fournisseur : tu lies ton compte depuis la carte, la clé d\'accès est résolue en cascade (perso / org / plateforme).'
    case 'remote':
      return 'bridge distant : le credential est posé par ton org (token M2M), rien à configurer côté membre.'
    default:
      return 'open data — aucun credential, les outils marchent directement.'
  }
}

// Qui peut fournir la clé (couche credential, cascade perso > équipe > org > plateforme).
export function authModesExplain(c: ConnectorMeta): string[] {
  const out: string[] = []
  if (c.auth_modes.includes('byo_user')) out.push('ta clé perso (ton compte chez l\'éditeur)')
  if (c.auth_modes.includes('byo_org')) out.push('une clé partagée par ton org ou ton équipe')
  if (c.auth_modes.includes('platform'))
    out.push(c.free_tier
      ? `la clé plateforme oto — gratuit, ${c.free_tier.daily_quota} appels/jour`
      : 'la clé plateforme oto (sur grant admin)')
  return out
}

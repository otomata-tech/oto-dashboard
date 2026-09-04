// Retour OAuth (oto-backend#670) — dérivation PURE query params → toast.
// `?connector=<nom>&connect=connected|error|forbidden` atterrit sur `/connectors`
// pour les 5 connecteurs OAuth. Avant ce lot, un échec de consentement ne disait
// RIEN : le widget retombait en silence sur « not connected », indiscernable d'un
// abandon volontaire — l'utilisateur ne savait pas s'il devait réessayer.
export function oauthReturnToast(connect: unknown, connector: unknown): string | null {
  if (typeof connect !== 'string' || !connect) return null
  const nom = typeof connector === 'string' && connector ? connector : 'ce connecteur'
  if (connect === 'connected') return `${nom} connecté`
  if (connect === 'forbidden') {
    return `connexion à ${nom} refusée — tu n'as plus les droits pour configurer une clé à ce niveau`
  }
  if (connect === 'error') return `connexion à ${nom} échouée — réessaie depuis sa fiche`
  return null   // valeur inconnue : jamais un message inventé sur une cause qu'on ne connaît pas
}

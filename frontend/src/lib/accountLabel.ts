// Résolution d'un compte (sub Logto, ex. `set_by` d'une clé ou d'une version de
// procédure) en un libellé humain — nom, à défaut adresse. Le serveur écrit et sert
// déjà l'identifiant qui a posé le geste ; la correspondance vers un nom se fait ICI,
// contre le roster de membres déjà chargé par l'écran (org.get / group.get, ADR 0023 —
// accessibles à tout membre, pas seulement à un admin).
//
// ⚠️ Le sens du repli n'est pas un détail (oto-dashboard#143) : le nom est la valeur
// NOMINALE, l'identifiant est le cas dégradé — quelqu'un qui a quitté l'org, ou un
// geste de plateforme sans compte associé. Jamais l'inverse.
export interface LabeledAccount {
  sub: string
  name?: string | null
  email?: string | null
}

export function accountLabel(sub: string | null | undefined, members: LabeledAccount[]): string {
  if (!sub) return '—'
  const m = members.find((x) => x.sub === sub)
  return m?.name || m?.email || sub
}

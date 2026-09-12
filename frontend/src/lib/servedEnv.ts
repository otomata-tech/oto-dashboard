// Les domaines AFFICHÉS viennent de l'environnement servi, jamais d'une constante.
//
// ⚠️ oto#193 : la carte MCP écrivait `auth.oto.ninja` et le fil d'Ariane
// « app.oto.ninja » en dur, alors que la prod s'authentifie sur `auth.oto.cx` et se
// sert sur `manage.oto.cx`. Rien ne cassait : l'écran énonçait un fait faux.
//
// - Le domaine d'authentification est celui que le build a reçu (`VITE_LOGTO_ENDPOINT`,
//   injecté par le workflow de préprod ou lu dans `.env.production` au tag) — le même
//   que `useAuth` utilise pour ouvrir la session, donc celui qu'un client MCP verra.
// - Le domaine de la console est l'origine SERVIE : un alias qui redirige
//   (`app.oto.ninja` → `manage.oto.cx`) n'est jamais celui où la page s'exécute.
//
// Aucun repli : une variable absente lève ici plutôt que d'afficher un domaine inventé.

export function authHost(): string {
  return new URL(import.meta.env.VITE_LOGTO_ENDPOINT as string).host
}

export function consoleHost(): string {
  return window.location.host
}

import posthog from 'posthog-js'
import type { Me } from '@/types/api'

// Analytics produit + session replay (PostHog Cloud EU). Optionnel par design :
// sans VITE_POSTHOG_KEY le module est un no-op complet (dev local, ou env non
// configurée) — ce n'est pas un fallback silencieux d'une logique métier, juste
// une intégration opt-in par variable d'env.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
// Domaine d'ingestion EU par défaut (données dans l'UE — cf. compliance RGPD).
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'

let enabled = false

export function initAnalytics(): void {
  if (!KEY) return
  posthog.init(KEY, {
    api_host: HOST,
    // Pageviews SPA pilotés à la main via le router (capturePageview) — sinon
    // seul le 1er chargement serait compté.
    capture_pageview: false,
    // Ne crée de profil de personne que pour les users identifiés (post-login) :
    // pas de profils anonymes parasites, plus propre côté RGPD.
    person_profiles: 'identified_only',
    session_recording: {
      // Dashboard authentifié → masquer les saisies par défaut (clés API,
      // secrets posés dans les formulaires de connecteurs).
      maskAllInputs: true,
    },
  })
  enabled = true
}

// Pageview SPA — à brancher sur router.afterEach (couvre aussi le 1er rendu).
export function capturePageview(): void {
  if (enabled) posthog.capture('$pageview')
}

// Relie la session courante à l'alpha user nommé + propriétés de segmentation
// (rôle plateforme, org active, état d'accès alpha). Idempotent.
export function identifyUser(m: Me): void {
  if (!enabled) return
  posthog.identify(m.sub, {
    email: m.email ?? undefined,
    role: m.role,
    active_org: m.active_org ?? undefined,
    active_org_name: m.active_org_name ?? undefined,
    access_status: m.access?.status,
  })
}

// Au logout : coupe le lien identité ↔ session (sinon la session suivante hérite
// de l'identifiant précédent).
export function resetAnalytics(): void {
  if (enabled) posthog.reset()
}

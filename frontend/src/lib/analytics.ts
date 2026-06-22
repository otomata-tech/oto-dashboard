import posthog from 'posthog-js'
import { ref } from 'vue'
import type { Me } from '@/types/api'

// Analytics produit + session replay (PostHog Cloud EU). Optionnel par design :
// sans VITE_POSTHOG_KEY le module est un no-op complet (dev local, ou env non
// configurée) — ce n'est pas un fallback silencieux d'une logique métier, juste
// une intégration opt-in par variable d'env.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
// Domaine d'ingestion EU par défaut (données dans l'UE — cf. compliance RGPD).
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'

// Consentement RGPD : PostHog démarre 100% éteint (opt-out + replay off) et ne
// capture rien tant que l'utilisateur n'a pas accepté. Décision persistée nous-
// même (localStorage) plutôt que de dépendre de la sémantique interne PostHog.
const CONSENT_KEY = 'oto-analytics-consent'
type Consent = 'granted' | 'denied'
export const consent = ref<Consent | null>(
  (localStorage.getItem(CONSENT_KEY) as Consent | null) ?? null,
)

let enabled = false
let lastMe: Me | null = null

export function analyticsEnabled(): boolean {
  return enabled
}

export function initAnalytics(): void {
  if (!KEY) return
  posthog.init(KEY, {
    api_host: HOST,
    // Pageviews SPA pilotés à la main via le router (capturePageview).
    capture_pageview: false,
    // Le défaut "if_capture_pageview" couperait $pageleave puisque capture_pageview
    // est false → Web Analytics perdrait bounce/durée. On le force.
    capture_pageleave: true,
    // Profil de personne seulement pour les users identifiés (post-login) : pas
    // de profils anonymes parasites, plus propre côté RGPD.
    person_profiles: 'identified_only',
    // Rien ne part tant que pas de consentement explicite.
    opt_out_capturing_by_default: true,
    disable_session_recording: true,
    session_recording: {
      // Dashboard authentifié → masquer les saisies (clés API/secrets des
      // formulaires connecteurs) si le replay est activé après consentement.
      maskAllInputs: true,
    },
  })
  enabled = true
  // Rejoue un consentement déjà accordé lors d'une visite précédente.
  if (consent.value === 'granted') applyOptIn()
}

// Active réellement capture + replay (après consentement). Idempotent.
function applyOptIn(): void {
  posthog.opt_in_capturing()
  posthog.startSessionRecording()
  if (lastMe) identifyUser(lastMe)
  posthog.capture('$pageview') // rattrape le pageview de la page courante
}

export function grantConsent(): void {
  localStorage.setItem(CONSENT_KEY, 'granted')
  consent.value = 'granted'
  if (enabled) applyOptIn()
}

export function denyConsent(): void {
  localStorage.setItem(CONSENT_KEY, 'denied')
  consent.value = 'denied'
  if (enabled) posthog.opt_out_capturing()
}

// Retrait/révision du consentement (RGPD : retirer aussi simple que donner).
// Efface la décision → le bandeau réapparaît ; l'état effectif reste tel quel
// jusqu'au nouveau choix.
export function reopenConsent(): void {
  localStorage.removeItem(CONSENT_KEY)
  consent.value = null
}

// Pageview SPA — branché sur router.afterEach (no-op tant qu'opted-out).
export function capturePageview(): void {
  if (enabled) posthog.capture('$pageview')
}

// Relie la session courante à l'alpha user nommé + propriétés de segmentation
// (rôle plateforme, org active, état d'accès alpha). Mémorise le dernier Me pour
// pouvoir ré-identifier après un consentement donné en cours de session.
export function identifyUser(m: Me): void {
  lastMe = m
  if (enabled) {
    posthog.identify(m.sub, {
      email: m.email ?? undefined,
      role: m.role,
      active_org: m.active_org ?? undefined,
      active_org_name: m.active_org_name ?? undefined,
      access_status: m.access?.status,
    })
  }
}

// Au logout : coupe le lien identité ↔ session (sinon la session suivante hérite
// de l'identifiant précédent).
export function resetAnalytics(): void {
  lastMe = null
  if (enabled) posthog.reset()
}

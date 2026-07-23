<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'
import OtoMark from './OtoMark.vue'
import type { MarkState } from '@/lib/mark'
import { PAGE_META } from '@/lib/consoleNav'
import { useMe } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useTopbar } from '@/composables/useTopbar'
import { useScope } from '@/composables/useScope'
import { useScopedLink } from '@/composables/useScopedLink'

const route = useRoute()
const { t } = useI18n()
const { scoped } = useScopedLink()
const { me, error } = useMe()
const { toggleNav } = useNav()
// Une page peut injecter son propre en-tête (TopbarPage) → on masque alors le
// titre statique générique (fin du double en-tête, retour 8).
const { claimed } = useTopbar()
// `level` est dérivé de la route — il pilote encore le bandeau de gouvernance
// ci-dessous. Le choix du niveau, lui, a migré dans le menu profil (sidebar).
const { level } = useScope()

// Présence d'Oto : la marque vit dans le topbar. Au repos `static` ; pendant le
// chargement du profil (boot), elle passe en `think` (« réfléchit »).
const markState = computed<MarkState>(() => (!me.value && !error.value ? 'think' : 'static'))

// `title`/`crumb` sont des clés i18n (cf. consoleNav) — résolues par `t()` au rendu.
const meta = computed(() =>
  route.meta.detail === 'admin-user'
    ? { title: 'pageMeta.adminUser.title', crumb: 'pageMeta.adminUser.crumb' }
    : route.meta.detail === 'admin-org'
      ? { title: 'pageMeta.adminOrg.title', crumb: 'pageMeta.adminOrg.crumb' }
      : PAGE_META[String(route.meta.section)] ?? PAGE_META['/overview']!)
</script>

<template>
  <header class="topbar">
    <button class="nav-toggle" :aria-label="t('topbar.openMenu')" @click="toggleNav">
      <Icon name="menu" :size="18" />
    </button>
    <RouterLink :to="scoped('/overview')" class="oto-brand" :aria-label="t('topbar.home')">
      <OtoMark variant="mono" :state="markState" :size="26" />
    </RouterLink>
    <div v-show="!claimed" class="topbar-title">
      <h1>{{ t(meta.title) }}</h1>
      <span class="crumb">{{ t(meta.crumb) }}</span>
    </div>
    <!-- Cible de téléportation : une page y injecte son en-tête via TopbarPage. -->
    <div id="topbar-page" class="topbar-page"></div>
  </header>

  <!-- Signal franc réservé au niveau PLATEFORME (action sur TOUTE la plateforme).
       Le niveau org n'affiche plus de bandeau : l'org active est déjà portée par
       l'en-tête d'identité (ConsoleIdentity) — le répéter ici était redondant. -->
  <div v-if="me && level === 'platform'" class="gov-banner platform">
    <Icon name="shield" :size="13" />
    <span>{{ t('topbar.platformBannerPre') }} <strong>{{ t('topbar.platformBannerStrong') }}</strong></span>
  </div>
</template>

<style scoped>
/* Cible d'en-tête de page : occupe la place restante du topbar ; vide (aucune page
   ne l'a prise), elle est invisible et le titre statique s'affiche à côté. */
.topbar-page { flex: 1; display: flex; align-items: center; min-width: 0; }

/* ── Marque Oto (présence au repos / réfléchit au chargement) ── */
.oto-brand {
  display: inline-flex; align-items: center; flex: none;
  margin-right: 4px; text-decoration: none;
}

/* ── Bandeau de gouvernance ── */
.gov-banner {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 18px; font-size: 12px; color: var(--color-ink-soft);
  background: var(--color-saffron-soft);
  border-bottom: 1px solid var(--color-hair);
}
.gov-banner strong { font-weight: 700; color: var(--color-ink); }
.gov-banner.platform {
  color: #7a2e0e;
  background: color-mix(in srgb, var(--color-saffron) 22%, var(--color-surface));
  border-bottom-color: color-mix(in srgb, var(--color-saffron) 45%, var(--color-hair));
}
.gov-banner.platform strong { color: #7a2e0e; }
</style>

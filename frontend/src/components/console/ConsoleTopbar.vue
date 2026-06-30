<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Icon from './Icon.vue'
import OtoMark from './OtoMark.vue'
import type { MarkState } from '@/lib/mark'
import { PAGE_META } from '@/lib/consoleNav'
import { useMe } from '@/composables/useMe'
import { useNav } from '@/composables/useNav'
import { useScope } from '@/composables/useScope'

const route = useRoute()
const { me, error } = useMe()
const { toggleNav } = useNav()
// `level` est dérivé de la route — il pilote encore le bandeau de gouvernance
// ci-dessous. Le choix du niveau, lui, a migré dans le menu profil (sidebar).
const { level } = useScope()

// Présence d'Oto : la marque vit dans le topbar. Au repos `static` ; pendant le
// chargement du profil (boot), elle passe en `think` (« réfléchit »).
const markState = computed<MarkState>(() => (!me.value && !error.value ? 'think' : 'static'))

const meta = computed(() =>
  route.name === 'admin-user'
    ? { title: 'user fiche', crumb: 'plateforme' }
    : PAGE_META[String(route.meta.section)] ?? PAGE_META['/overview']!)
</script>

<template>
  <header class="topbar">
    <button class="nav-toggle" aria-label="ouvrir le menu" @click="toggleNav">
      <Icon name="menu" :size="18" />
    </button>
    <RouterLink to="/overview" class="oto-brand" aria-label="Oto · accueil">
      <OtoMark variant="mono" :state="markState" :size="26" />
    </RouterLink>
    <div class="topbar-title">
      <h1>{{ meta.title }}</h1>
      <span class="crumb">{{ meta.crumb }}</span>
    </div>
  </header>

  <!-- Signal franc : hors « mon espace » on AGIT SUR une org / la plateforme -->
  <div v-if="me && level !== 'work'" class="gov-banner" :class="{ platform: level === 'platform' }">
    <Icon name="shield" :size="13" />
    <template v-if="level === 'platform'">
      administration plateforme — tes actions touchent <strong>toute la plateforme</strong>
    </template>
    <template v-else>
      gouvernance — tu agis sur l'organisation <strong>{{ me.active_org_name || 'Perso (aucune org active)' }}</strong>
    </template>
  </div>
</template>

<style scoped>
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

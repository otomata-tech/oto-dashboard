<script setup lang="ts">
// Shell visuel COMMUN d'une carte connecteur (ADR 0024 §3) — partagé par les cartes
// USER (`ConnectorCard`), ORG (`ConnectorOrgCard`), PLATEFORME (`ConnectorAdminCard`)
// et les tuiles de grille (marketplace, partagés) pour que toutes les surfaces aient
// la même identité visuelle. Porte le chrome (logo + nom + badges + en-tête droit) et
// le conteneur de corps ; chaque consommateur peint SON corps dans le slot par défaut.
import { computed } from 'vue'

const props = defineProps<{
  label: string
  logoUrl?: string | null
  subtitle?: string
  off?: boolean          // carte grisée (état « désactivé »)
  collapsed?: boolean    // masque le corps (ex. connecteur user non sélectionné)
  to?: string | null     // fiche du connecteur : le nom devient un lien (deep-link marketplace)
  clickable?: boolean    // tuile de grille : toute la carte est cliquable (émet `open`)
  fill?: boolean         // tuile de grille : corps en colonne flexible (footer poussé en bas)
}>()
const emit = defineEmits<{ (e: 'open'): void }>()

const monogram = computed(() => (props.label || '?').charAt(0).toUpperCase())
</script>

<template>
  <article class="cc-card" :class="{ off, click: clickable, fill }"
    @click="clickable && emit('open')">
    <header class="cc-head">
      <!-- Logo = cible de clic vers la fiche (grande zone découvrable) quand `to`. -->
      <RouterLink v-if="to" :to="to" class="cc-logo cc-logolink"
        title="ouvrir la fiche du connecteur" @click.stop>
        <img v-if="logoUrl" :src="logoUrl" :alt="label" loading="lazy" />
        <span v-else class="cc-mono">{{ monogram }}</span>
      </RouterLink>
      <div v-else class="cc-logo">
        <img v-if="logoUrl" :src="logoUrl" :alt="label" loading="lazy" />
        <span v-else class="cc-mono">{{ monogram }}</span>
      </div>
      <div class="cc-id">
        <div class="cc-name">
          <RouterLink v-if="to" :to="to" class="cc-namelink"
            title="ouvrir la fiche du connecteur" @click.stop>{{ label }}<span class="cc-open" aria-hidden="true">›</span></RouterLink>
          <template v-else>{{ label }}</template>
          <slot name="badges" />
        </div>
        <div v-if="subtitle" class="cc-pub">{{ subtitle }}</div>
      </div>
      <slot name="header-right" />
    </header>
    <div v-if="!collapsed" class="cc-body"><slot /></div>
  </article>
</template>

<style scoped>
.cc-card { border: 1px solid var(--color-hair); border-radius: 12px; background: var(--color-paper); overflow: hidden; }
.cc-card.off { background: var(--color-surface); opacity: 0.78; }
.cc-card.click { cursor: pointer; transition: border-color 180ms var(--ease-out); }
.cc-card.click:hover { border-color: var(--color-ink-soft); }
.cc-card.fill { display: flex; flex-direction: column; }
.cc-card.fill .cc-body { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.cc-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.cc-logo {
  width: 36px; height: 36px; border-radius: 9px; flex: 0 0 auto; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-hair); background: var(--color-surface);
}
.cc-logo img { width: 100%; height: 100%; object-fit: contain; }
.cc-logolink { cursor: pointer; transition: border-color 180ms var(--ease-out); }
.cc-logolink:hover { border-color: var(--color-ink-soft); }
.cc-mono { font-family: var(--font-mono); font-weight: 700; font-size: 15px; color: var(--color-ink-soft); }
.cc-id { flex: 1; min-width: 0; }
.cc-name { font-weight: 600; font-size: 14px; line-height: 1.2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
/* Affordance PERSISTANTE (pas seulement au survol) : le nom ouvre la fiche —
   soulignement discret + chevron, se renforce au survol. */
.cc-namelink { color: inherit; text-decoration: underline; text-decoration-color: var(--color-hair); text-underline-offset: 2px; cursor: pointer; }
.cc-namelink:hover { text-decoration-color: var(--color-ink-soft); }
.cc-open { color: var(--color-faint); font-weight: 700; margin-left: 1px; transition: color 180ms var(--ease-out); }
.cc-namelink:hover .cc-open { color: var(--color-ink-soft); }
.cc-pub { font-size: 11.5px; color: var(--color-faint); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-body { padding: 0 14px 14px; }
</style>

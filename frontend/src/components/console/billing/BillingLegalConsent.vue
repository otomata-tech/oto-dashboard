<script setup lang="ts">
// DEUXIÈME écran du tunnel (#128) : l'acceptation des documents d'achat.
//
// Les libellés, les versions et les adresses viennent TOUS de la réponse — un
// tenant tiers a ses propres documents, et une version bouge entre deux
// déploiements. Rien n'est écrit en dur ici, pas même le nombre de documents.
//
// UNE case pour l'ensemble : le serveur ne connaît pas d'acceptation partielle du
// contexte `purchase`. Et le consentement est le DERNIER geste avant la page de
// paiement, parce qu'on accepte des CGV *pour un montant* — d'où l'ordre identité →
// montant → consentement.
import { computed, ref } from 'vue'
import Notice from '@/components/console/Notice.vue'
import type { TunnelDoc } from '@/lib/billingTunnel'

const props = defineProps<{
  /** Les documents restant à accepter, dans l'ordre servi. */
  documents: TunnelDoc[]
  busy?: boolean
}>()
const accepted = defineModel<boolean>({ default: false })

// `accepted_version` non nul = déjà accepté, mais sur une version antérieure. Le
// dire évite d'envoyer quelqu'un chercher une case qu'il a bien cochée, sur la
// version d'avant — c'est la première objection du payeur quand une version bouge.
const outdated = computed(() => props.documents.filter((d) => d.accepted_version))
</script>

<template>
  <div class="blc">
    <ul class="blc-docs">
      <li v-for="d in documents" :key="d.slug">
        <a :href="d.url" target="_blank" rel="noopener">{{ d.label }}</a>
        <span class="blc-ver">version {{ d.version }}</span>
        <span v-if="d.accepted_version" class="blc-was">
          vous aviez accepté la version {{ d.accepted_version }}
        </span>
      </li>
    </ul>

    <Notice v-if="outdated.length" tone="info">
      <template v-if="outdated.length === 1">
        Ce document a changé depuis votre acceptation : la version précédente ne vaut
        pas pour la version courante.
      </template>
      <template v-else>
        Ces documents ont changé depuis votre acceptation : les versions précédentes
        ne valent pas pour les versions courantes.
      </template>
    </Notice>

    <label class="blc-consent">
      <input v-model="accepted" type="checkbox" :disabled="busy" />
      <span>J'ai lu et j'accepte ces documents.</span>
    </label>
  </div>
</template>

<style scoped>
.blc { display: flex; flex-direction: column; gap: 12px; }
.blc-docs { display: flex; flex-direction: column; gap: 7px; }
.blc-docs li {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;
  font-size: var(--fs-small); color: var(--color-ink-soft);
}
.blc-docs a { color: var(--color-saffron-ink); text-decoration: underline; font-weight: 600; }
.blc-ver { font-family: var(--font-mono); font-size: 10.5px; color: var(--color-faint); }
.blc-was { font-size: 11.5px; color: var(--color-mute); }
.blc-consent {
  display: flex; align-items: flex-start; gap: 9px; cursor: pointer;
  font-size: var(--fs-small); color: var(--color-ink); line-height: 1.5;
}
.blc-consent input { margin-top: 2px; flex: none; accent-color: var(--color-saffron); }
</style>

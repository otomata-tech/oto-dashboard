<script setup lang="ts">
// Bandeau d'information DANS une carte — l'état qu'il faut lire avant d'agir
// (résiliation programmée, paiement en cours de validation, préalable manquant).
// Extrait des styles locaux de BillingView quand le tunnel de souscription en a
// eu besoin dans quatre composants : un encadré de ce genre se redessinait à
// chaque écran, avec un rayon et un fond un peu différents à chaque fois.
//
// Trois tons, trois sens — jamais décoratif :
//   warn = ce qui demande une action ou un délai · ok = ce qui est acquis ·
//   info = le contexte neutre.
import Icon from './Icon.vue'

withDefaults(defineProps<{ tone?: 'warn' | 'info' | 'ok'; icon?: string }>(),
  { tone: 'info' })
</script>

<template>
  <div class="notice" :class="tone">
    <Icon :name="icon ?? (tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'info')" :size="15" />
    <span><slot /></span>
  </div>
</template>

<style scoped>
.notice {
  display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px;
  border-radius: var(--radius-md); font-size: var(--fs-small); line-height: 1.5;
  text-wrap: pretty;
}
.notice :deep(svg) { flex: none; margin-top: 1px; }
.notice.warn { background: var(--color-terra-soft); color: var(--color-terra-ink); }
.notice.warn :deep(svg) { color: var(--color-terra-ink); }
.notice.ok { background: var(--color-olive-soft); color: var(--color-olive-ink); }
.notice.ok :deep(svg) { color: var(--color-olive-ink); }
.notice.info { background: var(--color-hair-soft); color: var(--color-ink-soft); }
.notice.info :deep(svg) { color: var(--color-mute); }
</style>

<script setup lang="ts">
// Bandeau d'incitation à l'abonnement — décision d'Alexis (09/09/2026) : permanent,
// sur toutes les pages de la console, pour les ADMINS D'ORG seulement. Un membre
// simple ne peut pas souscrire : lui montrer ce bandeau serait une alerte sans levier
// (règle « jamais d'alerte sans levier », docs/conventions.md).
//
// Il se tait, et c'est voulu, dans quatre cas :
//   • l'org est abonnée (`subscribed`) ;
//   • l'org possède déjà quelque chose d'OFFERT (`granted` non vide) — le lot du 02/09
//     a cessé de vendre à qui possède déjà, ce bandeau ne rouvre pas cette porte ;
//   • l'org active est CONSULTÉE par un opérateur (lecture seule) : ce n'est pas la
//     sienne, il n'a rien à souscrire ;
//   • la page courante EST la facturation : le levier y est déjà.
// Le statut vient de `/api/me/billing` (une lecture par org active, rafraîchie quand
// on quitte la page facturation — c'est là qu'une souscription vient d'avoir lieu).
// Un refus du serveur (facturation désactivée, 404) masque le bandeau sans rien
// casser : il n'est pas essentiel à la console, et l'erreur est dite en console.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getBilling } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { useScopedLink } from '@/composables/useScopedLink'
import Icon from './Icon.vue'
import type { BillingStatus } from '@/types/api'

const { t } = useI18n()
const route = useRoute()
const { me } = useMe()
const { scoped } = useScopedLink()

const status = ref<BillingStatus | null>(null)
const loadedFor = ref<string | null>(null)

// La clé de rafraîchissement : l'org active (un changement d'org = un autre statut).
const orgKey = computed(() => String(me.value?.active_org ?? me.value?.sub ?? ''))
const onBilling = computed(() => String(route.meta.section || '') === '/org/billing')
const eligible = computed(() =>
  !!me.value && me.value.org_role === 'org_admin' && me.value.active_org_readonly !== true)

async function load() {
  if (!eligible.value) { status.value = null; return }
  try {
    status.value = await getBilling()
    loadedFor.value = orgKey.value
  } catch (e) {
    status.value = null
    console.warn('[SubscribeBanner] statut de facturation indisponible', e)
  }
}

watch([eligible, orgKey], () => { if (eligible.value && loadedFor.value !== orgKey.value) load() }, { immediate: true })
// Quitter /org/billing : c'est là qu'une souscription vient peut-être d'aboutir.
watch(onBilling, (now, before) => { if (before && !now) load() })

const show = computed(() =>
  eligible.value && !onBilling.value && status.value !== null
  && status.value.subscribed === false && (status.value.granted?.length ?? 0) === 0)
</script>

<template>
  <div v-if="show" class="subscribe-banner" role="status">
    <Icon name="card" :size="13" />
    <span>{{ t('subscribeBanner.text') }}</span>
    <RouterLink :to="scoped('/org/billing')" class="subscribe-banner-cta">{{ t('subscribeBanner.cta') }}</RouterLink>
  </div>
</template>

<style scoped>
.subscribe-banner {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
  padding: 7px 16px; font-size: 13px;
  background: var(--color-saffron-soft); color: var(--color-saffron-ink);
  border-bottom: 1px solid var(--color-hair);
}
.subscribe-banner-cta {
  color: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px;
  border-radius: var(--radius-md); padding: 1px 6px;
}
.subscribe-banner-cta:hover { background: rgba(0, 0, 0, 0.06); }
</style>

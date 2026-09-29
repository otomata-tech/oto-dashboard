<script setup lang="ts">
// Bandeau d'incitation à l'abonnement — décision d'Alexis (09/09/2026) : permanent,
// sur toutes les pages de la console, pour les ADMINS D'ORG seulement. Un membre
// simple ne peut pas souscrire : lui montrer ce bandeau serait une alerte sans levier
// (règle « jamais d'alerte sans levier », docs/conventions.md).
//
// Il se tait, et c'est voulu, dans six cas :
//   • l'org active est PERSONNELLE (`me.active_org_is_personal`, lu par `enOrgPerso`) —
//     décision d'Alexis (29/09/2026) : on ne pousse à s'abonner que dans une org d'équipe ;
//   • l'org a un abonnement (`GET /abonnement` rend un état ; `404 no_subscription` =
//     non abonnée) — un abonnement résilié et échu (`canceled`) compte comme aucun ;
//   • l'org est SOUS CONTRAT, un abonnement réglé hors plateforme (`GET /contrat` ;
//     `404 no_contract` = aucun) tant qu'il court — le commerce refuserait d'ailleurs la
//     souscription (`409 under_contract`). Un contrat clos ne fait plus taire ;
//   • l'org possède déjà quelque chose d'OFFERT — un essai en cours ou un don non échu
//     (`GET /avantages`) : le lot du 02/09 a cessé de vendre à qui possède déjà, ce
//     bandeau ne rouvre pas cette porte ;
//   • l'org active est CONSULTÉE par un opérateur (lecture seule), ou vue « en tant
//     que » : ce n'est pas la sienne, il n'a rien à souscrire ;
//   • la page courante EST la facturation : le levier y est déjà.
// L'état vient d'oto-commerce, pour l'org du chemin (une lecture par org active,
// rafraîchie quand on quitte la page facturation — c'est là qu'une souscription vient
// d'avoir lieu). Un membre simple ne déclenche aucun appel. Un refus du commerce (org
// d'un tenant tiers, commerce absent de la config) masque le bandeau sans rien casser :
// il n'est pas essentiel à la console, et l'erreur est dite en console.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getAbonnement, getAvantages, getContrat } from '@/api/console'
import { useMe, canWriteInOrg } from '@/composables/useMe'
import { useScopedLink } from '@/composables/useScopedLink'
import { contratEnCours, enCours } from '@/lib/billingTunnel'
import { enOrgPerso } from '@/lib/orgPerso'
import { getViewUser } from '@/lib/viewOrg'
import Icon from './Icon.vue'

const { t } = useI18n()
const route = useRoute()
const { me } = useMe()
const { scoped } = useScopedLink()

// `true` = rien ne s'y vend (abonnée, sous contrat, ou dotée) ; `false` = le bandeau a lieu d'être ;
// `null` = pas encore lu, ou illisible.
const covered = ref<boolean | null>(null)
const loadedFor = ref<number | null>(null)

// La clé de rafraîchissement : l'org active (un changement d'org = un autre état).
const orgId = computed(() => me.value?.active_org ?? null)
const onBilling = computed(() => String(route.meta.section || '') === '/org/billing')
// Hors consultation ET hors « voir en tant que » : la règle unique d'écriture (oto#211/#212)
// — et le commerce, qui relit le rôle du porteur du jeton, n'ouvrirait de toute façon
// l'état qu'à l'org_admin réel.
// Une org perso n'est pas visée (décision du 29/09) : aucun appel non plus.
const eligible = computed(() =>
  !!me.value && me.value.org_role === 'org_admin' && canWriteInOrg(me.value) && !getViewUser()
  && !enOrgPerso(me.value))

async function load() {
  const id = orgId.value
  if (!eligible.value || id == null) { covered.value = null; return }
  try {
    const [ab, ct, av] = await Promise.all([getAbonnement(id), getContrat(id), getAvantages(id)])
    // Un contrat, un essai ou un don ÉCHU ne couvre plus : il ne fait plus taire le bandeau.
    const abonnee = !!ab && ab.statut !== 'canceled'
    covered.value = abonnee || contratEnCours(ct)
      || (!!av.essai && enCours(av.essai.fin)) || av.dons.some((d) => enCours(d.fin))
    loadedFor.value = id
  } catch (e) {
    covered.value = null
    console.warn('[SubscribeBanner] état de facturation indisponible', e)
  }
}

watch([eligible, orgId], () => { if (eligible.value && loadedFor.value !== orgId.value) load() }, { immediate: true })
// Quitter /org/billing : c'est là qu'une souscription vient peut-être d'aboutir.
watch(onBilling, (now, before) => { if (before && !now) load() })

const show = computed(() => eligible.value && !onBilling.value && covered.value === false)
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

<script setup lang="ts">
// Gate d'acceptation à l'inscription (contexte 'access' = CGU). Overlay bloquant
// affiché au premier accès tant que l'utilisateur n'a pas accepté les documents
// requis à leur version courante — et re-affiché si une version évolue
// (le backend recalcule le reste-à-accepter). L'achat a sa propre gate (BillingView),
// enforcée côté serveur ; celle-ci trace le consentement d'accès.
import { computed, onMounted, ref } from 'vue'
import { getLegal, acceptLegal, type LegalStatus } from '@/api/console'

const status = ref<LegalStatus | null>(null)
const accepted = ref(false)
const busy = ref(false)

const outstanding = computed(() => status.value?.contexts?.access?.outstanding ?? [])
const docs = computed(() => {
  const set = new Set(outstanding.value)
  return (status.value?.documents ?? []).filter((d) => set.has(d.slug))
})
const show = computed(() => outstanding.value.length > 0)

async function load() {
  // Silencieux : si l'appel échoue, pas de gate (on ne bloque pas l'accès sur une
  // erreur réseau — l'obligation dure est côté achat).
  try { status.value = await getLegal() } catch { /* no-op */ }
}

async function accept() {
  if (!accepted.value || busy.value) return
  busy.value = true
  try { status.value = await acceptLegal('access') } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <div v-if="show" class="legal-gate" role="dialog" aria-modal="true" aria-label="acceptation des conditions">
    <section class="card legal-gate__card">
      <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px" aria-label="Oto" role="img" />
      <div>
        <h2>Avant de continuer</h2>
        <p class="helptext" style="margin: 4px 0 0">Merci d'accepter nos conditions pour utiliser oto.</p>
      </div>
      <label class="legal-gate__consent">
        <input type="checkbox" v-model="accepted" />
        <span>
          j'ai lu et j'accepte
          <template v-for="(d, i) in docs" :key="d.slug"><a :href="d.url" target="_blank" rel="noopener">{{ d.label }}</a><span v-if="i < docs.length - 1"> · </span></template>.
        </span>
      </label>
      <button class="btn" :disabled="!accepted || busy" @click="accept">Accepter et continuer</button>
    </section>
  </div>
</template>

<style scoped>
.legal-gate {
  position: fixed; inset: 0; z-index: var(--z-banner);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: color-mix(in srgb, var(--color-ink) 45%, transparent);
  backdrop-filter: blur(3px);
}
.legal-gate__card {
  max-width: 420px; width: 100%; text-align: center;
  padding: 30px 26px; display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.legal-gate h2 { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.legal-gate__consent {
  display: flex; align-items: flex-start; gap: 9px; text-align: left;
  font-size: 13px; color: var(--color-ink-soft); line-height: 1.5; cursor: pointer;
}
.legal-gate__consent input { margin-top: 2px; flex: none; accent-color: var(--color-saffron, #d97706); }
.legal-gate__consent a { color: var(--color-saffron-ink, #b45309); text-decoration: underline; }
</style>

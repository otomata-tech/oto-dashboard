<script setup lang="ts">
// Émettre une facture EN ATTENTE (`held`), côté admin plateforme (oto-commerce#3).
//
// Tout encaissement laisse une facture `held` : montants et période, ni numéro ni PDF. Le
// commerce ne crée aucune pièce chez l'outil comptable — l'admin l'y établit, puis pose
// ici son numéro, sa date d'émission et son PDF (`PUT /api/admin/orgs/{id}/factures/{id}`).
// La facture passe `issued` et devient téléchargeable par l'org_admin.
//
// Le commerce rend la liste RELUE : on la remonte telle quelle (`issued`), sans relire
// l'état entier. Un refus se dit par son code traduit (`errors.<code>`), et le formulaire
// garde sa saisie pour qu'on corrige sans tout reprendre.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Btn from './Btn.vue'
import { adminEmettreFacture } from '@/api/console'
import { useToast } from '@/composables/useToast'
import { fichierEnBase64 } from '@/lib/fichierBase64'
import { humanize } from '@/lib/errors'
import type { CommerceFacture } from '@/types/api.commerce'

const props = defineProps<{ orgId: number; facture: CommerceFacture }>()
const emit = defineEmits<{ issued: [factures: CommerceFacture[]] }>()

const { t } = useI18n()
const { toast } = useToast()

// La date du jour, LOCALE (AAAA-MM-JJ) : celle que l'admin lit sur son calendrier.
function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const numero = ref('')
const emiseLe = ref(aujourdhui())
const fichier = ref<File | null>(null)
const busy = ref(false)

const pret = computed(() => !busy.value && numero.value.trim() !== '' && !!fichier.value)

function choisir(e: Event) {
  fichier.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function emettre() {
  const f = fichier.value
  if (!f) return
  busy.value = true
  try {
    const { factures } = await adminEmettreFacture(props.orgId, props.facture.id, {
      numero: numero.value.trim(),
      ...(emiseLe.value ? { emise_le: emiseLe.value } : {}),
      pdf_base64: await fichierEnBase64(f),
      pdf_nom: f.name,
    })
    toast(t('billingUi.admin.invoiceIssued'))
    emit('issued', factures)
  } catch (e) {
    toast(humanize(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="afe" @submit.prevent="emettre">
    <input v-model="numero" class="inp sm mono afe-num" type="text" :disabled="busy"
      :aria-label="t('billingUi.admin.invoiceNumberField')" :placeholder="t('billingUi.admin.invoiceNumberField')" />
    <input v-model="emiseLe" class="inp sm" type="date" :disabled="busy"
      :aria-label="t('billingUi.admin.invoiceDateField')" />
    <input class="afe-file" type="file" accept="application/pdf,.pdf" :disabled="busy"
      :aria-label="t('billingUi.admin.invoicePdfField')" @change="choisir" />
    <Btn kind="mini" icon="check" type="submit" :disabled="!pret">{{ t('billingUi.admin.issueInvoice') }}</Btn>
  </form>
</template>

<style scoped>
.afe { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.afe-num { width: 140px; }
.afe-file { font-size: 11.5px; max-width: 220px; }
</style>

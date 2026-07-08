<script setup lang="ts">
// « Paramètres » de l'org active (/org/settings) : profil (nom/logo/domaine/secteur/lieu),
// entitlements (lecture), et zone danger (archivage réversible). Extrait de l'ancienne page
// « membres » empilée. Le readme socle vit sur « contexte », la MFA sur « sécurité ».
import { computed, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Avatar from '@/components/console/Avatar.vue'
import Dropzone from '@/components/console/Dropzone.vue'
import FormDialog from '@/components/console/FormDialog.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useFormDialog } from '@/composables/useFormDialog'
import { useMe } from '@/composables/useMe'
import { useOrgScope } from '@/composables/useOrgScope'
import { uploadOrgLogo, deleteOrgLogo, updateOrg, archiveOrg } from '@/api/console'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { reload: reloadMe } = useMe()
const { activeOrgId, detail, error, loaded, isOrgAdmin, reload } = useOrgScope()

const logoBusy = ref(false)
const isPersonalOrg = computed(() => detail.value?.org.personal === true)

function editOrg() {
  if (activeOrgId.value == null) return
  openForm({
    title: 'edit organization',
    submitLabel: 'save',
    fields: [
      { key: 'name', label: 'name', initial: detail.value?.org.name ?? '', required: true },
      { key: 'description', label: 'description', type: 'textarea',
        placeholder: 'what this org is for (optional)', initial: detail.value?.org.description ?? '' },
      { key: 'domain', label: 'domain', placeholder: 'acme.com',
        hint: 'your company domain — also fetches your logo automatically (logo.dev) when none is uploaded',
        initial: detail.value?.org.domain ?? '' },
      { key: 'industry', label: 'industry', placeholder: 'e.g. software, accounting, retail (optional)',
        initial: detail.value?.org.industry ?? '' },
      { key: 'location', label: 'location', placeholder: 'e.g. Paris, France (optional)',
        initial: detail.value?.org.location ?? '' },
    ],
    onConfirm: async (v) => {
      try {
        await updateOrg(activeOrgId.value!, {
          name: (v.name ?? '').trim(), description: v.description ?? '',
          domain: (v.domain ?? '').trim(), industry: (v.industry ?? '').trim(),
          location: (v.location ?? '').trim(),
        })
        await reload()
        await reloadMe()          // rafraîchit nom + logo dans le badge identité (sidebar)
        toast('organization updated')
      } catch (e) { toast(humanize(e)); throw e }
    },
  })
}

async function onLogoDrop(file: File) {
  if (activeOrgId.value == null) return
  try {
    validateImage(file) // miroir backend (png/jpeg/webp ≤ 2 Mo) — le Dropzone pré-valide déjà
    logoBusy.value = true
    await uploadOrgLogo(activeOrgId.value, file)
    await reload()
    await reloadMe()          // rafraîchit le logo dans le badge identité (topbar)
    toast('org logo updated')
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}
async function removeLogo() {
  if (activeOrgId.value == null) return
  if (!await confirmAction({ title: 'remove org logo', danger: true, confirmLabel: 'remove', message: 'remove this organization logo?' })) return
  try {
    logoBusy.value = true
    await deleteOrgLogo(activeOrgId.value)
    await reload()
    await reloadMe()
    toast('org logo removed')
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}

// Suppression (archivage réversible) de l'org — org_admin, jamais l'espace perso.
async function deleteOrg() {
  if (activeOrgId.value == null) return
  const label = detail.value?.org.name || 'this org'
  if (!await confirmAction({ title: 'supprimer l\'organisation', danger: true, confirmLabel: 'supprimer',
    message: `supprimer « ${label} » ? elle disparaît pour tous ses membres, qui retombent sur leurs autres espaces. les données sont conservées et un admin oto peut la restaurer.` })) return
  try {
    await archiveOrg(activeOrgId.value)
    await reloadMe()            // l'org active a rebasculé → rafraîchit le badge identité
    toast('organisation supprimée')
    // Repart d'un contexte propre (la vue est scopée sur l'org active, désormais changée).
    window.location.assign('/console')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" title="no active org">
      <div class="helptext">you're not in an organization yet.</div>
    </ConsoleCard>

    <template v-else>
      <ConsoleCard title="general" sub="name, logo, description and company profile of your active org.">
        <template v-if="isOrgAdmin" #actions>
          <Btn kind="mini" icon="pen" @click="editOrg">edit</Btn>
        </template>
        <div class="rowlist">
          <div>
            <div style="display: flex; align-items: center; gap: 10px">
              <Avatar :src="detail?.org.logo_url" :name="detail?.org.name" :size="34" shape="square" />
              <div>
                <div style="font-weight: 600; font-size: 15px; color: var(--color-ink)">{{ detail?.org.name }}</div>
                <div v-if="detail?.org.domain || detail?.org.industry || detail?.org.location"
                  style="font-size: 11.5px; color: var(--color-faint); display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 2px">
                  <a v-if="detail?.org.domain" :href="`https://${detail.org.domain}`" target="_blank" rel="noopener"
                    style="color: var(--color-mute); text-decoration: underline; text-underline-offset: 2px">{{ detail.org.domain }}</a>
                  <span v-if="detail?.org.industry">{{ detail.org.industry }}</span>
                  <span v-if="detail?.org.location">{{ detail.org.location }}</span>
                </div>
              </div>
            </div>
            <div v-if="detail?.org.description" style="font-size: 12.5px; color: var(--color-mute); margin-top: 8px; white-space: pre-wrap">{{ detail.org.description }}</div>
            <div v-else class="helptext" style="margin-top: 8px">
              {{ isOrgAdmin ? 'no description yet — add one to tell teammates what this org is for.' : 'no description.' }}
            </div>
          </div>

          <!-- Logo : dérivé du domaine (logo.dev) par défaut, upload = override. -->
          <div v-if="isOrgAdmin" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
            <div v-if="!detail?.org.logo_custom && detail?.org.domain && detail?.org.logo_url" class="helptext" style="margin-bottom: 8px">
              logo dérivé de <strong>{{ detail.org.domain }}</strong> (logo.dev) — dépose-en un pour le remplacer.
            </div>
            <div v-else-if="!detail?.org.logo_url" class="helptext" style="margin-bottom: 8px">
              aucun logo — renseigne un domaine dans « edit » pour le récupérer automatiquement, ou dépose-en un.
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <Dropzone :accept="IMAGE_ACCEPT_ATTR" :max-size-mb="2" :busy="logoBusy"
                :label="detail?.org.logo_custom ? 'changer le logo' : 'déposer un logo'"
                hint="png, jpeg ou webp · max 2 Mo"
                @select="onLogoDrop" @error="toast" />
              <Btn v-if="detail?.org.logo_custom" kind="danger" :disabled="logoBusy" @click="removeLogo">remove logo</Btn>
            </div>
          </div>

          <!-- Zone danger : archivage réversible de l'org (jamais l'espace perso). -->
          <div v-if="isOrgAdmin && !isPersonalOrg" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap">
              <div class="helptext" style="margin: 0">
                supprime cet espace pour tous ses membres — réversible par un admin oto, données conservées.
              </div>
              <Btn kind="danger" @click="deleteOrg">supprimer l'organisation</Btn>
            </div>
          </div>
        </div>
      </ConsoleCard>

      <ConsoleCard v-if="detail?.entitlements?.length" title="entitlements" sub="controlled namespaces unlocked for this org.">
        <div class="rowlist">
          <div v-for="e in detail.entitlements" :key="e.namespace" class="rowitem">
            <Tag tone="cobalt">{{ e.namespace }}</Tag>
            <span style="margin-left: auto; font-size: 11px; color: var(--color-faint)">{{ fmtDate(e.granted_at) }}</span>
          </div>
        </div>
      </ConsoleCard>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

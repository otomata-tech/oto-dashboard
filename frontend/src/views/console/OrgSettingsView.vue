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
import { uploadOrgLogo, deleteOrgLogo, updateOrg, archiveOrg, leaveOrg } from '@/api/console'
import { fmtDate } from '@/types/api'
import { humanize } from '@/lib/errors'
import { validateImage, IMAGE_ACCEPT_ATTR } from '@/lib/imageUpload'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { formDialog, formDialogOpen, openForm } = useFormDialog()
const { reload: reloadMe } = useMe()
// Gestes : `canAdminister` (profil, logo, supprimer) et `canWrite` (quitter) — le rôle, hors
// consultation, où le serveur refuse toute écriture (oto#211).
const { activeOrgId, detail, error, loaded, canWrite, canAdminister, reload } = useOrgScope()

const logoBusy = ref(false)
const isPersonalOrg = computed(() => detail.value?.org.personal === true)

function editOrg() {
  if (activeOrgId.value == null) return
  openForm({
    title: t('orgUi.settings.editTitle'),
    submitLabel: t('orgUi.settings.save'),
    fields: [
      { key: 'name', label: t('orgUi.settings.name'), initial: detail.value?.org.name ?? '', required: true },
      { key: 'description', label: t('orgUi.settings.description'), type: 'textarea',
        placeholder: t('orgUi.settings.descPlaceholder'), initial: detail.value?.org.description ?? '' },
      { key: 'domain', label: t('orgUi.settings.domain'), placeholder: 'acme.com',
        hint: t('orgUi.settings.domainHint'),
        initial: detail.value?.org.domain ?? '' },
      { key: 'industry', label: t('orgUi.settings.industry'), placeholder: t('orgUi.settings.industryPlaceholder'),
        initial: detail.value?.org.industry ?? '' },
      { key: 'location', label: t('orgUi.settings.location'), placeholder: t('orgUi.settings.locationPlaceholder'),
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
        toast(t('orgUi.settings.updated'))
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
    toast(t('orgUi.settings.logoUpdated'))
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}
async function removeLogo() {
  if (activeOrgId.value == null) return
  if (!await confirmAction({ title: t('orgUi.settings.removeLogoTitle'), danger: true, confirmLabel: t('orgUi.settings.remove'), message: t('orgUi.settings.removeLogoMessage') })) return
  try {
    logoBusy.value = true
    await deleteOrgLogo(activeOrgId.value)
    await reload()
    await reloadMe()
    toast(t('orgUi.settings.logoRemoved'))
  } catch (err) { toast(humanize(err)) }
  finally { logoBusy.value = false }
}

// Quitter l'org — auto-retrait (TOUT membre, pas seulement admin), jamais l'espace perso.
// Le backend refuse si on est le dernier admin (409 → toast). L'org active bascule côté
// serveur ; on recharge en dur pour reconstruire identité/sidebar sur la nouvelle org.
async function leave() {
  if (activeOrgId.value == null) return
  const label = detail.value?.org.name || t('orgUi.settings.thisOrg')
  if (!await confirmAction({ title: t('orgUi.settings.leaveTitle'), danger: true, confirmLabel: t('orgUi.settings.leave'),
    message: t('orgUi.settings.leaveMessage', { name: label }) })) return
  try {
    await leaveOrg(activeOrgId.value)
    await reloadMe()
    toast(t('orgUi.settings.left'))
    window.location.assign('/overview')   // repart propre sur la nouvelle org active
  } catch (e) { toast(humanize(e)) }
}

// Suppression (archivage réversible) de l'org — org_admin, jamais l'espace perso.
async function deleteOrg() {
  if (activeOrgId.value == null) return
  const label = detail.value?.org.name || t('orgUi.settings.thisOrg')
  if (!await confirmAction({ title: t('orgUi.settings.deleteTitle'), danger: true, confirmLabel: t('orgUi.settings.delete'),
    message: t('orgUi.settings.deleteMessage', { name: label }) })) return
  try {
    await archiveOrg(activeOrgId.value)
    await reloadMe()            // l'org active a rebasculé → rafraîchit le badge identité
    toast(t('orgUi.settings.deleted'))
    // Repart d'un contexte propre (la vue est scopée sur l'org active, désormais changée).
    window.location.assign('/console')
  } catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" :title="t('orgUi.settings.noOrg')">
      <div class="helptext">{{ t('orgUi.settings.noOrgHelp') }}</div>
    </ConsoleCard>

    <template v-else>
      <ConsoleCard :title="t('orgUi.settings.general')" :sub="t('orgUi.settings.generalSub')">
        <template v-if="canAdminister" #actions>
          <Btn kind="mini" icon="pen" @click="editOrg">{{ t('orgUi.settings.edit') }}</Btn>
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
              {{ canAdminister ? t('orgUi.settings.noDescAdmin') : t('orgUi.settings.noDesc') }}
            </div>
          </div>

          <!-- Logo : dérivé du domaine (logo.dev) par défaut, upload = override. -->
          <div v-if="canAdminister" style="border-top: 1px solid var(--color-hair); padding-top: 12px">
            <div v-if="!detail?.org.logo_custom && detail?.org.domain && detail?.org.logo_url" class="helptext" style="margin-bottom: 8px">
              <i18n-t keypath="orgUi.settings.logoDerived" tag="span"><template #domain><strong>{{ detail.org.domain }}</strong></template></i18n-t>
            </div>
            <div v-else-if="!detail?.org.logo_url" class="helptext" style="margin-bottom: 8px">
              {{ t('orgUi.settings.noLogo') }}
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <Dropzone :accept="IMAGE_ACCEPT_ATTR" :max-size-mb="2" :busy="logoBusy"
                :label="detail?.org.logo_custom ? t('orgUi.settings.changeLogo') : t('orgUi.settings.uploadLogo')"
                :hint="t('orgUi.settings.logoHint')"
                @select="onLogoDrop" @error="toast" />
              <Btn v-if="detail?.org.logo_custom" kind="danger" :disabled="logoBusy" @click="removeLogo">{{ t('orgUi.settings.remove') }}</Btn>
            </div>
          </div>
        </div>
      </ConsoleCard>

      <ConsoleCard v-if="detail?.entitlements?.length" :title="t('orgUi.settings.unlocked')" :sub="t('orgUi.settings.unlockedSub')">
        <div class="rowlist">
          <div v-for="e in detail.entitlements" :key="e.namespace" class="rowitem">
            <Tag tone="cobalt">{{ e.namespace }}</Tag>
            <span style="margin-left: auto; font-size: 11px; color: var(--color-faint)">{{ fmtDate(e.granted_at) }}</span>
          </div>
        </div>
      </ConsoleCard>

      <!-- Zone danger : gestes irréversibles/destructifs regroupés (jamais sur l'espace perso).
           quitter = self-service tout membre · supprimer (archivage réversible) = org_admin.
           En consultation, aucun des deux : la carte part avec eux (oto#211). -->
      <ConsoleCard v-if="detail && !isPersonalOrg && canWrite" class="danger-zone" :title="t('orgUi.settings.danger')"
        :sub="t('orgUi.settings.dangerSub')">
        <div class="dz-list">
          <!-- Quitter : tout membre, refusé si dernier admin (409 backend). -->
          <div class="dz-row">
            <div class="dz-txt">
              <div class="dz-t">{{ t('orgUi.settings.leaveTitle') }}</div>
              <div class="helptext" style="margin: 0">
                {{ t('orgUi.settings.leaveHelp') }}
              </div>
            </div>
            <Btn kind="danger" @click="leave">{{ t('orgUi.settings.leave') }}</Btn>
          </div>
          <!-- Supprimer (= archivage réversible) : réservé aux admins de l'org. -->
          <div v-if="canAdminister" class="dz-row">
            <div class="dz-txt">
              <div class="dz-t">{{ t('orgUi.settings.deleteTitle') }}</div>
              <div class="helptext" style="margin: 0">
                {{ t('orgUi.settings.deleteHelp') }}
              </div>
            </div>
            <Btn kind="danger" @click="deleteOrg">{{ t('orgUi.settings.delete') }}</Btn>
          </div>
        </div>
      </ConsoleCard>
    </template>

    <FormDialog v-if="formDialog" v-model:open="formDialogOpen"
      :title="formDialog.title" :description="formDialog.description"
      :fields="formDialog.fields" :submit-label="formDialog.submitLabel" :on-confirm="formDialog.onConfirm" />
  </div>
</template>

<style scoped>
/* Zone danger : identité visuelle terra (bordure + titre) qui signale les gestes destructifs. */
.danger-zone { border-color: var(--color-terra-soft); }
.danger-zone :deep(.card-head .t) { color: var(--color-terra-ink); }
.dz-list { display: flex; flex-direction: column; }
.dz-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  padding: 12px 0; border-bottom: 1px solid var(--color-hair);
}
.dz-row:first-child { padding-top: 0; }
.dz-row:last-child { padding-bottom: 0; border-bottom: 0; }
.dz-txt { flex: 1; min-width: 220px; }
.dz-t { font-weight: 600; font-size: 13.5px; color: var(--color-ink); margin-bottom: 3px; }
</style>

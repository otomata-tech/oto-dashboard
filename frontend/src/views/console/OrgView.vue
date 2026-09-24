<script setup lang="ts">
// « Membres » de l'org active (/org, racine du scope org). UNE page = UN sujet : ici les
// gens (membres + invitations en attente). Profil/logo/entitlements/danger vivent sur
// « paramètres », la MFA sur « sécurité », le readme sur « contexte », les clés partagées
// sur « connecteurs ». Le backend porte l'autz ; les gestes suivent `canAdminister` (le rôle,
// hors consultation — oto#211) ; l'admin qui consulte l'org lit membres et invitations.
// Les invitations vivent dans la carte partagée `InvitationsCard` (feature cascade — même
// carte au niveau org / équipe / plateforme).
import { computed } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Dot from '@/components/console/Dot.vue'
import Tag from '@/components/console/Tag.vue'
import Avatar from '@/components/console/Avatar.vue'
import InvitationsCard from '@/components/console/InvitationsCard.vue'
import Btn from '@/components/console/Btn.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useOrgScope } from '@/composables/useOrgScope'
import { setOrgMemberRole, removeOrgMember } from '@/api/console'
import { humanize } from '@/lib/errors'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { toast } = useToast()
const { confirmAction } = usePrompt()

const { activeOrgId, meSub, detail, error, loaded, isOrgAdmin, canAdminister, reload } = useOrgScope()

const HOME_ORG_HINT = computed(() => t('orgUi.members.homeHint'))
const PAUSED_HINT = computed(() => t('orgUi.members.pausedHint'))

async function toggleRole(sub: string, role: string) {
  const next = role === 'org_admin' ? 'org_member' : 'org_admin'
  try { await setOrgMemberRole(activeOrgId.value!, sub, next); toast(t('orgUi.members.roleUpdated')); await reload() }
  catch (e) { toast(humanize(e)) }
}
async function removeMember(sub: string, label: string) {
  if (!await confirmAction({ title: t('orgUi.members.removeTitle'), danger: true, confirmLabel: t('orgUi.members.remove'),
    message: t('orgUi.members.removeMessage', { name: label }) })) return
  try { await removeOrgMember(activeOrgId.value!, sub); toast(t('orgUi.members.removed')); await reload() }
  catch (e) { toast(humanize(e)) }
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <ConsoleCard v-if="loaded && activeOrgId == null" :title="t('orgUi.members.noOrg')">
      <div class="helptext">{{ t('orgUi.members.noOrgHelp') }}</div>
    </ConsoleCard>

    <template v-else>
      <ConsoleCard :title="t('orgUi.members.title')" flush :sub="t('orgUi.members.sub')">
        <table class="tbl">
          <!-- « active » était un faux ami : il dit que CETTE org est l'org MAISON du
               membre, pas que son compte est en état — quelqu'un de parfaitement
               opérationnel y est `false` dès qu'il travaille par défaut ailleurs. Le
               serveur le signale dans son propre schéma. Poser le marqueur de pause à
               côté d'une colonne qui se lit « actif » aurait rendu la ligne illisible :
               un membre en pause dont c'est l'org maison y aurait été « actif » ET
               « en pause ». -->
          <thead><tr><th>{{ t('orgUi.members.member') }}</th><th>{{ t('orgUi.members.role') }}</th><th :title="HOME_ORG_HINT">{{ t('orgUi.members.homeOrg') }}</th><th v-if="canAdminister" style="width: 150px"></th></tr></thead>
          <tbody>
            <tr v-for="m in detail?.members ?? []" :key="m.sub">
              <td>
                <div style="display: flex; align-items: center; gap: 9px">
                  <Avatar :src="m.avatar_url" :name="m.name || m.email" :size="28" />
                  <div>
                    <div style="font-weight: 600; color: var(--color-ink)">
                      {{ m.name || m.email }}
                      <!-- Compte mis en pause (oto-backend, 03/09) : la fonction se
                           pilotait par appel, sans aucun écran. Un membre en pause
                           RESTE dans la liste, marqué — le retirer détruirait une
                           appartenance qu'on a justement choisi de garder, et
                           laisserait un admin devant des documents signés par
                           quelqu'un qui n'apparaît plus nulle part. -->
                      <Tag v-if="m.suspended" tone="terra" :title="PAUSED_HINT">{{ t('orgUi.members.paused') }}</Tag>
                    </div>
                    <div style="font-size: 11px; color: var(--color-faint)">{{ m.email }}</div>
                  </div>
                </div>
              </td>
              <td><Tag v-if="m.role === 'org_admin'" tone="ink">{{ t('orgUi.members.admin') }}</Tag><Tag v-else>{{ t('orgUi.members.member') }}</Tag></td>
              <td><Dot :tone="m.active ? 'olive' : 'faint'" :size="7" /></td>
              <td v-if="canAdminister" style="text-align: right">
                <div v-if="m.sub !== meSub" style="display: flex; gap: 6px; justify-content: flex-end">
                  <Btn kind="mini" @click="toggleRole(m.sub, m.role)">{{ m.role === 'org_admin' ? t('orgUi.members.demote') : t('orgUi.members.promote') }}</Btn>
                  <Btn kind="danger" @click="removeMember(m.sub, m.name || m.email || t('orgUi.members.thisMember'))">{{ t('orgUi.members.remove') }}</Btn>
                </div>
                <span v-else class="dim" style="font-size: 11px">{{ t('orgUi.members.you') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </ConsoleCard>

      <InvitationsCard v-if="activeOrgId != null && isOrgAdmin"
        :scope="{ level: 'org', id: activeOrgId }" :can-read="isOrgAdmin" :can-manage="canAdminister" />
    </template>
  </div>
</template>

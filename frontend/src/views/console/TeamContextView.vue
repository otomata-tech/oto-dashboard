<script setup lang="ts">
// « ce que voit l'agent · équipe » (scope team, /team/context) — pendant équipe de
// ContextOrgView. Le readme de l'équipe est injecté à chaque session de ses membres,
// APRÈS celui de l'org, avant celui de chaque membre. Pas de carte guides d'équipe ici :
// les procédures d'équipe vivent sur /team/procedures.
import AgentReadmeCard from '@/components/console/AgentReadmeCard.vue'
import TeamScopeHeader from '@/components/console/TeamScopeHeader.vue'
import { useTeamScope } from '@/composables/useTeamScope'
import { getInitGuide, setInitGuide } from '@/api/console'

const { groupId, detail, error, loaded, canManage } = useTeamScope()

// Le readme d'équipe = un guide `delivery=init` au scope group (ADR 0042), ciblé par
// l'id de la route — PAS l'équipe active en session, qui peut être une autre. `load` est
// onMounted-only ⇒ la carte est keyée sur groupId (remount à chaque changement d'équipe).
const loadReadme = () => getInitGuide('group', groupId.value as number)
const saveReadme = (body: string) => setInitGuide('group', body, groupId.value as number)
</script>

<template>
  <TeamScopeHeader :detail="detail" :loaded="loaded" :error="error" :group-id="groupId" v-slot="{ detail: d }">
    <header class="ctx-intro">
      <h2 class="ctx-h1">ce que voit l'agent · équipe {{ d.group.name }}</h2>
      <p class="ctx-lead">
        la prose injectée au début de chaque session des membres de cette équipe — après celle
        de l'org, avant celle de chaque membre. les procédures d'équipe (chargées à la demande)
        s'éditent dans « procédures ».
      </p>
    </header>

    <AgentReadmeCard :key="d.group.id" title="readme de l'équipe"
      sub="la prose de l'équipe (contexte, règles, ton) injectée à chaque session de ses membres — après celle de l'org, avant celle de l'utilisateur."
      :can-edit="canManage"
      placeholder="ex. cette équipe gère les comptes grand public ; toujours signer « l'équipe support »."
      :load="loadReadme" :save="saveReadme" />
  </TeamScopeHeader>
</template>

<style scoped>
.ctx-intro { margin-bottom: 18px; }
.ctx-h1 { font-weight: 700; font-size: 20px; color: var(--color-ink); letter-spacing: -0.01em; }
.ctx-lead { font-size: 13.5px; color: var(--color-mute); line-height: 1.6; margin-top: 6px; max-width: 720px; }
</style>

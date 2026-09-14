<script setup lang="ts">
// « Développeurs » (/account/developers) — tokens CLI / API, et l'entrée vers la
// documentation servie. Ex-onglet « développeurs » d'AccountView.
// Le produit ne renvoyait vers `docs.oto.cx` depuis AUCUN écran : la référence de
// l'API existait, dérivée du serveur, et personne dans le dashboard ne la trouvait.
import AccountTokensCard from '@/components/console/AccountTokensCard.vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Icon from '@/components/console/Icon.vue'
</script>

<template>
  <div class="content-inner narrow fadein">
    <ConsoleCard title="documentation" sub="la référence de l'API et les concepts">
      <p class="helptext">
        <strong>docs.oto.cx</strong> porte deux entrées : la <strong>référence REST</strong>,
        dérivée du serveur — elle ne peut pas mentir sur ce qui existe —, et les
        <strong>concepts</strong>, qui disent ce que chaque objet garantit et ce sur quoi
        on peut compter en l'utilisant.
      </p>
      <a class="doclink" href="https://docs.oto.cx" target="_blank" rel="noopener">
        <Icon name="code" :size="13" />
        ouvrir docs.oto.cx
      </a>
    </ConsoleCard>
    <AccountTokensCard />
  </div>
</template>

<style scoped>
.doclink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12.5px;
  font-weight: 600;
}
</style>

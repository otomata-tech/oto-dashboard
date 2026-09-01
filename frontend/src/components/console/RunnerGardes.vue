<script setup lang="ts">
// Le bandeau des POSTES DE GARDE — partagé par la carte Surveillance (grain
// flotte) et la fiche d'un agent (grain travail). Il vivait en double, avec ses
// styles recopiés ; l'arrivée d'un SECOND état à peindre l'aurait fait vivre en
// triple, à trois endroits qui auraient divergé.
//
// ⚠️ CE QUE CE BANDEAU EXISTE POUR EMPÊCHER. Un travail dont la garde a rattrapé
// les écritures se conclut `done`, SANS erreur : il se range à l'œil avec les
// succès. D'où deux blocs, et pas un :
//
//   ① CE QUI A ÉTÉ RATTRAPÉ — la garde est intervenue sur des données écrites ;
//   ② CE QUI N'A PAS ÉTÉ REGARDÉ — la garde n'a PAS tourné (`null` = non mesuré),
//      ou son relevé a une forme illisible.
//
// Le second n'est ni un succès ni un échec, et c'est le piège du lot : afficher
// « aucune destruction » là où personne n'a regardé est exactement le défaut que
// ces postes existent pour signaler. Les fondre dans un seul bloc, ou pire dans
// un seul compteur, reproduirait le silence qu'on vient de corriger.
//
// ③ Enfin, ce qui a été VÉRIFIÉ SANS RIEN TROUVER se dit aussi, discrètement :
// c'est la seule chose qui donne du prix au bloc ② — sans lui, on ne saurait pas
// distinguer « vérifié, propre » de « pas vérifié ».

export interface PosteAffiche {
  cle: string
  label: string
  /** Une valeur perdue ne se rattrape pas : elle ne se range pas avec ce que la
   * garde a su corriger. */
  severe?: boolean
  /** Ce qu'on montre à droite du libellé — des noms côté fiche, des comptes côté
   * flotte. Le composant ne calcule rien : il peint ce que l'appelant a mesuré. */
  texte?: string
}

defineProps<{
  titre: string
  sous?: string
  /** ① La garde a dû intervenir. */
  garnies: PosteAffiche[]
  /** ② Personne n'a regardé — non mesuré, ou relevé illisible. */
  aveugles: PosteAffiche[]
  /** ③ Vérifié, rien trouvé. */
  verifiees: PosteAffiche[]
}>()
</script>

<template>
  <div v-if="garnies.length || aveugles.length" class="rg">
    <!-- ① Ce qui a été rattrapé -->
    <div v-if="garnies.length" class="rg-bloc alerte">
      <div class="rg-t">
        {{ titre }}
        <slot name="compteur" />
      </div>
      <p v-if="sous" class="rg-s">{{ sous }}</p>
      <ul class="rg-l">
        <li v-for="p in garnies" :key="p.cle" :class="{ severe: p.severe }" :title="p.cle">
          <b v-if="p.texte">{{ p.texte }}</b> {{ p.label }}
        </li>
      </ul>
      <slot name="jetons" />
    </div>

    <!-- ② Ce qui n'a pas été regardé. Un ton à part : ni succès, ni échec. -->
    <div v-if="aveugles.length" class="rg-bloc aveugle">
      <div class="rg-t">La garde n'a pas pu vérifier ces données</div>
      <p class="rg-s">
        Le harnais n'a pas su identifier la ligne travaillée : le contrôle n'a pas eu
        lieu. Ce n'est ni un échec ni une garantie — c'est un angle mort, et il ne se
        lit nulle part ailleurs.
      </p>
      <ul class="rg-l">
        <li v-for="p in aveugles" :key="p.cle" :title="p.cle">
          <b v-if="p.texte">{{ p.texte }}</b> {{ p.label }}
        </li>
      </ul>
      <slot name="aveugles" />
    </div>

    <!-- ③ Ce qui a été vérifié pour de bon. Discret, mais c'est lui qui donne son
         sens au bloc ② : sans lui, « rien » et « pas regardé » se ressemblent. -->
    <p v-if="verifiees.length" class="rg-ok">
      Vérifié sans rien trouver : {{ verifiees.map((p) => p.label).join(' · ') }}
    </p>
  </div>
</template>

<style scoped>
.rg { display: flex; flex-direction: column; gap: 9px; }
.rg-bloc { border-radius: var(--radius-md); padding: 11px 13px; border: 1px solid; }
.rg-bloc.alerte {
  border-color: var(--color-terra-soft);
  background: color-mix(in srgb, var(--color-terra-soft) 34%, transparent);
}
.rg-bloc.aveugle {
  border-color: var(--color-saffron-soft);
  background: color-mix(in srgb, var(--color-saffron-soft) 30%, transparent);
}
.rg-t { font-weight: 700; font-size: 12.5px; display: flex; align-items: center; gap: 8px; }
.rg-bloc.alerte .rg-t { color: var(--color-terra-ink); }
.rg-bloc.aveugle .rg-t { color: var(--color-saffron-ink); }
.rg-s { margin: 3px 0 8px; font-size: 12px; line-height: 1.5; color: var(--color-ink); }
.rg-l { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.rg-l li {
  font-size: 12px; padding: 2px 9px; border-radius: var(--radius-pill);
  background: var(--color-surface); border: 1px solid var(--color-hair);
  color: var(--color-ink);
}
.rg-bloc.alerte .rg-l li { border-color: var(--color-terra-soft); }
.rg-bloc.aveugle .rg-l li { border-color: var(--color-saffron-soft); }
.rg-bloc.alerte .rg-l li.severe {
  border-color: var(--color-terra-ink); color: var(--color-terra-ink); font-weight: 600;
}
.rg-l b { font-family: var(--font-mono, monospace); }
.rg-ok { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--color-mute); }
</style>

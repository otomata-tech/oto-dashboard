// Un montant d'argent, écrit en français.
//
// ⚠️ **Les centimes se montrent quand il y en a, et se taisent quand il n'y en a
// pas.** `minimumFractionDigits: 0` seul — la forme qu'avaient les copies locales de
// cette fonction — convient au prix rond d'un palier de catalogue (« 19 € » et non
// « 19,00 € »), mais il TRONQUE tout montant qui a des centimes : le TTC réellement
// prélevé (2280) s'affichait « 22,8 € ». Un montant d'argent n'a jamais UN seul
// chiffre après la virgule.
//
// La règle vit ici parce qu'une facture est un document opposable : le nombre qu'on
// y lit doit être celui qui a été débité, au centime. Une cinquième copie de ce
// formatage aurait été une cinquième occasion de le reperdre.
//
// ⚠️ Rend un NÉGATIF tel quel (« -22,80 € ») : c'est la forme d'un avoir, et
// l'afficher en valeur absolue ferait passer un remboursement pour un débit.

/** Des CENTIMES vers la chaîne à afficher. Entrée entière et exacte : on ne
 *  fabrique pas de montant ici, on met en forme celui que le serveur a servi. */
export function euros(cents: number): string {
  const decimales = cents % 100 === 0 ? 0 : 2
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  })
}

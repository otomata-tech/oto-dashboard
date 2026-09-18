// Le mot d'un compte (`auth.account_noun`, servi par le registre) et ses ACCORDS.
//
// Le registre sert le MOT (« workspace », « organisation », « site », « société »,
// « compte » par défaut) : l'écran ne le devine jamais. Il ne sert PAS son genre, et
// l'écran qui collait « un » devant le mot aurait écrit « Ajouter un société » —
// précisément le bouton de l'admin d'un groupe qui pose une clé PayFit par société.
//
// ⚠️ Le genre se lit donc ici, sur une liste FERMÉE des mots féminins du registre.
// Un mot absent de la liste s'accorde au masculin (le genre non marqué du français) :
// un nouveau mot féminin côté registre se lira « un <mot> » tant qu'il n'est pas
// ajouté ici — faute visible, jamais un geste faux. Le jour où le registre servira le
// genre avec le mot, cette liste meurt.
const FEMININ = new Set([
  'société', 'organisation', 'entreprise', 'boutique', 'agence', 'filiale', 'entité',
])
const VOYELLE = /^[aeiouyéèêàâîïô]/i

export interface AccountWords {
  noun: string
  plural: string
  un: string        // « un workspace » / « une société »
  le: string        // « le workspace » / « la société » / « l'organisation »
  ce: string        // « ce workspace » / « cette société » / « cet espace »
  aucun: string     // « aucun workspace » / « aucune société »
  second: string    // « un second workspace » / « une seconde société »
  lun: string       // « l'un » / « l'une » (des autres)
  pronom: string    // COD : « qui le visaient » / « qui la visaient »
  lequel: string    // « lequel » / « laquelle »
  e: string         // accord du participe : « retiré » / « retirée »
}

export function accountWords(raw?: string | null): AccountWords {
  const noun = (raw ?? '').trim() || 'compte'
  const f = FEMININ.has(noun.toLowerCase())
  const v = VOYELLE.test(noun)
  const plural = /[sxz]$/i.test(noun) ? noun : `${noun}s`
  return {
    noun, plural,
    un: `${f ? 'une' : 'un'} ${noun}`,
    le: v ? `l'${noun}` : `${f ? 'la' : 'le'} ${noun}`,
    ce: `${f ? 'cette' : v ? 'cet' : 'ce'} ${noun}`,
    aucun: `${f ? 'aucune' : 'aucun'} ${noun}`,
    second: `${f ? 'une seconde' : 'un second'} ${noun}`,
    lun: f ? "l'une" : "l'un",
    pronom: f ? 'la' : 'le',
    lequel: f ? 'laquelle' : 'lequel',
    e: f ? 'e' : '',
  }
}

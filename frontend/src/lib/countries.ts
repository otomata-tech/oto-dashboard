// Les codes pays acceptés par la facturation — MIROIR de `billing_vat.ISO_COUNTRIES`
// et `EU_COUNTRIES` (oto-backend). Le formulaire n'invente pas sa liste : un code
// hors de celle du serveur serait refusé à l'enregistrement (`country_invalid`), et
// un pays manquant fermerait la souscription à quelqu'un qui y a droit.
//
// Les LIBELLÉS, eux, ne sont pas recopiés : `Intl.DisplayNames` les rend dans la
// langue de l'utilisateur. Une table de 249 traductions vieillirait mal, et le
// navigateur en sait plus que nous.
//
// ⚠️ L'Union est ici pour EXPLIQUER le régime au payeur (un client de l'Union hors
// France a besoin d'un numéro de TVA intracommunautaire), jamais pour le décider :
// le régime servi par l'API fait foi.

/** Les 27 États membres — état au 2026-08-28, comme la liste du serveur. */
export const EU_COUNTRIES: ReadonlySet<string> = new Set(
  "AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" "),
)

/** Codes ISO-3166-1 alpha-2 officiellement assignés. */
export const ISO_COUNTRIES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ " +
  "BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR " +
  "CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU " +
  "ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ " +
  "LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ " +
  "MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF " +
  "PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI " +
  "SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR " +
  "TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ")

/** La France : le seul pays où la TVA est collectée, donc celui qu'on propose en tête. */
export const HOME_COUNTRY = "FR"

/** ⚠️ La Grèce est « GR » en ISO et « EL » en TVA intracommunautaire — seule
 *  divergence des 27, et la faute de saisie qu'elle provoque est nommée par le
 *  serveur (`vat_number_invalid`). */
const VAT_PREFIXES: Record<string, string> = { GR: "EL" }

/** Le préfixe que porte le numéro de TVA de ce pays — sert le placeholder du champ,
 *  pas un contrôle : la forme est vérifiée côté serveur, qui dit la grammaire
 *  attendue quand elle n'est pas respectée. */
export function vatPrefix(country: string): string {
  return VAT_PREFIXES[country] ?? country
}

/** Les pays, libellés dans `locale` et triés sur ce libellé — la France en tête,
 *  parce que c'est la casse dominante et que 249 entrées alphabétiques la noient. */
export function countryOptions(locale: string): { value: string; label: string }[] {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([locale], { type: "region" })
  } catch {
    names = null   // environnement sans ICU complet : on retombe sur les codes.
  }
  const label = (code: string) => {
    try {
      return names?.of(code) ?? code
    } catch {
      return code
    }
  }
  const rest = ISO_COUNTRIES.filter((c) => c !== HOME_COUNTRY)
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
  return [{ value: HOME_COUNTRY, label: label(HOME_COUNTRY) }, ...rest]
}

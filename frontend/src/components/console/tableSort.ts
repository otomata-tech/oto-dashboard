// L'état de tri qu'un ConsoleTable passe à sa tête (`#head="{ sort }"`), lu par SortTh.
export interface TableSort {
  key: string | null
  dir: 'asc' | 'desc'
  toggle: (key: string) => void
}

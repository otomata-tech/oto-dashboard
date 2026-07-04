import * as React from "react";
export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current page (1-based). */
  page?: number;
  /** Total page count. */
  total?: number;
  /** Called with the new page. */
  onChange?: (page: number) => void;
}
/**
 * Pagination — prev/next + compact page window with ellipses.
 * @dsCard group="Components" name="Pagination"
 */
export function Pagination(props: PaginationProps): JSX.Element;

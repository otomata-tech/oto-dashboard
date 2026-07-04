import * as React from "react";

export interface TableColumn {
  /** Row object key (or just an id when using `render`). */
  key: string;
  /** Header label. */
  label?: React.ReactNode;
  /** Cell alignment. */
  align?: "left" | "right" | "center";
  /** Fixed column width (e.g. 18, "30%"). */
  width?: number | string;
  /** Render the cell as mono (codes, ids). */
  mono?: boolean;
  /** Custom cell renderer, given the row. */
  render?: (row: any) => React.ReactNode;
}

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  columns: TableColumn[];
  rows: any[];
  /** Row hover highlight. @default true */
  hover?: boolean;
}

/**
 * Data table in the console idiom — mono headers, hairline rows, hover.
 * Wrap in a flush <Card> for a full-bleed table.
 * @dsCard group="Components" name="Table"
 * @startingPoint section="Data" subtitle="Data table — mono headers, hairline rows" viewport="700x260"
 */
export function Table(props: TableProps): JSX.Element;

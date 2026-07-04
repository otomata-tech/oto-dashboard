import * as React from "react";

/**
 * Card props.
 * @startingPoint section="Layout" subtitle="Card — the base surface with head + actions" viewport="700x220"
 */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Card head title (14px, weight 700). */
  title?: React.ReactNode;
  /** Sub / help line under the title. */
  sub?: React.ReactNode;
  /** Right-aligned head actions (buttons, links). */
  actions?: React.ReactNode;
  /** Padding 0 + overflow hidden — for a full-bleed table or rowlist child. */
  flush?: boolean;
  children?: React.ReactNode;
}

/**
 * The unit of the console — a white 12px-radius surface with a hairline
 * border and an optional head. Everything on a screen lives in cards.
 * @dsCard group="Components" name="Card"
 */
export function Card(props: CardProps): JSX.Element;

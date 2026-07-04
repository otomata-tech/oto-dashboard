import * as React from "react";

export type ButtonKind = "primary" | "accent" | "ghost" | "mini" | "danger" | "link";

/**
 * Console button props.
 * @startingPoint section="Core" subtitle="Buttons — primary, ghost, mini, danger, link" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant.
   * - `primary`: filled ink pill, hover lifts -1px (main action)
   * - `accent`: filled saffron pill (friendly primary / key CTA)
   * - `ghost`: outlined pill (secondary)
   * - `mini`: small surface+hairline button, 7px radius (card/row action)
   * - `danger`: mini in terra (destructive)
   * - `link`: inline text action in saffron-ink
   * @default "primary"
   */
  kind?: ButtonKind;
  /** Optional leading icon name (from the Oto icon set). */
  icon?: string;
  children?: React.ReactNode;
}

/**
 * Console button. Lowercase label by convention. One primary action per view;
 * `ghost` for secondary, `mini` for in-card/row actions, `link` for inline.
 * @dsCard group="Components" name="Button"
 */
export function Button(props: ButtonProps): JSX.Element;

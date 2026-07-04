import * as React from "react";

export interface SquiggleProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
}

/**
 * Saffron squiggle underline on one word — the editorial wink. Parcimony:
 * once per empty/error-state title, never routine decoration.
 * @dsCard group="Components" name="Squiggle"
 */
export function Squiggle(props: SquiggleProps): JSX.Element;

import * as React from "react";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

/**
 * Keyboard key cap — mono, hairline with a heavier bottom edge.
 * @dsCard group="Components" name="Kbd"
 */
export function Kbd(props: KbdProps): JSX.Element;

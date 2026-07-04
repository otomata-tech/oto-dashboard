import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Use Spline Sans Mono for technical values (keys, ids). */
  mono?: boolean;
}

/**
 * Console text input — hairline border, 8px radius, saffron focus ring.
 * @dsCard group="Components" name="Input"
 */
export function Input(props: InputProps): JSX.Element;

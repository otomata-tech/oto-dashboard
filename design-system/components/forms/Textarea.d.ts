import * as React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Spline Sans Mono. */
  mono?: boolean;
  /** Tall mono editor (agent readme / procedures): min-height 300, 1.7 line. */
  doctrine?: boolean;
}

/**
 * Multiline text input; `doctrine` is the tall mono editor variant.
 * @dsCard group="Components" name="Textarea"
 */
export function Textarea(props: TextareaProps): JSX.Element;

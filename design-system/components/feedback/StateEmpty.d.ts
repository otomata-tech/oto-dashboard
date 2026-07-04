import * as React from "react";

/**
 * StateEmpty props.
 * @startingPoint section="Feedback" subtitle="Empty state — editorial title, body, CTAs" viewport="700x320"
 */
export interface StateEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Centered title — may include a <Squiggle> on one word. */
  title: React.ReactNode;
  /** Body paragraph (children). */
  children?: React.ReactNode;
  /** CTA row (Buttons). */
  cta?: React.ReactNode;
}

/**
 * Editorial empty state — every view that can be empty renders one instead
 * of a blank. Centered title + body + CTAs.
 * @dsCard group="Components" name="StateEmpty"
 */
export function StateEmpty(props: StateEmptyProps): JSX.Element;

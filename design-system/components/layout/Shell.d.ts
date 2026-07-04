import * as React from "react";

export interface ShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The <Sidebar> element (first grid column). */
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
}
export interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Narrow reading width (680px) for forms / single cards. */
  narrow?: boolean;
  children?: React.ReactNode;
}

/**
 * Full-height console shell: 232px sidebar + main column. Compose with
 * `<Shell sidebar={<Sidebar/>}><Topbar/><Content>…</Content></Shell>`.
 *
 * @dsCard group="Components" name="Layout — Shell"
 * @startingPoint section="Layout" subtitle="Console shell — dark sidebar + topbar + content" viewport="960x600"
 */
export function Shell(props: ShellProps): JSX.Element;
/** Scrolling, left-anchored, width-capped content region. */
export function Content(props: ContentProps): JSX.Element;

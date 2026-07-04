import * as React from "react";

export interface TopbarProps extends React.HTMLAttributes<HTMLElement> {
  /** Page title (normal case). */
  title?: React.ReactNode;
  /** Mono uppercase crumb next to the title. */
  crumb?: string;
  /** Right-aligned actions (OrgPill, IconButtons). */
  actions?: React.ReactNode;
  /** Show the Oto mark at the left. @default true */
  mark?: boolean;
  /** Show a hamburger (mobile) and call this on click. */
  onMenu?: () => void;
}
export interface OrgPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Org name. */
  name?: string;
  /** Leading icon. @default "building-2" */
  icon?: string;
}

/**
 * Main topbar — Oto mark + title + crumb + actions.
 * @dsCard group="Components" name="Layout — Topbar"
 */
export function Topbar(props: TopbarProps): JSX.Element;
/** Topbar org-identity pill. */
export function OrgPill(props: OrgPillProps): JSX.Element;

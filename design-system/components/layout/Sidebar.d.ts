import * as React from "react";

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Brand/identity block, pinned at the top. */
  brand?: React.ReactNode;
  /** Foot block (user menu, mcp status), pinned at the bottom. */
  foot?: React.ReactNode;
  /** Nav groups. */
  children?: React.ReactNode;
}
export interface SidebarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Mono uppercase group label (omit for the first, unlabelled group). */
  label?: string;
  children?: React.ReactNode;
}

/**
 * The dark ink sidebar — high-contrast anchor. Holds a brand block, nav
 * groups, and a foot.
 * @dsCard group="Components" name="Layout — Sidebar"
 */
export function Sidebar(props: SidebarProps): JSX.Element;
/** A labelled group of sidebar items. */
export function SidebarGroup(props: SidebarGroupProps): JSX.Element;

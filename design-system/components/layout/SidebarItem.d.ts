import * as React from "react";

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Leading icon name (Lucide / Oto alias). */
  icon?: string;
  /** Active state — fills solid saffron. */
  active?: boolean;
  /** Mono count/badge shown at the right (e.g. "7/12"). */
  count?: string;
  children?: React.ReactNode;
}

/**
 * A dark sidebar nav item; `active` fills saffron. Renders a button.
 * @dsCard group="Components" name="Layout — SidebarItem"
 */
export function SidebarItem(props: SidebarItemProps): JSX.Element;

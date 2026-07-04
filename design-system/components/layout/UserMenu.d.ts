import * as React from "react";

export interface UserMenuProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** User display name. */
  name?: string;
  /** User email. */
  email?: string;
  /** Avatar image URL (falls back to initial). */
  avatar?: string;
}

/**
 * Sidebar foot user row (dark) — avatar + name + email + chevron.
 * @dsCard group="Components" name="Layout — UserMenu"
 */
export function UserMenu(props: UserMenuProps): JSX.Element;

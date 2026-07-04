import * as React from "react";

export interface IdentityProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Org name. */
  org?: string;
  /** Mono kicker above the name (e.g. "votre contexte", "gérer mon org"). */
  kicker?: string;
  /** Optional role pill (e.g. "admin"). */
  role?: string;
  /** Org logo URL; falls back to the medallion. */
  logo?: string;
}

/**
 * Sidebar identity block (dark) — logo/medallion + kicker + org + role.
 * @dsCard group="Components" name="Layout — Identity"
 */
export function Identity(props: IdentityProps): JSX.Element;

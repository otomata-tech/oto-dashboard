import * as React from "react";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Status dot tone (olive/terra/saffron/cobalt/faint). */
  dot?: string;
  /** Mono uppercase eyebrow. */
  eyebrow?: string;
  /** Right-aligned actions (Seg, buttons). */
  actions?: React.ReactNode;
}

/**
 * Content page header — status dot + eyebrow + right actions.
 * @dsCard group="Components" name="Layout — PageHeader"
 */
export function PageHeader(props: PageHeaderProps): JSX.Element;

import * as React from "react";

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tabs: {key, label}[]. */
  tabs: Array<{ key: string; label: React.ReactNode }>;
  /** Active key. */
  value: string;
  /** Called with the new key. */
  onChange?: (key: string) => void;
}

/**
 * Underline tabs for in-page section switching (vs Seg's pill toggle).
 * @dsCard group="Components" name="Tabs"
 */
export function Tabs(props: TabsProps): JSX.Element;

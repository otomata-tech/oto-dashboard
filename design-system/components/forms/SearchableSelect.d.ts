import * as React from "react";

export type SelectOption = string | { value: string; label: React.ReactNode };

export interface SearchableSelectProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Options — strings or {value, label}. */
  options: SelectOption[];
  /** Selected value. */
  value?: string;
  /** Called with the picked value. */
  onChange?: (value: string) => void;
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Search field placeholder. */
  searchPlaceholder?: string;
  /** Control width in px. @default 260 */
  width?: number;
}

/**
 * Searchable select (combobox) — trigger opens a popover with a search field
 * and filtered options. For long lists (connectors, orgs, tools).
 * @dsCard group="Components" name="SearchableSelect"
 */
export function SearchableSelect(props: SearchableSelectProps): JSX.Element;

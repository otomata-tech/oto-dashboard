import * as React from "react";

export type SelectOption = string | { value: string; label: React.ReactNode };

export interface SelectProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "onChange"> {
  /** Options — strings or {value, label}. */
  options: SelectOption[];
  /** Selected value. */
  value?: string;
  /** Called with the picked value. */
  onChange?: (value: string) => void;
  /** Placeholder when nothing is selected. */
  placeholder?: string;
}

/**
 * Styled select — a popover dropdown (not the native OS menu), consistent with
 * the rest of the system. For long lists with search, use SearchableSelect.
 * @dsCard group="Components" name="Select"
 */
export function Select(props: SelectProps): JSX.Element;

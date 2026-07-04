import * as React from "react";

export interface CopyFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The technical value to display and copy. */
  value: string;
}

/**
 * Read-only copyable value (endpoint, token). Sits on a paper fill; the
 * copy button flips to a check for ~1.2s after copying.
 * @dsCard group="Components" name="CopyField"
 */
export function CopyField(props: CopyFieldProps): JSX.Element;

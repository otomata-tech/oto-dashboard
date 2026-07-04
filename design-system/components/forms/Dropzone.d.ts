import * as React from "react";

export interface DropzoneProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Prompt text. */
  label?: string;
  /** Secondary hint (accepted types, size). */
  hint?: string;
  /** Icon name. @default "download" */
  icon?: string;
  /** Called with the dropped FileList. */
  onFiles?: (files: FileList) => void;
}

/**
 * File drop area — dashed, turns saffron on drag-over.
 * @dsCard group="Components" name="Dropzone"
 */
export function Dropzone(props: DropzoneProps): JSX.Element;

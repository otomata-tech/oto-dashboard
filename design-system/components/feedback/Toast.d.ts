import * as React from "react";

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/**
 * Transient confirmation — ink pill, fixed bottom-center, animates in.
 * Mount while a message exists, then unmount after a timeout.
 * @dsCard group="Components" name="Toast"
 */
export function Toast(props: ToastProps): JSX.Element;

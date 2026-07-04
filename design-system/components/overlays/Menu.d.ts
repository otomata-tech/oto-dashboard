import * as React from "react";

export interface MenuProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The clickable trigger element. */
  trigger?: React.ReactNode;
  /** Panel alignment edge. @default "left" */
  align?: "left" | "right";
  /** Panel width in px. @default 200 */
  width?: number;
  children?: React.ReactNode;
}
export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Leading icon. */
  icon?: string;
  /** Destructive tint (terra). */
  danger?: boolean;
  children?: React.ReactNode;
}

/**
 * Dropdown menu — self-managed open state, closes on outside/item click.
 * @dsCard group="Components" name="Menu"
 */
export function Menu(props: MenuProps): JSX.Element;
/** A row inside a Menu. */
export function MenuItem(props: MenuItemProps): JSX.Element;

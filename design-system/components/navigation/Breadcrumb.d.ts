import * as React from "react";
export interface BreadcrumbItem { label: React.ReactNode; href?: string; }
export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}
/**
 * Breadcrumb trail — crumbs separated by chevrons; last is the current page.
 * @dsCard group="Components" name="Breadcrumb"
 */
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;

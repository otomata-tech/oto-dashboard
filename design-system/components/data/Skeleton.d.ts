import * as React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width (px or CSS). @default "100%" */
  w?: number | string;
  /** Height in px. @default 12 */
  h?: number;
  /** Corner radius. */
  radius?: string;
}
export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Body line count. @default 3 */
  lines?: number;
}

/**
 * Loading placeholder — paper fill with a gentle pulse.
 * @dsCard group="Components" name="Skeleton"
 */
export function Skeleton(props: SkeletonProps): JSX.Element;
/** A skeleton card (title + lines). */
export function SkeletonCard(props: SkeletonCardProps): JSX.Element;

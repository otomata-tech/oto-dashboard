import * as React from "react";

/** Lucide names in the curated Oto set (plus semantic aliases like "connectors"). */
export type IconName =
  | "house" | "zap" | "folder" | "plug" | "scroll-text" | "database" | "book-open"
  | "building-2" | "circle-user" | "users" | "activity" | "shield" | "file-text"
  | "search" | "plus" | "key-round" | "copy" | "check" | "trash-2" | "refresh-cw"
  | "external-link" | "pencil" | "settings" | "mail" | "log-out" | "menu" | "x"
  | "chevron-right" | "chevron-down" | "ellipsis" | "list-filter" | "download"
  | "triangle-alert" | "circle-check" | "sparkles" | "bot"
  // semantic aliases
  | "home" | "overview" | "bolt" | "context" | "projects" | "connectors"
  | "procedures" | "doc" | "db" | "data" | "book" | "documents" | "building"
  | "org" | "user" | "account" | "chart" | "usage" | "monitoring" | "key"
  | "trash" | "refresh" | "ext" | "pen" | "edit" | "logout" | "close" | "chev"
  | "chevd" | "more" | "filter" | "warn" | "ok" | "agent" | "gear";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  /** Lucide name or Oto alias. */
  name: IconName | string;
  /** Pixel size (width & height). Default 16. */
  size?: number;
  /** Stroke width. Default 1.75. */
  sw?: number;
}

/**
 * Outline icon from Lucide — the product's configured icon library. The set is
 * inlined (no CDN), curated to what Oto uses. Set `color` on a parent to tint.
 * @dsCard group="Components" name="Icon"
 */
export function Icon(props: IconProps): JSX.Element;

export const ICON_NAMES: string[];

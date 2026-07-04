import * as React from "react";
export interface AccordionItem { title: React.ReactNode; content: React.ReactNode; }
export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AccordionItem[];
  /** Initially expanded index (-1 for none). @default 0 */
  defaultOpen?: number;
}
/**
 * Accordion — a card of collapsible rows.
 * @dsCard group="Components" name="Accordion"
 */
export function Accordion(props: AccordionProps): JSX.Element;

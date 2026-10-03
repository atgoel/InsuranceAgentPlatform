import './DisclosureFooter.css';

export interface DisclosureFooterProps {
  text: string;
}

export function DisclosureFooter({ text }: DisclosureFooterProps) {
  return <div className="disclosure-footer">{text}</div>;
}

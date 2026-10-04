import { useLabel, type LabelKind } from '../../../lib/i18n/labels';

interface LabelTextProps {
  kind: LabelKind;
  code: string;
}

/** Renders the translated label for a server code; the hook cannot be called inside a loop, a component can. */
export function LabelText({ kind, code }: LabelTextProps) {
  return <>{useLabel(kind, code)}</>;
}

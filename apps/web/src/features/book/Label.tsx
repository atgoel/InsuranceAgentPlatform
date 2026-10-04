import { useLabel, type LabelKind } from '../../lib/i18n/labels';

/** Renders a localised label for a server code; hooks cannot run inside list callbacks, so components do. */
export function Label({ kind, code }: { kind: LabelKind; code: string }) {
  return <>{useLabel(kind, code)}</>;
}

import { Card } from '../../../design-system';
import type { RoleDefinition, RolePreview } from '../api';
import { RolePermissionEditor } from './RolePermissionEditor';
import { RolePreviewPanel } from './RolePreviewPanel';
import { RoleName } from './RoleLabels';

export interface RoleEditorPanelProps {
  role: RoleDefinition;
  preview?: RolePreview;
  saving: boolean;
  error?: string;
  onSave(permissions: string[], etag: string): Promise<void>;
  onCancel(): void;
}

/** Inline editor under the role cards (the artboard shows it in the page, not as an overlay). */
export function RoleEditorPanel({ role, preview, saving, error, onSave, onCancel }: RoleEditorPanelProps) {
  return (
    <Card>
      <div className="role-editor">
        <h2 className="role-editor-title">
          <RoleName role={role.role} />
        </h2>
        <div className="role-editor-grid">
          <RolePermissionEditor key={`${role.role}-${role.version}`} role={role} onSave={onSave} onCancel={onCancel} isSaving={saving} error={error} />
          <RolePreviewPanel preview={preview} />
        </div>
      </div>
    </Card>
  );
}

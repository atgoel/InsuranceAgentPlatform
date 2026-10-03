import { RolePreview } from '../api';

interface RolePreviewPanelProps {
  preview: RolePreview | undefined;
}

export function RolePreviewPanel({ preview }: RolePreviewPanelProps) {
  if (!preview) return null;

  return (
    <div className="role-preview">
      <h3>What this role sees</h3>
      <div className="preview-permissions">
        {preview.sees.map((permission) => (
          <span key={permission} className="permission-tag">
            {permission}
          </span>
        ))}
      </div>
    </div>
  );
}

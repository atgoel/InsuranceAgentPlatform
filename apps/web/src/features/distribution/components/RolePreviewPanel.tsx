import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import type { RolePreview } from '../api';

interface RolePreviewPanelProps {
  preview: RolePreview | undefined;
}

function Preview({ preview }: { preview: RolePreview }) {
  const { t } = useT();
  const roleName = useLabel('role', preview.role);
  return (
    <div className="role-preview">
      <h3>{t('distribution.roles.preview_title', { role: roleName })}</h3>
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

export function RolePreviewPanel({ preview }: RolePreviewPanelProps) {
  return preview ? <Preview preview={preview} /> : null;
}

import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { RoleDefinition } from '../api';

interface InviteFormState {
  displayName: string;
  phone: string;
  email: string;
  roles: string[];
  orgUnitId: string;
  errors: Record<string, string>;
}

interface InviteMemberSheetProps {
  isOpen: boolean;
  roles: RoleDefinition[];
  onClose: () => void;
  onSubmit: (input: {
    displayName: string;
    phone?: string;
    email?: string;
    roles: string[];
    orgUnitId: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function InviteMemberSheet({
  isOpen,
  roles,
  onClose,
  onSubmit,
  isLoading,
}: InviteMemberSheetProps) {
  const [form, setForm] = useState<InviteFormState>({
    displayName: '',
    phone: '',
    email: '',
    roles: [],
    orgUnitId: '',
    errors: {},
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.displayName.trim()) {
      errors.displayName = 'Name required';
    }

    if (!form.phone && !form.email) {
      errors.contact = 'Phone or email required';
    }

    if (!form.roles.length) {
      errors.roles = 'Roles required';
    }

    if (!form.orgUnitId) {
      errors.orgUnitId = 'Unit required';
    }

    setForm((prev) => ({ ...prev, errors }));
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      await onSubmit({
        displayName: form.displayName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        roles: form.roles,
        orgUnitId: form.orgUnitId,
      });

      setForm({
        displayName: '',
        phone: '',
        email: '',
        roles: [],
        orgUnitId: '',
        errors: {},
      });
    } catch (err) {
      setForm((prev) => ({
        ...prev,
        errors: {
          ...prev.errors,
          submit: err instanceof Error ? err.message : 'Failed to invite member',
        },
      }));
    }
  };

  return (
    <BottomSheet open={isOpen} title="Invite Member" onClose={onClose}>
      <div className="invite-form">
        {form.errors.submit && (
          <div className="error-message">{form.errors.submit}</div>
        )}

        <div className="form-field">
          <label>Name</label>
          <input
            type="text"
            value={form.displayName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, displayName: e.target.value }))
            }
            placeholder="Name"
          />
          {form.errors.displayName && (
            <span className="field-error">{form.errors.displayName}</span>
          )}
        </div>

        <div className="form-field">
          <label>Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, phone: e.target.value }))
            }
            placeholder="+91-XXXX-XXXX-XXXX"
          />
        </div>

        <div className="form-field">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="user@example.com"
          />
        </div>

        {form.errors.contact && (
          <span className="field-error">{form.errors.contact}</span>
        )}

        <div className="form-field">
          <label>Roles</label>
          <div className="role-checkboxes">
            {roles.map((role) => (
              <label key={role.role}>
                <input
                  type="checkbox"
                  checked={form.roles.includes(role.role)}
                  onChange={(e) => {
                    const newRoles = e.target.checked
                      ? [...form.roles, role.role]
                      : form.roles.filter((r) => r !== role.role);
                    setForm((prev) => ({ ...prev, roles: newRoles }));
                  }}
                />
                {role.role}
              </label>
            ))}
          </div>
          {form.errors.roles && (
            <span className="field-error">{form.errors.roles}</span>
          )}
        </div>

        <div className="form-actions">
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            variant="primary"
            size="md"
          >
            {isLoading ? 'Loading...' : 'Invite'}
          </Button>
          <Button onClick={onClose} variant="secondary" size="md">
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

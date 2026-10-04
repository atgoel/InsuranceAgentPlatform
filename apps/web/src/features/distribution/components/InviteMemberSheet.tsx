import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { RoleName } from './RoleLabels';

export interface OrgUnitOption {
  id: string;
  name: string;
}

export interface InviteInput {
  displayName: string;
  phone?: string;
  email?: string;
  roles: string[];
  orgUnitId: string;
}

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
  roles: Array<{ role: string }>;
  /** Units the invitee can join; the API requires one (M02 section 6). */
  units: OrgUnitOption[];
  /** Must be referentially stable: the sheet re-focuses itself whenever it changes. */
  onClose: () => void;
  onSubmit: (input: InviteInput) => Promise<void>;
  isLoading?: boolean;
}

const EMPTY: InviteFormState = { displayName: '', phone: '', email: '', roles: [], orgUnitId: '', errors: {} };

export function InviteMemberSheet({ isOpen, roles, units, onClose, onSubmit, isLoading }: InviteMemberSheetProps) {
  const { t } = useT();
  const [form, setForm] = useState<InviteFormState>(EMPTY);
  const patch = (next: Partial<InviteFormState>) => setForm((prev) => ({ ...prev, ...next }));

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.displayName.trim()) errors.displayName = t('distribution.invite.err_name');
    if (!form.phone && !form.email) errors.contact = t('distribution.invite.err_contact');
    if (!form.roles.length) errors.roles = t('distribution.invite.err_roles');
    if (!form.orgUnitId) errors.orgUnitId = t('distribution.invite.err_unit');
    patch({ errors });
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await onSubmit({
        displayName: form.displayName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        roles: form.roles,
        orgUnitId: form.orgUnitId,
      });
      setForm(EMPTY);
    } catch (err) {
      const message = err instanceof ApiError ? err.title : t('distribution.invite.err_submit');
      patch({ errors: { ...form.errors, submit: message } });
    }
  };

  const toggleRole = (role: string, checked: boolean) => {
    patch({ roles: checked ? [...form.roles, role] : form.roles.filter((r) => r !== role) });
  };

  return (
    <BottomSheet open={isOpen} title={t('distribution.invite.title')} onClose={onClose}>
      <div className="invite-form">
        {form.errors.submit && (
          <div className="error-message" role="alert">
            {form.errors.submit}
          </div>
        )}
        <div className="form-field">
          <label htmlFor="invite-name">{t('distribution.invite.name')}</label>
          <input
            id="invite-name"
            type="text"
            value={form.displayName}
            onChange={(e) => patch({ displayName: e.target.value })}
            placeholder={t('distribution.invite.name')}
          />
          {form.errors.displayName && <span className="field-error">{form.errors.displayName}</span>}
        </div>
        <div className="form-field">
          <label htmlFor="invite-phone">{t('distribution.invite.phone')}</label>
          <input
            id="invite-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="+91-XXXX-XXXX-XXXX"
          />
        </div>
        <div className="form-field">
          <label htmlFor="invite-email">{t('distribution.invite.email')}</label>
          <input
            id="invite-email"
            type="email"
            value={form.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder="user@example.com"
          />
        </div>
        {form.errors.contact && <span className="field-error">{form.errors.contact}</span>}
        <div className="form-field">
          <label htmlFor="invite-unit">{t('distribution.invite.unit')}</label>
          <select id="invite-unit" value={form.orgUnitId} onChange={(e) => patch({ orgUnitId: e.target.value })}>
            <option value="">{t('distribution.invite.unit_placeholder')}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          {form.errors.orgUnitId && <span className="field-error">{form.errors.orgUnitId}</span>}
        </div>
        <fieldset className="form-field">
          <legend>{t('distribution.invite.roles')}</legend>
          <div className="role-checkboxes">
            {roles.map((role) => (
              <label key={role.role}>
                <input type="checkbox" checked={form.roles.includes(role.role)} onChange={(e) => toggleRole(role.role, e.target.checked)} />
                <RoleName role={role.role} />
              </label>
            ))}
          </div>
          {form.errors.roles && <span className="field-error">{form.errors.roles}</span>}
        </fieldset>
        <div className="form-actions">
          <Button onClick={handleSubmit} disabled={isLoading} variant="primary" size="md">
            {isLoading ? t('distribution.reason.working') : t('distribution.invite.submit')}
          </Button>
          <Button onClick={onClose} variant="secondary" size="md">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

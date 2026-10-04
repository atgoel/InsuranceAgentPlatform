import { useState } from 'react';
import { BottomSheet, Button, DateInput, Select } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import type { EntityType, Plan, PlanCode, ProvisionTenantInput, ProvisionTenantResponse } from '../api';

const ENTITY_TYPES: EntityType[] = ['IMF', 'BROKER', 'CORPORATE_AGENT', 'INDIVIDUAL_AGENT'];

interface FormState {
  legalName: string;
  entityType: EntityType;
  planCode: PlanCode;
  slug: string;
  registrationNo: string;
  registrationValidTo: string;
  adminName: string;
  adminEmail: string;
}

function initialForm(plans: Plan[]): FormState {
  const orgPlan = plans.find((p) => p.kind === 'ORGANISATION') ?? plans[0];
  return {
    legalName: '',
    entityType: 'IMF',
    planCode: orgPlan?.code ?? 'TEAM',
    slug: '',
    registrationNo: '',
    registrationValidTo: '',
    adminName: '',
    adminEmail: '',
  };
}

function toInput(form: FormState): ProvisionTenantInput {
  const email = form.adminEmail.trim();
  const name = form.adminName.trim();
  return {
    slug: form.slug.trim(),
    displayName: form.legalName.trim(),
    kind: 'ORGANISATION',
    planCode: form.planCode,
    entity: {
      entityType: form.entityType,
      legalName: form.legalName.trim(),
      registrationNo: form.registrationNo.trim(),
      registrationValidTo: form.registrationValidTo,
    },
    admin: email ? { name, email } : { name },
  };
}

function isComplete(form: FormState): boolean {
  return [form.legalName, form.slug, form.registrationNo, form.registrationValidTo, form.adminName].every((v) => v.trim() !== '');
}

export interface ProvisionTenantSheetProps {
  open: boolean;
  plans: Plan[];
  onClose(): void;
  onSubmit(input: ProvisionTenantInput): Promise<ProvisionTenantResponse>;
}

interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange(value: string): void;
}

function TextField({ label, value, placeholder, type = 'text', onChange }: TextFieldProps) {
  return (
    <label className="provision-field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ProvisionTenantSheet({ open, plans, onClose, onSubmit }: ProvisionTenantSheetProps) {
  const { t } = useT();
  const [form, setForm] = useState<FormState>(() => initialForm(plans));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(toInput(form));
      setForm(initialForm(plans));
    } catch (err) {
      setError(err instanceof ApiError ? err.title : t('error.networkError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} title={t('tenancy.operator.provision_title')} onClose={onClose}>
      <div className="provision-form">
        <TextField label={t('tenancy.operator.form_legal_name')} value={form.legalName} onChange={(legalName) => set({ legalName })} />
        <Select
          label={t('tenancy.operator.form_entity_type')}
          value={form.entityType}
          options={ENTITY_TYPES.map((v) => ({ value: v, label: t(`tenancy.entity_type.${v}`) }))}
          onChange={(v) => set({ entityType: v as EntityType })}
        />
        <Select
          label={t('tenancy.operator.form_plan')}
          value={form.planCode}
          options={plans.map((p) => ({ value: p.code, label: p.name }))}
          onChange={(v) => set({ planCode: v as PlanCode })}
        />
        <TextField label={t('tenancy.operator.form_slug')} value={form.slug} placeholder="tenant-slug" onChange={(slug) => set({ slug })} />
        <TextField
          label={t('tenancy.operator.form_registration')}
          value={form.registrationNo}
          onChange={(registrationNo) => set({ registrationNo })}
        />
        <DateInput
          label={t('tenancy.operator.form_registration_valid')}
          value={form.registrationValidTo}
          onChange={(registrationValidTo) => set({ registrationValidTo })}
        />
        <TextField label={t('tenancy.operator.form_admin_name')} value={form.adminName} onChange={(adminName) => set({ adminName })} />
        <TextField
          label={t('tenancy.operator.form_admin_email')}
          type="email"
          value={form.adminEmail}
          onChange={(adminEmail) => set({ adminEmail })}
        />
        {error && (
          <p role="alert" className="operator-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button onClick={submit} loading={busy} disabled={!isComplete(form)} size="lg">
            {t('tenancy.operator.create_tenant')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

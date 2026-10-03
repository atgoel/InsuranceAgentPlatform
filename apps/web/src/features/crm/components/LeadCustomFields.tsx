import { useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/auth/me';
import { CustomFieldsSection } from '../../party/components/CustomFieldsSection';
import { useCustomFieldDefinitions } from '../../party/useCustomFieldDefinitions';
import { createCrmApi, type LeadDetailView } from '../api';

export interface LeadCustomFieldsProps {
  lead: LeadDetailView;
  onUpdated(lead: LeadDetailView): void;
}

/** Custom fields of a lead record: loads the lead definitions and saves with the record version. */
export function LeadCustomFields({ lead, onUpdated }: LeadCustomFieldsProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { can } = usePermissions();
  const definitions = useCustomFieldDefinitions('lead');
  return (
    <CustomFieldsSection
      entity="lead"
      definitions={definitions}
      values={lead.customFields ?? {}}
      canEdit={can('crm.lead.write')}
      version={lead.version}
      onSave={async (values, version) => {
        const updated = await crmApi.replaceLeadCustomFields(lead.id, values, version);
        onUpdated(updated);
      }}
    />
  );
}

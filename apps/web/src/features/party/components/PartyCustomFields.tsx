import { useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/auth/me';
import { createPartyApi, type PartyView } from '../api';
import { useCustomFieldDefinitions } from '../useCustomFieldDefinitions';
import { CustomFieldsSection } from './CustomFieldsSection';

export interface PartyCustomFieldsProps {
  party: PartyView;
  onUpdated(party: PartyView): void;
}

/** Custom fields of a customer record: loads the party definitions and saves with the record version. */
export function PartyCustomFields({ party, onUpdated }: PartyCustomFieldsProps) {
  const api = useApi();
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { can } = usePermissions();
  const definitions = useCustomFieldDefinitions('party');
  return (
    <CustomFieldsSection
      entity="party"
      definitions={definitions}
      values={party.customFields ?? {}}
      canEdit={can('party.write')}
      version={party.version}
      onSave={async (values, version) => {
        const updated = await partyApi.replacePartyCustomFields(party.id, values, version);
        onUpdated(updated);
      }}
    />
  );
}

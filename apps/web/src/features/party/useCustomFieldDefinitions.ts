import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../lib/api';
import { createTenancyApi, type CustomFieldDefinition, type CustomFieldEntity } from '../tenancy/api';

/**
 * Active definitions of one entity. A failed or malformed response yields no definitions,
 * so the custom-fields section stays hidden and the host screen is unaffected.
 */
export function useCustomFieldDefinitions(entity: CustomFieldEntity): CustomFieldDefinition[] {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    tenancyApi
      .listCustomFields(entity)
      .then((result) => {
        if (!cancelled && Array.isArray(result?.items)) setDefinitions(result.items.filter((d) => d.active));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tenancyApi, entity]);

  return definitions;
}

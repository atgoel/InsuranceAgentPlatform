import { useEffect, useMemo, useState } from 'react';
import type { ApiClient } from '../../../lib/api/api-client';
import { createDistributionApi, type OrgUnitNode } from '../api';

export function flattenUnits(node: OrgUnitNode): Array<{ id: string; name: string }> {
  return [{ id: node.id, name: node.name }, ...node.children.flatMap(flattenUnits)];
}

/** Ids of `unitId` and every unit below it; empty when the unit is not in the tree. */
export function unitSubtreeIds(node: OrgUnitNode, unitId: string): string[] {
  if (node.id === unitId) return flattenUnits(node).map((u) => u.id);
  return node.children.flatMap((child) => unitSubtreeIds(child, unitId));
}

/** Units a member can be invited into. A failed load leaves the list empty and the invite form says a unit is required. */
export function useOrgUnits(apiClient: ApiClient): Array<{ id: string; name: string }> {
  const api = useMemo(() => createDistributionApi(apiClient), [apiClient]);
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .getOrgTree()
      .then((response) => {
        if (!cancelled) setUnits(flattenUnits(response.root));
      })
      .catch(() => {
        if (!cancelled) setUnits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  return units;
}

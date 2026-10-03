import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../api';
import type { ApiClient } from '../api/api-client';

export interface Me {
  userRef: string;
  tenantId: string;
  memberId?: string;
  orgUnitId?: string;
  roles: string[];
  permissions: string[];
}

export function getMe(api: ApiClient): Promise<Me> {
  return api.get<Me>('/api/v1/me');
}

/** Mirrors the kernel hasPermission: exact match, or a granted `prefix.*` covering the required key. */
export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((p) => p === required || (p.endsWith('.*') && required.startsWith(p.slice(0, -1))));
}

/** The caller's permissions; empty while loading or when /me fails or is malformed (read-only fallback). */
export function usePermissions(): { permissions: string[]; can(permission: string): boolean } {
  const api = useApi();
  const [permissions, setPermissions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getMe(api)
      .then((me) => {
        if (!cancelled && Array.isArray(me?.permissions)) setPermissions(me.permissions);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);
  return useMemo(() => ({ permissions, can: (p: string) => hasPermission(permissions, p) }), [permissions]);
}

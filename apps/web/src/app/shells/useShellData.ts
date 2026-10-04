import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../lib/api';
import { getMe, hasPermission, useAuth } from '../../lib/auth';
import { createTenancyApi } from '../../features/tenancy/api';

export type PermissionsStatus = 'loading' | 'ready' | 'error';

export interface ShellData {
  tenantName?: string;
  userName?: string;
  roles: string[];
  permissionsStatus: PermissionsStatus;
  can(permission: string): boolean;
}

interface MeState {
  status: PermissionsStatus;
  permissions: string[];
  roles: string[];
}

const LOADING: MeState = { status: 'loading', permissions: [], roles: [] };

/** Tenant display name, signed-in user and permissions for the shell chrome (GET /api/v1/tenant and /api/v1/me). */
export function useShellData(): ShellData {
  const api = useApi();
  const { session } = useAuth();
  const tenancy = useMemo(() => createTenancyApi(api), [api]);
  const [tenantName, setTenantName] = useState<string | undefined>();
  const [me, setMe] = useState<MeState>(LOADING);

  useEffect(() => {
    let cancelled = false;
    tenancy
      .getTenantProfile()
      .then((profile) => {
        if (!cancelled) setTenantName(profile.displayName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tenancy]);

  useEffect(() => {
    let cancelled = false;
    getMe(api)
      .then((result) => {
        if (cancelled) return;
        setMe({ status: 'ready', permissions: result.permissions, roles: result.roles });
      })
      .catch(() => {
        if (!cancelled) setMe({ status: 'error', permissions: [], roles: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return useMemo(
    () => ({
      tenantName,
      userName: session?.name,
      roles: me.roles,
      permissionsStatus: me.status,
      can: (permission: string) => hasPermission(me.permissions, permission),
    }),
    [tenantName, session?.name, me],
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import { Button, ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type CapacityRow, type RoutingRule } from '../api';
import { RuleEditor } from '../components/RuleEditor';
import { RuleList } from '../components/routing/RuleList';
import { TestLeadForm } from '../components/TestLeadForm';
import { CapacityTable } from '../components/CapacityTable';
import '../styles/RoutingRulesScreen.css';

/** Priorities follow list order, so a saved list can never contain duplicate priorities. */
const renumber = (rules: RoutingRule[]) => rules.map((r, i) => ({ ...r, priority: i + 1 }));

/** CRM07 routing rules (AC-M04-19/28): ordered list, editor, test a lead (who and why), capacity. */
export function RoutingRulesScreen({ newId = () => `r_${Date.now().toString(36)}` }: { newId?: () => string }) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const [rules, setRules] = useState<RoutingRule[] | undefined>();
  const [capacity, setCapacity] = useState<CapacityRow[]>([]);
  const [loadError, setLoadError] = useState<ApiError | undefined>();
  const [editing, setEditing] = useState<RoutingRule | undefined>();
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([crmApi.listRoutingRules(), crmApi.getRoutingCapacity()]).then(
      ([r, c]) => {
        if (cancelled) return;
        setRules([...r.rules].sort((a, b) => a.priority - b.priority));
        setCapacity(c.items);
      },
      (err: unknown) => !cancelled && err instanceof ApiError && setLoadError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi]);

  if (loadError?.status === 403) return <PermissionDenied />;
  if (loadError) return <ErrorState error={loadError} />;
  if (!rules) return <LoadingSkeleton />;

  const change = (next: RoutingRule[]) => {
    setRules(next);
    setStatus(undefined);
  };
  const move = (id: string, by: -1 | 1) => {
    const i = rules.findIndex((r) => r.id === id);
    const next = [...rules];
    [next[i], next[i + by]] = [next[i + by] as RoutingRule, next[i] as RoutingRule];
    change(next);
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await crmApi.updateRoutingRules(renumber(rules));
      setRules(saved.rules);
      setStatus({ kind: 'saved', text: t('crm.routing.saved') });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ApiError ? err.title : t('common.error') });
    } finally {
      setSaving(false);
    }
  };
  const blank = (): RoutingRule => ({ id: newId(), priority: rules.length + 1, name: '', active: true, conditions: [], method: 'ROUND_ROBIN', slaMinutes: 30, onBreach: 'NOTIFY_MANAGER' });

  return (
    <main className="routing-rules-screen">
      <header className="screen-header">
        <h1>{t('crm.routing.title')}</h1>
        <Button variant="secondary" onClick={() => setEditing(blank())}>{t('crm.routing.add_rule')}</Button>
        <Button onClick={save} disabled={saving}>{t('crm.routing.save_rules')}</Button>
      </header>
      {status && <p role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
      <p className="eligibility-note">{t('crm.routing.first_match')} {t('crm.routing.eligibility_note')}</p>
      <RuleList rules={rules} onToggle={(id) => change(rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)))}
        onEdit={(id) => setEditing(rules.find((r) => r.id === id))} onMove={move} onDelete={(id) => change(rules.filter((r) => r.id !== id))} />
      {editing && (
        <RuleEditor key={editing.id} rule={editing} onClose={() => setEditing(undefined)} onChange={(rule) => {
          change(rules.some((r) => r.id === rule.id) ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]);
          setEditing(undefined);
        }} />
      )}
      <TestLeadForm api={crmApi} />
      <section aria-label={t('crm.routing.capacity_table')}>
        <h2>{t('crm.routing.capacity_table')}</h2>
        <CapacityTable rows={capacity} />
      </section>
    </main>
  );
}

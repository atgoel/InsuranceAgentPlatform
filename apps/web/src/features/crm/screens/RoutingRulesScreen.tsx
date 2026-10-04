import { useMemo, useState } from 'react';
import { Button, ErrorState, LoadingSkeleton, PageContainer, PageHeader, PermissionDenied } from '../../../design-system';
import { useApi } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type RoutingRule } from '../api';
import { CapacityTable } from '../components/CapacityTable';
import { RuleEditor } from '../components/RuleEditor';
import { RuleList } from '../components/routing/RuleList';
import { useRoutingData } from '../components/routing/useRoutingData';
import { TestLeadForm } from '../components/TestLeadForm';
import '../styles/crm-frame.css';
import '../styles/RoutingRulesScreen.css';

/** Priorities follow list order, so a saved list can never contain duplicate priorities. */
const renumber = (rules: RoutingRule[]) => rules.map((r, i) => ({ ...r, priority: i + 1 }));

const defaultNewId = () => `r_${crypto.randomUUID().slice(0, 12)}`;

function swapAt(rules: RoutingRule[], id: string, by: -1 | 1): RoutingRule[] {
  const index = rules.findIndex((r) => r.id === id);
  const other = rules[index + by];
  const current = rules[index];
  if (!current || !other) return rules;
  const next = [...rules];
  next[index] = other;
  next[index + by] = current;
  return next;
}

/** CRM07 routing rules (AC-M04-19/28): ordered list, editor, test a lead (who and why), capacity. */
export function RoutingRulesScreen({ newId = defaultNewId }: { newId?: () => string }) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const data = useRoutingData(crmApi);
  const [editing, setEditing] = useState<RoutingRule | undefined>();
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | undefined>();
  const [saving, setSaving] = useState(false);
  const { rules, setRules } = data;

  if (data.error?.status === 403) return <PermissionDenied />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  if (!rules) return <LoadingSkeleton />;

  const change = (next: RoutingRule[]) => {
    setRules(next);
    setStatus(undefined);
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
  const blank = (): RoutingRule => ({
    id: newId(),
    priority: rules.length + 1,
    name: '',
    active: true,
    conditions: [],
    method: 'ROUND_ROBIN',
    slaMinutes: 30,
    onBreach: 'NOTIFY_MANAGER',
  });
  const apply = (rule: RoutingRule) => {
    change(rules.some((r) => r.id === rule.id) ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]);
    setEditing(undefined);
  };

  return (
    <div className="crm-screen-frame">
      <PageContainer width="wide">
        <PageHeader
          title={t('crm.routing.title')}
          subtitle={t('crm.routing.eligibility_note')}
          actions={
            <>
              <Button variant="secondary" onClick={() => setEditing(blank())}>
                {t('crm.routing.add_rule')}
              </Button>
              <Button onClick={save} disabled={saving}>
                {t('crm.routing.save_rules')}
              </Button>
            </>
          }
        />
        {status && (
          <p role={status.kind === 'error' ? 'alert' : 'status'} className={`routing-status routing-status-${status.kind}`}>
            {status.text}
          </p>
        )}
        <div className="routing-columns">
          <section className="routing-card" aria-label={t('crm.routing.rules_heading')}>
            <h2>{t('crm.routing.rules_heading')}</h2>
            <p className="eligibility-note">{t('crm.routing.first_match')}</p>
            <RuleList
              rules={rules}
              onToggle={(id) => change(rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)))}
              onEdit={(id) => setEditing(rules.find((r) => r.id === id))}
              onMove={(id, by) => change(swapAt(rules, id, by))}
              onDelete={(id) => change(rules.filter((r) => r.id !== id))}
            />
          </section>
          <div className="routing-side">
            {editing && <RuleEditor key={editing.id} rule={editing} onClose={() => setEditing(undefined)} onChange={apply} />}
            <TestLeadForm api={crmApi} />
          </div>
        </div>
        <section className="routing-card" aria-label={t('crm.routing.capacity_table')}>
          <h2>{t('crm.routing.capacity_table')}</h2>
          <CapacityTable rows={data.capacity} />
        </section>
      </PageContainer>
    </div>
  );
}

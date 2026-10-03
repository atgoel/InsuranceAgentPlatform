import { useId, useState } from 'react';
import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { type RoutingMethod, type RoutingRule } from '../api';
import { ConditionRows } from './routing/ConditionRows';

const METHODS: RoutingMethod[] = ['ROUND_ROBIN', 'LEAST_LOADED', 'TERRITORY', 'SKILL', 'DIRECT_OWNER'];

interface RuleEditorProps {
  rule: RoutingRule;
  onClose: () => void;
  onChange: (rule: RoutingRule) => void;
}

/** Edits one rule locally; the list is saved as a whole with PUT /routing-rules. Bounds mirror the server schema. */
export function RuleEditor({ rule, onClose, onChange }: RuleEditorProps) {
  const { t } = useT();
  const id = useId();
  const [edited, setEdited] = useState(rule);
  const set = (patch: Partial<RoutingRule>) => setEdited((r) => ({ ...r, ...patch }));
  const num = (v: string) => (v === '' ? undefined : Number(v));
  const problems = ruleProblems(edited, t);
  const [showProblems, setShowProblems] = useState(false);

  return (
    <form className="rule-editor" aria-label={t('crm.routing.edit_rule')} onSubmit={(e) => {
      e.preventDefault();
      setShowProblems(true);
      if (problems.length === 0) onChange({ ...edited, name: edited.name.trim() });
    }}>
      <label htmlFor={`${id}-name`}>{t('crm.routing.rule_name')}</label>
      <input id={`${id}-name`} value={edited.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
      <ConditionRows conditions={edited.conditions} onChange={(conditions) => set({ conditions })} />
      <label htmlFor={`${id}-method`}>{t('crm.routing.method')}</label>
      <select id={`${id}-method`} value={edited.method} onChange={(e) => set({ method: e.target.value as RoutingMethod })}>
        {METHODS.map((m) => <option key={m} value={m}>{t(`crm.routing.method_${m.toLowerCase()}`)}</option>)}
      </select>
      <label htmlFor={`${id}-pool`}>{t('crm.routing.pool')}</label>
      <input id={`${id}-pool`} value={edited.targetOrgUnitId ?? ''} onChange={(e) => set({ targetOrgUnitId: e.target.value.trim() || undefined })} />
      <label htmlFor={`${id}-sla`}>{t('crm.routing.sla_minutes')}</label>
      <input id={`${id}-sla`} type="number" min={15} max={1440} value={edited.slaMinutes} onChange={(e) => set({ slaMinutes: Number(e.target.value) })} />
      <label htmlFor={`${id}-breach`}>{t('crm.routing.on_breach')}</label>
      <select id={`${id}-breach`} value={edited.onBreach} onChange={(e) => set({ onBreach: e.target.value as RoutingRule['onBreach'] })}>
        <option value="NOTIFY_MANAGER">{t('crm.routing.breach_notify_manager')}</option>
        <option value="NOTIFY_THEN_REASSIGN">{t('crm.routing.breach_notify_reassign')}</option>
      </select>
      {edited.onBreach === 'NOTIFY_THEN_REASSIGN' && (
        <>
          <label htmlFor={`${id}-reassign`}>{t('crm.routing.reassign_after')}</label>
          <input id={`${id}-reassign`} type="number" min={5} max={2880} value={edited.reassignAfterMinutes ?? ''} onChange={(e) => set({ reassignAfterMinutes: num(e.target.value) })} />
        </>
      )}
      <label htmlFor={`${id}-capacity`}>{t('crm.routing.capacity_per_person')}</label>
      <input id={`${id}-capacity`} type="number" min={1} max={500} value={edited.capacityPerPerson ?? ''} onChange={(e) => set({ capacityPerPerson: num(e.target.value) })} />
      {showProblems && problems.map((p) => <p key={p} role="alert">{p}</p>)}
      <div className="form-actions">
        <Button type="submit">{t('crm.routing.apply_rule')}</Button>
        <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

/** Client-side checks mirroring RoutingRuleSchema bounds, shown before the list is saved. */
function ruleProblems(r: RoutingRule, t: (key: string) => string): string[] {
  const emptyValue = r.conditions.some((c) => (Array.isArray(c.value) ? c.value.length === 0 : c.value === ''));
  const reassignMissing = r.onBreach === 'NOTIFY_THEN_REASSIGN' && (r.reassignAfterMinutes ?? 0) < 5;
  return [
    [r.name.trim().length < 2, 'crm.routing.rule_name_required'],
    [!(r.slaMinutes >= 15 && r.slaMinutes <= 1440), 'crm.routing.sla_range'],
    [emptyValue, 'crm.routing.condition_value_required'],
    [reassignMissing, 'crm.routing.reassign_required'],
  ].filter(([failed]) => failed).map(([, key]) => t(key as string));
}

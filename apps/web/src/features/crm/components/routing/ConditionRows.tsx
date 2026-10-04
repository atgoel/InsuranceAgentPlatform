import { useState } from 'react';
import { useT } from '../../../../lib/i18n';
import type { RuleCondition } from '../../api';

const FIELDS: RuleCondition['field'][] = ['productInterest', 'line', 'source', 'pincodePrefix', 'campaignId', 'language'];
const OPS: RuleCondition['op'][] = ['eq', 'in', 'startsWith'];
const MAX_CONDITIONS = 10;

/** "in" takes a comma-separated list; the other operators take one value. */
const asText = (v: RuleCondition['value']) => (Array.isArray(v) ? v.join(', ') : v);
const fromText = (op: RuleCondition['op'], text: string): RuleCondition['value'] =>
  op === 'in'
    ? text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : text.trim();

interface Props {
  conditions: RuleCondition[];
  onChange(conditions: RuleCondition[]): void;
}

/** All conditions must match (AND). No conditions = the rule matches every lead. */
export function ConditionRows({ conditions, onChange }: Props) {
  const { t } = useT();
  const update = (i: number, next: RuleCondition) => onChange(conditions.map((c, j) => (j === i ? next : c)));
  return (
    <fieldset className="conditions">
      <legend>{t('crm.routing.conditions')}</legend>
      {conditions.length === 0 && <p className="hint">{t('crm.routing.no_conditions')}</p>}
      {conditions.map((c, i) => (
        <div key={i} className="condition-row" role="group" aria-label={t('crm.routing.condition_n', { n: i + 1 })}>
          <select
            aria-label={t('crm.routing.condition_field')}
            value={c.field}
            onChange={(e) => update(i, { ...c, field: e.target.value as RuleCondition['field'] })}
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {t(`crm.routing.field_${f}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('crm.routing.condition_op')}
            value={c.op}
            onChange={(e) => {
              const op = e.target.value as RuleCondition['op'];
              update(i, { ...c, op, value: fromText(op, asText(c.value)) });
            }}
          >
            {OPS.map((o) => (
              <option key={o} value={o}>
                {t(`crm.routing.op_${o}`)}
              </option>
            ))}
          </select>
          <ValueInput label={t('crm.routing.condition_value')} condition={c} onChange={(value) => update(i, { ...c, value })} />
          <button type="button" onClick={() => onChange(conditions.filter((_, j) => j !== i))}>
            {t('crm.routing.remove_condition')}
          </button>
        </div>
      ))}
      {conditions.length < MAX_CONDITIONS && (
        <button type="button" onClick={() => onChange([...conditions, { field: 'productInterest', op: 'eq', value: '' }])}>
          {t('crm.routing.add_condition')}
        </button>
      )}
    </fieldset>
  );
}

/** Keeps what the user typed (e.g. a trailing comma) while reporting the parsed value on every change. */
function ValueInput({
  label,
  condition,
  onChange,
}: {
  label: string;
  condition: RuleCondition;
  onChange(value: RuleCondition['value']): void;
}) {
  const [draft, setDraft] = useState(() => asText(condition.value));
  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={600}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(fromText(condition.op, e.target.value));
      }}
    />
  );
}

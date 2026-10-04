import { useT } from '../../../../lib/i18n';
import type { RoutingRule } from '../../api';

interface Props {
  rules: RoutingRule[];
  onToggle(id: string): void;
  onEdit(id: string): void;
  onMove(id: string, by: -1 | 1): void;
  onDelete(id: string): void;
}

/** Rules in evaluation order: the first matching rule that yields an eligible seller wins. */
export function RuleList({ rules, onToggle, onEdit, onMove, onDelete }: Props) {
  const { t } = useT();
  const meta = (rule: RoutingRule) =>
    [
      t(`crm.routing.method_${rule.method.toLowerCase()}`),
      t('crm.routing.sla_short', { minutes: rule.slaMinutes }),
      t('crm.routing.condition_count', { count: rule.conditions.length }),
    ].join(' · ');
  if (rules.length === 0) return <p>{t('crm.routing.no_rules')}</p>;
  return (
    <ol className="rules-list">
      {rules.map((rule, i) => (
        <li key={rule.id} className="rule-row" aria-label={rule.name}>
          <span className="rule-priority" aria-hidden="true">
            {i + 1}
          </span>
          <div className="rule-info">
            <strong>{rule.name}</strong>
            <span className="rule-meta">{meta(rule)}</span>
          </div>
          <label className="rule-toggle">
            <input type="checkbox" checked={rule.active} onChange={() => onToggle(rule.id)} />
            <span className="visually-hidden">{t('crm.routing.active_rule', { name: rule.name })}</span>
            <span aria-hidden="true">{rule.active ? t('crm.routing.rule_on') : t('crm.routing.rule_off')}</span>
          </label>
          <div className="rule-actions">
            <button type="button" onClick={() => onMove(rule.id, -1)} disabled={i === 0}>
              {t('crm.routing.move_up')}
            </button>
            <button type="button" onClick={() => onMove(rule.id, 1)} disabled={i === rules.length - 1}>
              {t('crm.routing.move_down')}
            </button>
            <button type="button" onClick={() => onEdit(rule.id)}>
              {t('common.edit')}
            </button>
            <button type="button" onClick={() => onDelete(rule.id)}>
              {t('common.delete')}
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

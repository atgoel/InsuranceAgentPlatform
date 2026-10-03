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
  if (rules.length === 0) return <p>{t('crm.routing.no_rules')}</p>;
  return (
    <ol className="rules-list">
      {rules.map((rule, i) => (
        <li key={rule.id} className="rule-row" aria-label={rule.name}>
          <label>
            <input type="checkbox" checked={rule.active} onChange={() => onToggle(rule.id)} />
            {t('crm.routing.active_rule', { name: rule.name })}
          </label>
          <span className="rule-meta">
            {t(`crm.routing.method_${rule.method.toLowerCase()}`)} · {t('crm.routing.sla_short', { minutes: rule.slaMinutes })} · {t('crm.routing.condition_count', { count: rule.conditions.length })}
          </span>
          <button type="button" onClick={() => onMove(rule.id, -1)} disabled={i === 0}>{t('crm.routing.move_up')}</button>
          <button type="button" onClick={() => onMove(rule.id, 1)} disabled={i === rules.length - 1}>{t('crm.routing.move_down')}</button>
          <button type="button" onClick={() => onEdit(rule.id)}>{t('common.edit')}</button>
          <button type="button" onClick={() => onDelete(rule.id)}>{t('common.delete')}</button>
        </li>
      ))}
    </ol>
  );
}

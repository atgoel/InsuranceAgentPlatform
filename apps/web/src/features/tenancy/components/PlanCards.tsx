import { Card } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { Plan } from '../api';

export function PlanCards({ plans }: { plans: Plan[] }) {
  const { t } = useT();
  if (plans.length === 0) return null;
  return (
    <section aria-label={t('tenancy.operator.plans_title')} className="plan-cards">
      {plans.map((plan) => (
        <Card key={plan.code} title={plan.name}>
          <p className="plan-meta">{t(`tenancy.operator.kind.${plan.kind}`)}</p>
          <p className="plan-meta">
            {plan.limits.seats === null
              ? t('tenancy.operator.seats_unlimited')
              : t('tenancy.operator.seats_limit', { count: plan.limits.seats })}
          </p>
        </Card>
      ))}
    </section>
  );
}

import { useState } from 'react';
import { Button } from '../../../design-system';
import { usePermissions } from '../../../lib/auth/me';
import { useT } from '../../../lib/i18n';
import { CreateOpportunitySheet } from './CreateOpportunitySheet';

export const OPPORTUNITY_WRITE = 'crm.opportunity.write';

interface CreateOpportunityActionProps {
  partyId: string;
  variant?: 'primary' | 'secondary';
}

/** "Create opportunity" for a customer (ADR-009): shown only to callers who may write opportunities. */
export function CreateOpportunityAction({ partyId, variant = 'secondary' }: CreateOpportunityActionProps) {
  const { t } = useT();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);

  if (!can(OPPORTUNITY_WRITE)) {
    return null;
  }
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {t('party.opportunity.create')}
      </Button>
      <CreateOpportunitySheet partyId={partyId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

import { useT } from '../../../lib/i18n';
import type { DuplicateCandidateView } from '../api';

interface PossibleMatchBannerProps {
  matches: DuplicateCandidateView[];
  onLink: (partyId: string) => void;
}

/** Possible duplicate customers for this lead, each with a Link to customer action (AC-M04-26). */
export function PossibleMatchBanner({ matches, onLink }: PossibleMatchBannerProps) {
  const { t } = useT();
  if (matches.length === 0) {
    return null;
  }
  return (
    <section className="possible-match" aria-label={t('crm.lead.link_customer')}>
      {matches.map((match) => (
        <div key={match.id} className="possible-match-row">
          <span>{t('crm.lead.possible_match', { name: match.displayName })}</span>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label={t('crm.lead.link_named', { name: match.displayName })}
            onClick={() => onLink(match.id)}
          >
            {t('crm.lead.link_customer')}
          </button>
        </div>
      ))}
    </section>
  );
}

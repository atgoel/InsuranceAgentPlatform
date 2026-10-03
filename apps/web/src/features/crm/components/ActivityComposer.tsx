import { useState, useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type CallOutcome } from '../api';
import { ApiError } from '../../../lib/api/api-error';

interface ActivityComposerProps {
  leadId: string;
  onActivityLogged: (activityId: string) => void;
}

const CALL_OUTCOMES: CallOutcome[] = ['CONNECTED', 'NO_ANSWER', 'CALL_BACK', 'WRONG_NUMBER', 'NOT_INTERESTED'];

export function ActivityComposer({ leadId, onActivityLogged }: ActivityComposerProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [kind, setKind] = useState<string>('CALL');
  const [outcome, setOutcome] = useState<CallOutcome | undefined>();
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const activity = await crmApi.logLeadActivity(leadId, {
        kind,
        outcome: kind === 'CALL' ? outcome : undefined,
        summary: summary || undefined,
        clientRef: crypto.randomUUID(),
      });
      onActivityLogged(activity.id);
      setKind('CALL');
      setOutcome(undefined);
      setSummary('');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('common.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="activity-composer">
      <div className="form-group">
        <label htmlFor="kind">{t('crm.activity.kind')} *</label>
        <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="CALL">Call</option>
          <option value="NOTE">Note</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="SMS">SMS</option>
          <option value="EMAIL">Email</option>
          <option value="MEETING">Meeting</option>
          <option value="VOICE_NOTE">Voice Note</option>
        </select>
      </div>

      {kind === 'CALL' && (
        <div className="form-group">
          <label>{t('crm.activity.outcome')} *</label>
          <div className="outcome-chips">
            {CALL_OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                className={`outcome-chip ${outcome === o ? 'selected' : ''}`}
                onClick={() => setOutcome(o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="summary">{t('crm.activity.summary')}</label>
        <textarea
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={1000}
          placeholder={t('crm.activity.summary_placeholder')}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <button type="submit" className="btn btn-primary" disabled={loading || (kind === 'CALL' && !outcome)}>
        {loading ? t('common.loading') : t('crm.activity.log')}
      </button>
    </form>
  );
}

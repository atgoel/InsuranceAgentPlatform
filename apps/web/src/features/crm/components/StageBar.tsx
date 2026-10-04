import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { type LeadStage } from '../api';
import { LOST_REASONS } from './lost-reasons';

interface StageBarProps {
  currentStage: LeadStage;
  stageRules: Record<string, { met: boolean; missing: string[] }>;
  onTransition: (toStage: LeadStage, lostReason?: string) => void;
}

const STAGE_ORDER: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'];

export function StageBar({ currentStage, stageRules, onTransition }: StageBarProps) {
  const { t } = useT();
  const [showBlockedMsg, setShowBlockedMsg] = useState<LeadStage | null>(null);
  const [showLostReason, setShowLostReason] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  const handleStageClick = (toStage: LeadStage) => {
    if (toStage === currentStage) return;

    const rules = stageRules[toStage];
    if (rules && !rules.met) {
      setShowBlockedMsg(toStage);
      return;
    }

    if (toStage === 'LOST') {
      setShowLostReason(true);
      return;
    }

    onTransition(toStage);
  };

  const handleLostReasonSubmit = () => {
    onTransition('LOST', lostReason);
    setShowLostReason(false);
    setLostReason('');
  };

  return (
    <div className="stage-bar">
      <div className="stage-container">
        {STAGE_ORDER.map((stage, idx) => (
          <div key={stage} className="stage-item">
            <button
              className={`stage-btn ${stage === currentStage ? 'active' : ''} ${idx < currentIndex ? 'completed' : ''}`}
              onClick={() => handleStageClick(stage)}
              disabled={stage === currentStage}
            >
              {t(`crm.lead.stage_${stage}`)}
            </button>
            {idx < STAGE_ORDER.length - 1 && <div className="stage-separator" />}
          </div>
        ))}
      </div>

      {showBlockedMsg && (
        <div className="blocked-message">
          <p>{t('crm.lead.stage_blocked', { stage: t(`crm.lead.stage_${showBlockedMsg}`) })}</p>
          <ul>
            {stageRules[showBlockedMsg]?.missing.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <button
            className="close-btn"
            onClick={() => setShowBlockedMsg(null)}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      )}

      {showLostReason && (
        <div className="lost-reason-form">
          <div className="form-group">
            <label htmlFor="lostReason">{t('crm.lead.lost_reason')} *</label>
            <select
              id="lostReason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            >
              <option value="">{t('crm.lead.select_reason')}</option>
              {LOST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`crm.lostReason.${reason}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowLostReason(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleLostReasonSubmit}
              disabled={!lostReason}
            >
              {t('crm.lead.mark_lost')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

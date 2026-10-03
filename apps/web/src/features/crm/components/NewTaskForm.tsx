import { useState, useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type TaskKind } from '../api';
import { ApiError } from '../../../lib/api/api-error';

interface NewTaskFormProps {
  onClose: () => void;
  onSubmitted: (taskId: string) => void;
}

export function NewTaskForm({ onClose, onSubmitted }: NewTaskFormProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [subjectType, setSubjectType] = useState<'LEAD' | 'PARTY' | 'OPPORTUNITY' | 'DUE' | 'PROPOSAL'>('LEAD');
  const [subjectId, setSubjectId] = useState('');
  const [kind, setKind] = useState<TaskKind>('CALL');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const task = await crmApi.createTask({
        subjectType,
        subjectId,
        kind,
        title,
        dueAt,
        ownerMemberId: ownerMemberId || undefined,
      });
      onSubmitted(task.id);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('crm.tasks.new_task')}</h2>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="new-task-form">
          <div className="form-group">
            <label htmlFor="subjectType">{t('crm.task.subject_type')} *</label>
            <select
              id="subjectType"
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value as any)}
            >
              <option value="LEAD">Lead</option>
              <option value="PARTY">Party</option>
              <option value="OPPORTUNITY">Opportunity</option>
              <option value="DUE">Due</option>
              <option value="PROPOSAL">Proposal</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="subjectId">{t('crm.task.subject_id')} *</label>
            <input
              id="subjectId"
              type="text"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="kind">{t('crm.task.kind')} *</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
              <option value="CALL">Call</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="MEETING">Meeting</option>
              <option value="DOCUMENT">Document</option>
              <option value="FOLLOW_UP">Follow Up</option>
              <option value="RENEWAL">Renewal</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="title">{t('crm.task.title')} *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              maxLength={140}
            />
          </div>

          <div className="form-group">
            <label htmlFor="dueAt">{t('crm.task.due')} *</label>
            <input
              id="dueAt"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="ownerMemberId">{t('crm.task.owner')}</label>
            <input
              id="ownerMemberId"
              type="text"
              value={ownerMemberId}
              onChange={(e) => setOwnerMemberId(e.target.value)}
              placeholder={t('crm.task.owner_placeholder')}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('common.loading') : t('crm.tasks.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

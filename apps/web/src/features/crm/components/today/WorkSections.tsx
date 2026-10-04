import { useT } from '../../../../lib/i18n';
import type { MyWorkItem } from '../../api';
import { WorkItemRow } from './WorkItemRow';

interface WorkSectionsProps {
  items: MyWorkItem[];
  filtered: boolean;
  onOpen(item: MyWorkItem): void;
  onLog(item: MyWorkItem): void;
}

interface SectionProps extends Omit<WorkSectionsProps, 'items' | 'filtered'> {
  title: string;
  items: MyWorkItem[];
  emptyText: string;
}

function Section({ title, items, emptyText, onOpen, onLog }: SectionProps) {
  return (
    <section className="work-section" aria-label={title}>
      <h2 className="work-section-title">{title}</h2>
      {items.length === 0 ? (
        <p className="empty-message">{emptyText}</p>
      ) : (
        <ul className="my-work-list">
          {items.map((item) => (
            <WorkItemRow key={`${item.kind}-${item.id}`} item={item} onOpen={onOpen} onLog={onLog} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Dues and renewals" card (M07 contributor) and the rest of my work. Proposal items belong to an unbuilt module (D4). */
export function WorkSections({ items, filtered, onOpen, onLog }: WorkSectionsProps) {
  const { t } = useT();
  const visible = items.filter((item) => item.kind !== 'PROPOSAL');
  const dues = visible.filter((item) => item.kind === 'DUE');
  const work = visible.filter((item) => item.kind !== 'DUE');
  return (
    <>
      <Section title={t('today.dues_title')} items={dues} emptyText={t(filtered ? 'today.no_matches' : 'today.dues_empty')} onOpen={onOpen} onLog={onLog} />
      <Section title={t('today.work_title')} items={work} emptyText={t(filtered ? 'today.no_matches' : 'today.noWork')} onOpen={onOpen} onLog={onLog} />
    </>
  );
}

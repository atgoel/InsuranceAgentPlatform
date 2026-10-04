import { useT } from '../../../lib/i18n';
import type { OrgUnitNode } from '../api';

interface OrgTreeNodeProps {
  node: OrgUnitNode;
  selectedUnitId?: string;
  onSelectUnit: (unitId: string) => void;
  filterText: string;
}

function nameMatches(node: OrgUnitNode, filterText: string): boolean {
  return !filterText || node.name.toLowerCase().includes(filterText.toLowerCase());
}

/** A node shows when it or any descendant matches the filter. */
function visible(node: OrgUnitNode, filterText: string): boolean {
  return nameMatches(node, filterText) || node.children.some((child) => visible(child, filterText));
}

function OrgTreeNode({ node, selectedUnitId, onSelectUnit, filterText }: OrgTreeNodeProps) {
  const { t } = useT();
  if (!visible(node, filterText)) return null;
  return (
    <div className={`tree-node ${selectedUnitId === node.id ? 'selected' : ''}`}>
      <div
        className="tree-node-header"
        onClick={() => onSelectUnit(node.id)}
        role="button"
        tabIndex={0}
        aria-pressed={selectedUnitId === node.id}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelectUnit(node.id);
          }
        }}
      >
        <div className="node-name">{node.name}</div>
        {node.memberCount !== undefined && (
          <span className="member-count" title={t('distribution.tree.members', { count: node.memberCount })}>
            {node.memberCount}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <OrgTreeNode key={child.id} node={child} selectedUnitId={selectedUnitId} onSelectUnit={onSelectUnit} filterText={filterText} />
          ))}
        </div>
      )}
    </div>
  );
}

interface OrgTreePanelProps {
  tree: OrgUnitNode | undefined;
  selectedUnitId?: string;
  onSelectUnit: (unitId: string) => void;
  filterText: string;
  onFilterChange: (text: string) => void;
}

export function OrgTreePanel({ tree, selectedUnitId, onSelectUnit, filterText, onFilterChange }: OrgTreePanelProps) {
  const { t } = useT();
  return (
    <div className="hierarchy-tree-panel">
      <h2 className="panel-title">{t('distribution.tree.title')}</h2>
      <div className="tree-filter">
        <input
          type="text"
          placeholder={t('distribution.tree.filter')}
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label={t('distribution.tree.filter')}
        />
      </div>
      <div className="tree-content">
        {tree && <OrgTreeNode node={tree} selectedUnitId={selectedUnitId} onSelectUnit={onSelectUnit} filterText={filterText} />}
      </div>
    </div>
  );
}

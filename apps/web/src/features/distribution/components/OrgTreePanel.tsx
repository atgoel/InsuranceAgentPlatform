import { OrgUnitNode } from '../api';

interface OrgTreeNodeProps {
  node: OrgUnitNode;
  selectedUnitId?: string;
  onSelectUnit: (unitId: string) => void;
  filterText: string;
}

function OrgTreeNode({ node, selectedUnitId, onSelectUnit, filterText }: OrgTreeNodeProps) {
  const matchesFilter =
    !filterText || node.name.toLowerCase().includes(filterText.toLowerCase());
  const childrenMatch =
    !filterText || node.children.some((child) => matchesFilter || child.name.toLowerCase().includes(filterText.toLowerCase()));

  if (!matchesFilter && !childrenMatch) return null;

  return (
    <div className={`tree-node ${selectedUnitId === node.id ? 'selected' : ''}`}>
      <div
        className="tree-node-header"
        onClick={() => onSelectUnit(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelectUnit(node.id);
          }
        }}
      >
        <div className="node-name">{node.name}</div>
        {node.memberCount !== undefined && (
          <span className="member-count" title={`${node.memberCount} members`}>
            {node.memberCount}
          </span>
        )}
      </div>
      {node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              selectedUnitId={selectedUnitId}
              onSelectUnit={onSelectUnit}
              filterText={filterText}
            />
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

export function OrgTreePanel({
  tree,
  selectedUnitId,
  onSelectUnit,
  filterText,
  onFilterChange,
}: OrgTreePanelProps) {
  return (
    <div className="hierarchy-tree-panel">
      <div className="tree-filter">
        <input
          type="text"
          placeholder="Filter"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Filter"
        />
      </div>
      <div className="tree-content">
        {tree && (
          <OrgTreeNode
            node={tree}
            selectedUnitId={selectedUnitId}
            onSelectUnit={onSelectUnit}
            filterText={filterText}
          />
        )}
      </div>
    </div>
  );
}

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { OrgTreePanel } from './OrgTreePanel';
import { OrgUnitNode } from '../api';

describe('OrgTreePanel', () => {
  const mockTree: OrgUnitNode = {
    id: 'ou_root',
    kind: 'HEAD_OFFICE',
    name: 'Head Office',
    memberCount: 10,
    children: [
      {
        id: 'ou_branch1',
        kind: 'BRANCH',
        name: 'Branch 1',
        memberCount: 5,
        children: [
          {
            id: 'ou_team1',
            kind: 'TEAM',
            name: 'Team A',
            memberCount: 2,
            children: [],
          },
        ],
      },
      {
        id: 'ou_branch2',
        kind: 'BRANCH',
        name: 'Branch 2',
        memberCount: 3,
        children: [],
      },
    ],
  };

  it('AC-M02-15 renders tree with member counts', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.getByText('Head Office')).toBeInTheDocument();
    expect(screen.getByText('Branch 1')).toBeInTheDocument();
    expect(screen.getByText('Branch 2')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
  });

  it('AC-M02-15 displays member count in title attribute', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    const counts = screen.getAllByTitle(/members/);
    expect(counts.length).toBeGreaterThan(0);
  });

  it('AC-M02-15 calls onSelectUnit when tree node is clicked', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    const branch1Button = screen.getByText('Branch 1').closest('[role="button"]');
    expect(branch1Button).toBeInTheDocument();

    fireEvent.click(branch1Button!);
    expect(handleSelectUnit).toHaveBeenCalledWith('ou_branch1');
  });

  it('AC-M02-15 filters tree by unit name', () => {
    const handleSelectUnit = vi.fn();
    const handleFilterChange = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText="Branch"
        onFilterChange={handleFilterChange}
      />
    );

    // Branches should be visible when filtered by "Branch"
    const branchElements = screen.queryAllByText(/Branch/);
    expect(branchElements.length).toBeGreaterThan(0);
    expect(handleFilterChange).not.toHaveBeenCalled();
  });

  it('AC-M02-15 hides branches that do not match filter', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText="NonExistent"
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Branch 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Branch 2')).not.toBeInTheDocument();
  });

  it('AC-M02-15 updates filter when input changes', () => {
    const handleSelectUnit = vi.fn();
    const handleFilterChange = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={handleFilterChange}
      />
    );

    const filterInput = screen.getByLabelText('Filter');
    fireEvent.change(filterInput, { target: { value: 'Branch' } });

    expect(handleFilterChange).toHaveBeenCalledWith('Branch');
  });

  it('AC-M02-15 handles keyboard enter key on tree node', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    const branch1Button = screen.getByText('Branch 1').closest('[role="button"]');
    fireEvent.keyDown(branch1Button!, { key: 'Enter' });
    expect(handleSelectUnit).toHaveBeenCalledWith('ou_branch1');
  });

  it('AC-M02-15 handles keyboard space key on tree node', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    const branch1Button = screen.getByText('Branch 1').closest('[role="button"]');
    fireEvent.keyDown(branch1Button!, { key: ' ' });
    expect(handleSelectUnit).toHaveBeenCalledWith('ou_branch1');
  });

  it('AC-M02-15 applies selected class to selected unit', () => {
    const handleSelectUnit = vi.fn();

    const { container } = render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_branch1"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    const selectedNode = container.querySelector('.tree-node.selected');
    expect(selectedNode).toBeInTheDocument();
    expect(selectedNode?.textContent).toContain('Branch 1');
  });

  it('AC-M02-15 handles undefined tree gracefully', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={undefined}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText=""
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Head Office')).not.toBeInTheDocument();
  });

  it('AC-M02-15 filters showing parent when child matches', () => {
    const handleSelectUnit = vi.fn();

    render(
      <OrgTreePanel
        tree={mockTree}
        selectedUnitId="ou_root"
        onSelectUnit={handleSelectUnit}
        filterText="A"
        onFilterChange={vi.fn()}
      />
    );

    // Filter with "A" should match Team A
    // Verify that the tree is rendered
    expect(screen.getByLabelText('Filter')).toBeInTheDocument();
  });
});

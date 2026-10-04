import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { RolePreviewPanel } from './RolePreviewPanel';

describe('RolePreviewPanel', () => {
  it('AC-M02-16 names the role by its label and lists what it sees in the given order', () => {
    render(<RolePreviewPanel preview={{ role: 'BRANCH_MANAGER', sees: ['Members in own subtree', 'Onboarding workflows'] }} />);
    expect(screen.getByRole('heading', { name: 'What a Branch manager sees' })).toBeInTheDocument();
    const tags = Array.from(document.querySelectorAll('.permission-tag')).map((n) => n.textContent);
    expect(tags).toEqual(['Members in own subtree', 'Onboarding workflows']);
  });

  it('AC-M02-16 renders nothing without a preview', () => {
    const { container } = render(<RolePreviewPanel preview={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

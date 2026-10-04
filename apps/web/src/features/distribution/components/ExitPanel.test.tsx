import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { ApiError } from '../../../lib/api/api-error';
import { member } from '../test-fixtures';
import { ExitPanel } from './ExitPanel';

const leaving = member({ id: 'mem_1', displayName: 'Suresh P.' });
const targets = [member({ id: 'mem_2', displayName: 'Meena K.' })];

describe('ExitPanel', () => {
  it('AC-M02-07 shows the ownership note and keeps Confirm disabled until a reason is entered', () => {
    render(<ExitPanel member={leaving} targets={targets} onExit={vi.fn()} />);
    expect(screen.getByText(/customers stay with the tenant; the ISP receives no customer export/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm exit' })).toBeDisabled();
  });

  it('AC-M02-07 exits with the chosen transfer target and reason', async () => {
    const onExit = vi.fn().mockResolvedValue(undefined);
    render(<ExitPanel member={leaving} targets={targets} onExit={onExit} />);
    fireEvent.change(screen.getByLabelText('Transfer customers to'), { target: { value: 'mem_2' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Moved to another firm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exit' }));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(onExit).toHaveBeenCalledWith('mem_2', 'Moved to another firm');
  });

  it('AC-M02-07 exits without a transfer when none is chosen', async () => {
    const onExit = vi.fn().mockResolvedValue(undefined);
    render(<ExitPanel member={leaving} targets={targets} onExit={onExit} />);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Retired' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exit' }));
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(onExit).toHaveBeenCalledWith(undefined, 'Retired');
  });

  it('AC-M02-07 shows the server title inline when the exit is refused', async () => {
    const onExit = vi.fn().mockRejectedValue(new ApiError(422, 'transfer_target_ineligible', 'The transfer target is not eligible'));
    render(<ExitPanel member={leaving} targets={targets} onExit={onExit} />);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Retired' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The transfer target is not eligible');
  });
});

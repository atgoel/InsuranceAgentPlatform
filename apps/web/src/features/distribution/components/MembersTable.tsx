import { DataGrid, StatusChip, Button } from '../../../design-system';
import { MemberView } from '../api';

interface MembersTableProps {
  members: MemberView[];
  onSuspend: (memberId: string) => void;
  onReactivate: (memberId: string) => void;
}

export function MembersTable({ members, onSuspend, onReactivate }: MembersTableProps) {
  return (
    <div className="members-table-card">
      <DataGrid
        columns={[
          { key: 'displayName', header: 'Name' },
          { key: 'phoneMasked', header: 'Phone' },
          {
            key: 'roles',
            header: 'Role',
            render: (row) => (row as MemberView).roles.join(', '),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <StatusChip tone={(row as MemberView).status === 'active' ? 'ok' : 'info'}>
                {(row as MemberView).status}
              </StatusChip>
            ),
          },
          {
            key: 'mfaRequired',
            header: 'MFA',
            render: (row) => ((row as MemberView).mfaRequired ? '✓' : ''),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (row) => {
              const member = row as MemberView;
              return (
                <div className="action-buttons">
                  {member.status === 'active' && (
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => onSuspend(member.id)}
                    >
                      Suspend
                    </Button>
                  )}
                  {member.status === 'suspended' && (
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => onReactivate(member.id)}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              );
            },
          },
        ]}
        rows={members}
        rowKey={(row) => row.id}
      />
    </div>
  );
}

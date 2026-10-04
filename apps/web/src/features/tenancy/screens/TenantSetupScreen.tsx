import { Button, Card, ErrorState, LoadingSkeleton, PageContainer, PageHeader, PermissionDenied } from '../../../design-system';
import { usePermissions } from '../../../lib/auth/me';
import { useT } from '../../../lib/i18n';
import { CatalogueTable } from '../../catalogue/components/CatalogueTable';
import { EntityCard } from '../components/EntityCard';
import { GatedCapabilities } from '../components/GatedCapabilities';
import { TieUpsCard } from '../components/TieUpsCard';
import { useTenantSetup } from '../useTenantSetup';
import '../styles/TenantSetupScreen.css';

export function TenantSetupScreen() {
  const { t } = useT();
  const { can } = usePermissions();
  const setup = useTenantSetup();

  if (setup.error) {
    return setup.error.status === 403 ? <PermissionDenied /> : <ErrorState error={setup.error} />;
  }
  if (!setup.data) return <LoadingSkeleton />;
  const { profile, tieUps, flags } = setup.data;

  return (
    <PageContainer>
      <PageHeader
        title={t('tenancy.setup.title')}
        subtitle={t('tenancy.setup.description')}
        actions={
          <Button onClick={setup.save} loading={setup.saving} size="lg">
            {t('tenancy.setup.save')}
          </Button>
        }
      />
      <div className="setup-grid">
        <div className="setup-column">
          <EntityCard profile={profile} />
          <Card>
            <GatedCapabilities
              online={flags.find((f) => f.key === 'online_purchase')}
              canWrite={can('tenant.flag.write')}
              busy={setup.flagBusy}
              error={setup.flagError}
              onRecordReview={setup.recordReview}
              onEnable={setup.setOnline}
            />
          </Card>
        </div>
        <TieUpsCard
          lines={tieUps.lines}
          edited={setup.edited}
          drafts={setup.drafts}
          saveError={setup.saveError}
          onAdd={setup.add}
          onRemove={setup.remove}
          onDraftChange={setup.setDraft}
        />
      </div>
      <Card title={t('catalogue.table.title')}>
        <CatalogueTable />
      </Card>
    </PageContainer>
  );
}

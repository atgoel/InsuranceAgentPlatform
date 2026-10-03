import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_POOL, KERNEL_OPTIONS, PERMISSION_POLICY } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DistributionModule } from '../distribution/distribution.module';
import { PartyModule } from '../party/party.module';
import { CrmModule } from '../crm/crm.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ShareToken } from './domain/share-token';
import {
  ADVICE_REPOSITORY, AdviceRepository, BI_REPOSITORY, BiRepository, CALCULATOR_RUN_REPOSITORY, CalculatorRunRepository, QUOTE_REPOSITORY, QuoteRepository, SHARE_TOKEN_SIGNER,
} from './application/ports';
import { AdviceContext } from './application/advice-context';
import { AdviceScope } from './application/advice-scope';
import { AdviceViews } from './application/advice-views';
import { QuoteViews } from './application/quote-views';
import { CalculatorService } from './application/calculator.service';
import { AdviceService } from './application/advice.service';
import { QuoteService } from './application/quote.service';
import { BiService } from './application/bi.service';
import { ShareService } from './application/share.service';
import { InMemoryAdviceRepository, InMemoryBiRepository, InMemoryCalculatorRunRepository, InMemoryQuoteRepository } from './infrastructure/in-memory-advice.repositories';
import { PgAdviceRepository, PgBiRepository, PgCalculatorRunRepository, PgQuoteRepository } from './infrastructure/pg-advice.repositories';
import { CalculatorsController } from './api/calculators.controller';
import { AdviceController } from './api/advice.controller';
import { QuotesController } from './api/quotes.controller';
import { PublicShareController } from './api/public-share.controller';

const SELLER = ['advice.*', 'quote.*'];

/** Role → permission rows contributed by M06 (M06 §6). */
export const ADVICE_PERMISSIONS: Record<string, string[]> = {
  SALESPERSON: SELLER,
  SOLO_OWNER: SELLER,
  BRANCH_MANAGER: SELLER,
  SALES_MANAGER: SELLER,
  TENANT_ADMIN: SELLER,
  OPS: ['advice.read', 'quote.read', 'quote.write'],
  COMPLIANCE: ['advice.read', 'quote.read'],
};

/** In-memory by default; PERSISTENCE=pg selects the Postgres adapters (they run in the caller's RLS-scoped transaction). */
function pick<T>(provide: symbol, memory: () => T, pgImpl: (app: Pool) => T): Provider {
  return {
    provide,
    useFactory: (config: KernelConfig, app?: Pool) => (config.persistence === 'pg' && app ? pgImpl(app) : memory()),
    inject: [KERNEL_OPTIONS, APP_POOL],
  };
}

const adapters: Provider[] = [
  pick<AdviceRepository>(ADVICE_REPOSITORY, () => new InMemoryAdviceRepository(), () => new PgAdviceRepository()),
  pick<QuoteRepository>(QUOTE_REPOSITORY, () => new InMemoryQuoteRepository(), () => new PgQuoteRepository()),
  pick<BiRepository>(BI_REPOSITORY, () => new InMemoryBiRepository(), () => new PgBiRepository()),
  pick<CalculatorRunRepository>(CALCULATOR_RUN_REPOSITORY, () => new InMemoryCalculatorRunRepository(), () => new PgCalculatorRunRepository()),
  { provide: SHARE_TOKEN_SIGNER, useFactory: (config: KernelConfig) => new ShareToken(config.shareTokenSecret), inject: [KERNEL_OPTIONS] },
];

const services: Provider[] = [AdviceContext, AdviceScope, AdviceViews, QuoteViews, CalculatorService, AdviceService, QuoteService, BiService, ShareService];

/** M06 Advice & Quote: calculators, advice record, quote workspace, benefit-illustration evidence and the public share link. */
@Module({
  imports: [TenancyModule, DistributionModule, PartyModule, CrmModule, CatalogueModule],
  controllers: [CalculatorsController, AdviceController, QuotesController, PublicShareController],
  providers: [...adapters, ...services],
  exports: [QuoteService, AdviceService, CalculatorService],
})
export class AdviceModule implements OnModuleInit {
  constructor(@Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix) {}

  onModuleInit(): void {
    for (const [role, perms] of Object.entries(ADVICE_PERMISSIONS)) this.permissions.grant(role, perms);
  }
}

import { Module } from '@nestjs/common';
import { loadConfig } from './kernel/config';
import { KernelModule } from './kernel/kernel.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { PartyModule } from './modules/party/party.module';
import { CrmModule } from './modules/crm/crm.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { AdviceModule } from './modules/advice/advice.module';
import { BookModule } from './modules/book/book.module';
import { IntegrationModule } from './modules/integration/integration.module';

@Module({
  imports: [KernelModule.forRoot(loadConfig(process.env)), TenancyModule, DistributionModule, PartyModule, CrmModule, CatalogueModule,
    AdviceModule, BookModule, IntegrationModule],
})
export class AppModule {}

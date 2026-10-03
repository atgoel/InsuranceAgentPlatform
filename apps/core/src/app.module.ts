import { Module } from '@nestjs/common';
import { loadConfig } from './kernel/config';
import { KernelModule } from './kernel/kernel.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { PartyModule } from './modules/party/party.module';

@Module({
  imports: [KernelModule.forRoot(loadConfig(process.env)), TenancyModule, DistributionModule, PartyModule],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { loadConfig } from './kernel/config';
import { KernelModule } from './kernel/kernel.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { DistributionModule } from './modules/distribution/distribution.module';

@Module({
  imports: [KernelModule.forRoot(loadConfig(process.env)), TenancyModule, DistributionModule],
})
export class AppModule {}

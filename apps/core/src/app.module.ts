import { Module } from '@nestjs/common';
import { loadConfig } from './kernel/config';
import { KernelModule } from './kernel/kernel.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';

@Module({
  imports: [KernelModule.forRoot(loadConfig(process.env)), TenancyModule],
})
export class AppModule {}

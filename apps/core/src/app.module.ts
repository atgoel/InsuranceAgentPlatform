import { Module } from '@nestjs/common';
import { loadConfig } from './kernel/config';
import { KernelModule } from './kernel/kernel.module';

@Module({
  imports: [KernelModule.forRoot(loadConfig(process.env))],
})
export class AppModule {}

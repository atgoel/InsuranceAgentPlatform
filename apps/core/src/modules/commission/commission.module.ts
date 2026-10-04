import { Module } from '@nestjs/common';
import { COMMISSION_IMPORT_PORT } from './application/ports';
import { CommissionImportService } from './infrastructure/commission-import.service';
@Module({providers:[CommissionImportService,{provide:COMMISSION_IMPORT_PORT,useExisting:CommissionImportService}],exports:[COMMISSION_IMPORT_PORT]})
export class CommissionModule {}

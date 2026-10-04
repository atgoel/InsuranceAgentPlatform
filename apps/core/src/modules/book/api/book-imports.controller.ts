import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, ParseIntPipe } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { BookImportService } from '../application/book-import.service';
import { UploadSchema, MappingSchema, DecisionSchema, ReferrerSchema } from './schemas';
@Controller('api/v1/book-imports')
export class BookImportsController {
    constructor(private readonly imports: BookImportService) { }
    @Post()
    @Idempotent()
    @RequirePermission('book.import')
    upload(
    @CurrentPrincipal()
    p: Principal,
    @Body(new ZodValidationPipe(UploadSchema))
    body: z.infer<typeof UploadSchema>) { return this.imports.upload(p, body); }
    @Get(':id')
    @RequirePermission('book.import')
    get(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string) { return this.imports.get(p, id); }
    @Put(':id/mapping')
    @RequirePermission('book.import')
    map(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Body(new ZodValidationPipe(MappingSchema))
    body: z.infer<typeof MappingSchema>) { return this.imports.map(p, id, body.mapping); }
    @Get(':id/rows')
    @RequirePermission('book.import')
    rows(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Query('filter', new ZodValidationPipe(z.enum(['all', 'problems', 'duplicates']).default('all')))
    filter: string) { return this.imports.rows(p, id, filter); }
    @Put(':id/rows/:rowNo/decision')
    @RequirePermission('book.import')
    decide(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Param('rowNo', ParseIntPipe)
    row: number,
    @Body(new ZodValidationPipe(DecisionSchema))
    body: z.infer<typeof DecisionSchema>) { return this.imports.decide(p, id, row, body.decision); }
    @Put(':id/rows/:rowNo/referrer')
    @RequirePermission('book.import')
    referrer(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Param('rowNo', ParseIntPipe)
    row: number,
    @Body(new ZodValidationPipe(ReferrerSchema))
    body: z.infer<typeof ReferrerSchema>) { return this.imports.referrer(p, id, row, body); }
    @Post(':id/commit')
    @HttpCode(200)
    @Idempotent()
    @RequirePermission('book.import')
    commit(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string) { return this.imports.commit(p, id); }
}

import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { DueService } from '../application/due.service';
import { WindowSchema } from './schemas';
@Controller('api/v1/dues')
export class DuesController {
    constructor(private readonly dues: DueService) { }
    @Get('today')
    @RequirePermission('book.read')
    today(
    @CurrentPrincipal()
    p: Principal) { return this.dues.today(p); }
    @Get()
    @RequirePermission('book.read')
    calendar(
    @CurrentPrincipal()
    p: Principal,
    @Query(new ZodValidationPipe(WindowSchema))
    q: z.infer<typeof WindowSchema>) { return this.dues.calendar(p, q.from, q.to); }
}

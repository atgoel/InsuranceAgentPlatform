import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { parseIfMatch } from '../../../kernel/http/if-match';
import { ServicingService } from '../application/servicing.service';
import { ServicingSchema, ServicingPatchSchema, NoteSchema, FollowUpDateSchema } from './schemas';
@Controller('api/v1')
export class ServicingController {
    constructor(private readonly servicing: ServicingService) { }
    @Get('servicing-requests')
    @RequirePermission('book.servicing')
    list(
    @CurrentPrincipal()
    p: Principal,
    @Query('followUpBefore',new ZodValidationPipe(FollowUpDateSchema))
    date?: string) { return this.servicing.list(p, date); }
    @Post('held-policies/:id/servicing-requests')
    @Idempotent()
    @RequirePermission('book.servicing')
    create(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Body(new ZodValidationPipe(ServicingSchema))
    body: z.infer<typeof ServicingSchema>) { return this.servicing.create(p, id, body); }
    @Patch('servicing-requests/:id')
    @RequirePermission('book.servicing')
    patch(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Headers('if-match')
    match: string | undefined,
    @Body(new ZodValidationPipe(ServicingPatchSchema))
    body: z.infer<typeof ServicingPatchSchema>) { return this.servicing.patch(p, id, body, parseIfMatch(match)); }
    @Post('servicing-requests/:id/notes')
    @HttpCode(200)
    @Idempotent()
    @RequirePermission('book.servicing')
    note(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Body(new ZodValidationPipe(NoteSchema))
    body: z.infer<typeof NoteSchema>) { return this.servicing.note(p, id, body.text); }
}

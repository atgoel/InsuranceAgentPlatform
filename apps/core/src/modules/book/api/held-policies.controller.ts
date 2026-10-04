import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { parseIfMatch } from '../../../kernel/http/if-match';
import { HeldPolicyService } from '../application/held-policy.service';
import { RegisterPolicySchema, PatchPolicySchema, PaymentSchema, ListPolicySchema } from './schemas';
@Controller('api/v1/held-policies')
export class HeldPoliciesController {
    constructor(private readonly held: HeldPolicyService) { }
    @Get()
    @RequirePermission('book.read')
    list(
    @CurrentPrincipal()
    p: Principal,
    @Query(new ZodValidationPipe(ListPolicySchema))
    q: z.infer<typeof ListPolicySchema>) { const custom: Record<string, string> = {}; for (const [key, value] of Object.entries(q))
        if (key.startsWith('cf.') && typeof value === 'string')
            custom[key.slice(3)] = value; return this.held.list(p, { ...q, custom }); }
    @Get(':id')
    @RequirePermission('book.read')
    get(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string) { return this.held.get(p, id); }
    @Post()
    @Idempotent()
    @RequirePermission('book.write')
    register(
    @CurrentPrincipal()
    p: Principal,
    @Body(new ZodValidationPipe(RegisterPolicySchema))
    body: z.infer<typeof RegisterPolicySchema>) { return this.held.register(p, body); }
    @Post(':id/payments')
    @HttpCode(200)
    @Idempotent()
    @RequirePermission('book.write')
    pay(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Body(new ZodValidationPipe(PaymentSchema))
    body: z.infer<typeof PaymentSchema>) { return this.held.payment(p, id, body); }
    @Patch(':id')
    @RequirePermission('book.write')
    patch(
    @CurrentPrincipal()
    p: Principal,
    @Param('id')
    id: string,
    @Headers('if-match')
    match: string | undefined,
    @Body(new ZodValidationPipe(PatchPolicySchema))
    body: z.infer<typeof PatchPolicySchema>) { return this.held.patch(p, id, body, parseIfMatch(match)); }
}

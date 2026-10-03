import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { parseIfMatch } from '../../../kernel/http/if-match';
import { PartyService } from '../application/party.service';
import { PartyQueryService } from '../application/party-query.service';
import { ConsentService } from '../application/consent.service';
import { SensitivePartyAccessor } from '../application/sensitive-party.accessor';
import { partyView } from '../application/party-views';
import { householdView } from './views';
import { CreatePartySchema, ListPartiesQuery, PatchPartySchema, SensitiveQuery } from './schemas';

/** Customers (CRM04, CRM09). Views are always masked; P3 only via /sensitive (audited). */
@Controller('api/v1/parties')
export class PartiesController {
  constructor(
    private readonly parties: PartyService,
    private readonly queries: PartyQueryService,
    private readonly consents: ConsentService,
    private readonly sensitiveAccessor: SensitivePartyAccessor,
  ) {}

  @Post()
  @Idempotent()
  @RequirePermission('party.write')
  async create(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(CreatePartySchema)) body: z.infer<typeof CreatePartySchema>) {
    const { onDuplicate, ...input } = body;
    const { party, candidates } = await this.parties.create(p, input, onDuplicate);
    return {
      party: partyView(party),
      duplicateCandidates: candidates.map(({ id, partyAId, partyBId, score, rule, explanation }) => ({ id, partyAId, partyBId, score, rule, explanation })),
    };
  }

  @Get()
  @RequirePermission('party.read')
  list(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ListPartiesQuery)) q: z.infer<typeof ListPartiesQuery>) {
    return q.q ? this.queries.search(p, q.q) : this.queries.list(p, q);
  }

  @Get(':id')
  @RequirePermission('party.read')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const [{ party, household, roles }, consents] = await Promise.all([this.parties.detail(p, id), this.consents.ledger(p, id)]);
    return { ...partyView(party), household: household && householdView(household), roles, consentSummary: consents.summary };
  }

  @Patch(':id')
  @RequirePermission('party.write')
  async update(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined, @Body(new ZodValidationPipe(PatchPartySchema)) body: z.infer<typeof PatchPartySchema>) {
    return partyView(await this.parties.update(p, id, body, parseIfMatch(ifMatch)));
  }

  @Get(':id/sensitive')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('party.sensitive.read')
  sensitive(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Query(new ZodValidationPipe(SensitiveQuery)) q: z.infer<typeof SensitiveQuery>) {
    return this.sensitiveAccessor.sensitive(p, id, q.purpose);
  }
}

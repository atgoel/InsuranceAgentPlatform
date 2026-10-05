import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Response } from 'express';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { etagFor, parseIfMatch } from '../../../kernel/http/if-match';
import { PartyService } from '../application/party.service';
import { PartyQueryService } from '../application/party-query.service';
import { ConsentService } from '../application/consent.service';
import { SensitivePartyAccessor } from '../application/sensitive-party.accessor';
import { Party } from '../domain/party';
import { partyView } from '../application/party-views';
import { householdView } from './views';
import { CreatePartySchema, ListPartiesQuery, PatchPartySchema, ReplaceCustomFieldsSchema, SensitiveQuery } from './schemas';

/** Customers (CRM04, CRM09). Views are always masked; P3 only via /sensitive (audited). */
@Controller('api/v1/parties')
export class PartiesController {
  constructor(
    private readonly parties: PartyService,
    private readonly queries: PartyQueryService,
    private readonly consents: ConsentService,
    private readonly sensitiveAccessor: SensitivePartyAccessor,
  ) {}

  private async view(p: Principal, party: Party) {
    const [defs, ownerName] = await Promise.all([this.parties.activeDefinitions(p), this.queries.ownerNameOf(p.tenantId, party.props.ownerMemberId)]);
    return partyView(party, defs, ownerName);
  }

  @Post()
  @Idempotent()
  @RequirePermission('party.write')
  async create(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(CreatePartySchema)) body: z.infer<typeof CreatePartySchema>) {
    const { onDuplicate, ...input } = body;
    const { party, candidates } = await this.parties.create(p, input, onDuplicate);
    return {
      party: await this.view(p, party),
      duplicateCandidates: candidates.map(({ id, partyAId, partyBId, score, rule, explanation }) => ({ id, partyAId, partyBId, score, rule, explanation })),
    };
  }

  @Get()
  @RequirePermission('party.read')
  list(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ListPartiesQuery)) q: z.infer<typeof ListPartiesQuery>) {
    return q.q ? this.queries.search(p, q.q, q.segment) : this.queries.list(p, q);
  }

  @Get(':id')
  @RequirePermission('party.read')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const [{ party, household, roles }, consents] = await Promise.all([this.parties.detail(p, id), this.consents.ledger(p, id)]);
    return { ...(await this.view(p, party)), household: household && householdView(household), roles, consentSummary: consents.summary };
  }

  @Patch(':id')
  @RequirePermission('party.write')
  async update(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined, @Body(new ZodValidationPipe(PatchPartySchema)) body: z.infer<typeof PatchPartySchema>) {
    const party = await this.parties.update(p, id, body, parseIfMatch(ifMatch));
    return this.view(p, party);
  }

  @Put(':id/custom-fields')
  @RequirePermission('party.write')
  async replaceCustomFields(
    @CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(ReplaceCustomFieldsSchema)) body: z.infer<typeof ReplaceCustomFieldsSchema>, @Res({ passthrough: true }) res: Response,
  ) {
    const party = await this.parties.replaceCustomFields(p, id, body.customFields, parseIfMatch(ifMatch));
    res.setHeader('ETag', etagFor(party.props.version));
    return this.view(p, party);
  }

  @Get(':id/sensitive')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('party.sensitive.read')
  sensitive(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Query(new ZodValidationPipe(SensitiveQuery)) q: z.infer<typeof SensitiveQuery>) {
    return this.sensitiveAccessor.sensitive(p, id, q.purpose);
  }
}

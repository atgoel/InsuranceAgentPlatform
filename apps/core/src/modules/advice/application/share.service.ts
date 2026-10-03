import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { ComparisonRow, PremiumBreakdown, QuoteStatus } from '../domain/quote';
import { ShareToken } from '../domain/share-token';
import { PARTY_FACADE, PartyFacade, QUOTE_REPOSITORY, QuoteRepository, SHARE_TOKEN_SIGNER } from './ports';
import { AdviceContext } from './advice-context';
import { QuoteViews } from './quote-views';

/** Read-only comparison for the customer: first name only, no contact data, no party or member ids. */
export interface PublicShareView {
  customerFirstName: string;
  disclosure: string;
  status: QuoteStatus;
  expiresAt: string;
  options: Array<{ optionId: string; productName: string; insurerName: string; premium: PremiumBreakdown; sumAssuredPaise: number; validUntil: string }>;
  comparison: ComparisonRow[];
}

@Injectable()
export class ShareService {
  constructor(
    @Inject(SHARE_TOKEN_SIGNER) private readonly signer: ShareToken,
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(PARTY_FACADE) private readonly parties: PartyFacade,
    private readonly views: QuoteViews,
    private readonly ctx: AdviceContext,
  ) {}

  /** Tenant comes from the verified host and must match the signed token; any failure is a 404 plus a security log (no token value). */
  async resolve(token: string, hostTenantId: string): Promise<PublicShareView> {
    const verdict = this.signer.verify(token, hostTenantId, this.ctx.clock.now());
    if (!verdict.ok) {
      this.ctx.logger.security('security.quote_share_rejected', 'Quote share link rejected', { reason: verdict.reason });
      throw new NotFoundError('quote_share');
    }
    return this.ctx.uow.run(hostTenantId, async (tx) => {
      const quote = await this.quotes.get(tx, verdict.payload.quoteRequestId);
      if (!quote) throw new NotFoundError('quote_share');
      const p = quote.props;
      const party = await this.parties.summary(tx, p.partyId);
      const details = await this.views.details(p.options.map((o) => o.versionId));
      // No caller exists on a public link: the capturing advisor's scope gives the disclosure when no advice record is linked.
      const advisor = p.options[0]?.capturedBy ?? 'unknown';
      const advisorPrincipal: Principal = { userRef: advisor, tenantId: hostTenantId, memberId: advisor, roles: [], realm: 'customers' };
      return {
        customerFirstName: (party?.displayName ?? '').trim().split(/\s+/)[0] ?? '',
        disclosure: await this.views.disclosure(tx, advisorPrincipal, quote),
        status: p.status,
        expiresAt: new Date(verdict.payload.exp * 1000).toISOString(),
        options: p.options.map((o) => ({
          optionId: o.id,
          productName: details.get(o.versionId)?.productName ?? o.versionId,
          insurerName: details.get(o.versionId)?.insurerName ?? '',
          premium: o.premium,
          sumAssuredPaise: o.sumAssuredPaise,
          validUntil: o.validUntil,
        })),
        comparison: quote.comparison(),
      };
    });
  }
}

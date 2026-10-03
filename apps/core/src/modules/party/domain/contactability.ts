import { Party } from './party';
import { ConsentLedger, ConsentPurpose } from './consent';
import { Suppression } from './suppression';
import { isActive } from './suppression';

export type { ConsentPurpose };

export type ConsentChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL' | 'ANY';
export type ContactabilityReason = 'ok' | 'party_inactive' | 'no_contact_point' | 'suppressed' | 'consent_missing' | 'consent_withdrawn';

export interface ContactabilityQuery {
  readonly party: Party;
  readonly ledger: ConsentLedger;
  readonly suppressions: Suppression[];
  readonly channel: Exclude<ConsentChannel, 'ANY'>;
  readonly purpose: ConsentPurpose;
  readonly at: Date;
}

export type SuppressionReason = 'DND' | 'OPT_OUT' | 'BOUNCE' | 'DSR' | 'COMPLAINT';

export interface ContactabilityDecision {
  readonly allowed: boolean;
  readonly reason: ContactabilityReason;
  readonly detail?: { suppressionReason?: SuppressionReason; consentRecordId?: string };
}

export interface ContactabilityRule {
  readonly name: string;
  evaluate(q: ContactabilityQuery): ContactabilityDecision | undefined;
}

export class PartyActiveRule implements ContactabilityRule {
  readonly name = 'PartyActiveRule';

  evaluate(q: ContactabilityQuery): ContactabilityDecision | undefined {
    if (q.party.props.status !== 'ACTIVE') {
      return { allowed: false, reason: 'party_inactive' };
    }
    return undefined;
  }
}

export class ContactPointRule implements ContactabilityRule {
  readonly name = 'ContactPointRule';

  evaluate(q: ContactabilityQuery): ContactabilityDecision | undefined {
    const channel = this.channelForContact(q.channel);
    const hasContact = q.party.props.contactPoints.some((cp) => cp.channel === channel);
    if (!hasContact) {
      return { allowed: false, reason: 'no_contact_point' };
    }
    return undefined;
  }

  private channelForContact(channel: string): string {
    if (channel === 'SMS' || channel === 'WHATSAPP' || channel === 'CALL') {
      return 'MOBILE';
    }
    return 'EMAIL';
  }
}

export class SuppressionRule implements ContactabilityRule {
  readonly name = 'SuppressionRule';

  evaluate(q: ContactabilityQuery): ContactabilityDecision | undefined {
    const primaryCP = q.party.primary(this.channelForContact(q.channel));
    if (!primaryCP) {
      return undefined;
    }

    for (const supp of q.suppressions) {
      if (supp.contactHash === primaryCP.valueHash && isActive(supp, q.at)) {
        if (supp.channel === q.channel || supp.channel === 'ANY') {
          return {
            allowed: false,
            reason: 'suppressed',
            detail: { suppressionReason: supp.reason },
          };
        }
      }
    }
    return undefined;
  }

  private channelForContact(channel: string): string {
    if (channel === 'SMS' || channel === 'WHATSAPP' || channel === 'CALL') {
      return 'MOBILE';
    }
    return 'EMAIL';
  }
}

export class ConsentRule implements ContactabilityRule {
  readonly name = 'ConsentRule';

  evaluate(q: ContactabilityQuery): ContactabilityDecision | undefined {
    const state = q.ledger.stateFor(q.purpose, q.channel);

    if (q.purpose === 'SERVICE') {
      if (!state.record) {
        return { allowed: true, reason: 'ok' };
      }
      if (state.granted) {
        return { allowed: true, reason: 'ok' };
      }
      return { allowed: false, reason: 'consent_withdrawn', detail: { consentRecordId: state.record.id } };
    }

    if (!state.record) {
      return { allowed: false, reason: 'consent_missing' };
    }

    if (!state.granted) {
      return { allowed: false, reason: 'consent_withdrawn', detail: { consentRecordId: state.record.id } };
    }

    return { allowed: true, reason: 'ok' };
  }
}

export class ContactabilityPolicy {
  private rules: ContactabilityRule[];

  constructor(rules?: ContactabilityRule[]) {
    this.rules = rules ?? [
      new PartyActiveRule(),
      new ContactPointRule(),
      new SuppressionRule(),
      new ConsentRule(),
    ];
  }

  decide(q: ContactabilityQuery): ContactabilityDecision {
    for (const rule of this.rules) {
      const decision = rule.evaluate(q);
      if (decision !== undefined) {
        return decision;
      }
    }
    return { allowed: true, reason: 'ok' };
  }
}

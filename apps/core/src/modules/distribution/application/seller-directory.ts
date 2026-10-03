import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Member } from '../domain/member';
import { Licence, LicenceKind } from '../domain/licence';
import { SellingScope } from '../domain/selling-scope';
import {
  EligibleSeller, InsurerCodeRepository, LeaveRepository, LicenceRepository, MemberRepository, SellerCriteria, SellerDirectory,
} from './ports';

type Line = 'LIFE' | 'HEALTH' | 'GENERAL';
const ALL_LINES: Line[] = ['LIFE', 'HEALTH', 'GENERAL'];
const LICENCE_LINES: Partial<Record<LicenceKind, Line[]>> = { POSP_LIFE: ['LIFE'], POSP_GENERAL: ['HEALTH', 'GENERAL'], INDIVIDUAL_AGENT: ALL_LINES };
/** Salesperson types that may only sell lines covered by a valid licence (POSP, agents). */
const LICENCE_BOUND = new Set(['POSP', 'SOLO']);

/** Routing eligibility and selling scope (F05, F78) — consumed by M04 routing and M05 comparison scope. */
export class SellerDirectoryService implements SellerDirectory {
  constructor(
    private readonly members: MemberRepository,
    private readonly licences: LicenceRepository,
    private readonly leaves: LeaveRepository,
    private readonly codes: InsurerCodeRepository,
  ) {}

  async eligibleSellers(tx: Transaction, criteria: SellerCriteria): Promise<EligibleSeller[]> {
    const { items } = await this.members.list(tx, { status: 'active', orgUnitIds: criteria.orgUnitIds, limit: 10_000 });
    const eligible: EligibleSeller[] = [];
    for (const member of items) {
      if (await this.isEligible(tx, member, criteria)) eligible.push(toSeller(member));
    }
    return eligible;
  }

  async sellingScope(tx: Transaction, memberId: string, at: Date): Promise<SellingScope | undefined> {
    const member = await this.members.get(tx, memberId);
    const type = member?.props.salespersonType;
    if (!member || !type || member.props.status !== 'active') return undefined;
    const codes = await this.codes.list(tx, memberId);
    return {
      memberId,
      salespersonType: type,
      posEligibleOnly: type === 'POSP',
      lines: await this.linesFor(tx, member, at),
      insurerCodes: Object.fromEntries(codes.map((c) => [c.insurerId, c.code])),
    };
  }

  private async isEligible(tx: Transaction, member: Member, c: SellerCriteria): Promise<boolean> {
    const type = member.props.salespersonType;
    if (!type) return false;
    if (type === 'POSP' && c.posEligibleProduct === false) return false;
    if (c.language && !member.props.languages.includes(c.language)) return false;
    if (await this.leaves.isOnLeave(tx, member.props.id, c.at)) return false;
    return !c.line || (await this.linesFor(tx, member, c.at)).includes(c.line);
  }

  private async linesFor(tx: Transaction, member: Member, at: Date): Promise<Line[]> {
    if (!LICENCE_BOUND.has(member.props.salespersonType ?? '')) return ALL_LINES;
    const valid = (await this.licences.listForMember(tx, member.props.id)).filter((l) => isValidOn(l, at));
    return ALL_LINES.filter((line) => valid.some((l) => (LICENCE_LINES[l.kind] ?? []).includes(line)));
  }
}

function isValidOn(licence: Licence, at: Date): boolean {
  const day = at.toISOString().slice(0, 10);
  return licence.validFrom <= day && day <= licence.validTo;
}

function toSeller(m: Member): EligibleSeller {
  const p = m.props;
  return { memberId: p.id, displayName: p.displayName, orgUnitId: p.orgUnitId, salespersonType: p.salespersonType ?? 'EMPLOYEE', capacityPerDay: p.capacityPerDay, skills: p.skills, languages: p.languages };
}

import { Inject, Injectable } from '@nestjs/common';
import { Party } from '../domain/party';
import { DuplicateMatcher, DuplicateSignal, MatchCandidateInput } from '../domain/dedup-rules';
import { normaliseName } from '../domain/name-matching';
import { DUPLICATE_REPOSITORY, DuplicateCandidate, DuplicateRepository, FIELD_CIPHER, FieldCipher, PARTY_REPOSITORY, PartyRepository, Transaction } from './ports';
import { PartyContext } from './party-context';

const QUEUE_THRESHOLD = 60;
const NAME_POOL_LIMIT = 50;

/**
 * Finds duplicate candidates for a party **within the tenant only** (F40): the pool is parties sharing a contact
 * hash or PAN hash, plus name-prefix matches with the same birth year; each pair is scored by the DuplicateMatcher.
 */
@Injectable()
export class DuplicateDetector {
  private readonly matcher = new DuplicateMatcher();

  constructor(
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(DUPLICATE_REPOSITORY) private readonly duplicates: DuplicateRepository,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly ctx: PartyContext,
  ) {}

  /** Scores candidates (not persisted), strongest first. `dob` is the plaintext DOB when the caller has it. */
  async find(tx: Transaction, party: Party, dob?: string): Promise<DuplicateCandidate[]> {
    const self = await this.matchInput(tx, party, dob);
    const found: DuplicateCandidate[] = [];
    for (const other of await this.pool(tx, party)) {
      const signal = this.matcher.compare(self, await this.matchInput(tx, other, undefined, party.props.dobYear));
      if (signal && this.matcher.isCandidate(signal, QUEUE_THRESHOLD)) found.push(this.candidate(party.props.id, other.props.id, signal));
    }
    return found.sort((a, b) => b.score - a.score);
  }

  async queue(tx: Transaction, candidates: readonly DuplicateCandidate[]): Promise<void> {
    for (const c of candidates) {
      await this.duplicates.upsertCandidate(tx, c);
      this.ctx.metrics.counter('party_duplicates_detected_total', 'Duplicate candidates queued', ['rule']).inc({ rule: c.rule });
    }
  }

  private async pool(tx: Transaction, party: Party): Promise<Party[]> {
    const byId = new Map<string, Party>();
    const add = (ps: Party[]) => ps.forEach((p) => p.props.id !== party.props.id && p.props.status === 'ACTIVE' && byId.set(p.props.id, p));
    for (const cp of party.props.contactPoints) add(await this.parties.findByContactHash(tx, cp.valueHash));
    if (party.props.panHash) add(await this.parties.findByPanHash(tx, party.props.panHash));
    const firstToken = normaliseName(party.props.displayName).split(' ')[0] ?? '';
    if (firstToken.length >= 2 && party.props.dobYear) {
      add((await this.parties.searchByName(tx, firstToken, NAME_POOL_LIMIT)).filter((p) => p.props.dobYear === party.props.dobYear));
    }
    return [...byId.values()];
  }

  private async matchInput(tx: Transaction, party: Party, dob?: string, decryptOnlyForYear?: number): Promise<MatchCandidateInput> {
    const p = party.props;
    return {
      partyId: p.id,
      displayName: p.displayName,
      contactHashes: p.contactPoints.map((c) => c.valueHash),
      panHash: p.panHash,
      dobYear: p.dobYear,
      dobHash: await this.dobHash(tx, party, dob, decryptOnlyForYear),
    };
  }

  /** Decrypts a stored DOB only when the birth years already agree (keeps P3 decryption to the minimum). */
  private async dobHash(tx: Transaction, party: Party, dob: string | undefined, onlyForYear: number | undefined): Promise<string | undefined> {
    if (dob) return this.cipher.hash(tx.tenantId, dob);
    const { dateOfBirthEnc, dobYear } = party.props;
    if (!dateOfBirthEnc || (onlyForYear !== undefined && dobYear !== onlyForYear)) return undefined;
    return this.cipher.hash(tx.tenantId, await this.cipher.decrypt(tx.tenantId, dateOfBirthEnc));
  }

  private candidate(x: string, y: string, signal: DuplicateSignal): DuplicateCandidate {
    const [partyAId, partyBId] = x < y ? [x, y] : [y, x];
    return {
      id: this.ctx.ids.next('dup'), partyAId, partyBId, score: signal.score, rule: signal.rule, explanation: signal.explanation,
      status: 'open', createdAt: this.ctx.clock.now().toISOString(),
    };
  }
}

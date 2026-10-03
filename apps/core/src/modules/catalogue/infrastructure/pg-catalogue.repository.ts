import { Pool } from 'pg';
import { Insurer, LineOfBusiness, Product } from '../domain/catalogue';
import { ProductVersion, ProductVersionProps, VersionStatus } from '../domain/product-version';
import { ResearchSummary } from '../domain/research';
import { CatalogueRepository } from '../application/ports';

interface VersionRow {
  id: string; product_id: string; insurer_id: string; line: LineOfBusiness; uin: string; wording_version: string; wording_url: string | null;
  pos_eligible: boolean; channels: ProductVersionProps['channels']; effective_from: string; effective_to: string | null; status: VersionStatus;
  locked_at: Date | null; quote_requirements: string[]; key_facts: ProductVersionProps['keyFacts'];
}
interface ResearchRow { version_id: string; summary: string; points: string[]; source_ref: string; source_date: string; reviewed_wording_version: string; reviewed_at: Date }

const VERSION_COLUMNS = `id, product_id, insurer_id, line, uin, wording_version, wording_url, pos_eligible, channels, to_char(effective_from, 'YYYY-MM-DD') as effective_from,
  to_char(effective_to, 'YYYY-MM-DD') as effective_to, status, locked_at, quote_requirements, key_facts`;

/**
 * Platform-scope catalogue on Postgres (050_catalogue.sql). Reads go through the app role (SELECT only); operator
 * writes go through the owner pool, which is the only role allowed to change the catalogue.
 */
export class PgCatalogueRepository implements CatalogueRepository {
  constructor(
    private readonly reader: Pool,
    private readonly writer: Pool,
  ) {}

  async insurers(): Promise<Insurer[]> {
    const { rows } = await this.reader.query<{ id: string; name: string; irdai_reg_no: string; lines: LineOfBusiness[]; active: boolean }>(
      'select id, name, irdai_reg_no, lines, active from insurer order by name');
    return rows.map((r) => ({ id: r.id, name: r.name, irdaiRegNo: r.irdai_reg_no, lines: r.lines, active: r.active }));
  }

  async saveInsurer(i: Insurer): Promise<void> {
    await this.writer.query(
      `insert into insurer (id, name, irdai_reg_no, lines, active) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set name = excluded.name, irdai_reg_no = excluded.irdai_reg_no, lines = excluded.lines, active = excluded.active`,
      [i.id, i.name, i.irdaiRegNo, i.lines, i.active]);
  }

  async products(filter: { insurerId?: string; line?: LineOfBusiness } = {}): Promise<Product[]> {
    const { rows } = await this.reader.query<{ id: string; insurer_id: string; line: LineOfBusiness; name: string; category: Product['category'] }>(
      `select id, insurer_id, line, name, category from product where ($1::text is null or insurer_id = $1) and ($2::text is null or line = $2) order by name`,
      [filter.insurerId ?? null, filter.line ?? null]);
    return rows.map((r) => ({ id: r.id, insurerId: r.insurer_id, line: r.line, name: r.name, category: r.category }));
  }

  async saveProduct(p: Product): Promise<void> {
    await this.writer.query(
      `insert into product (id, insurer_id, line, name, category) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set name = excluded.name, category = excluded.category`,
      [p.id, p.insurerId, p.line, p.name, p.category]);
  }

  async versions(filter: { productId?: string; status?: VersionStatus } = {}): Promise<ProductVersionProps[]> {
    const { rows } = await this.reader.query<VersionRow>(
      `select ${VERSION_COLUMNS} from product_version where ($1::text is null or product_id = $1) and ($2::text is null or status = $2) order by id`,
      [filter.productId ?? null, filter.status ?? null]);
    return rows.map(toProps);
  }

  async getVersion(id: string): Promise<ProductVersion | undefined> {
    const { rows } = await this.reader.query<VersionRow>(`select ${VERSION_COLUMNS} from product_version where id = $1`, [id]);
    return rows[0] && ProductVersion.restore(toProps(rows[0]));
  }

  async saveVersion(v: ProductVersion): Promise<void> {
    const p = v.props;
    await this.writer.query(
      `insert into product_version (id, product_id, insurer_id, line, uin, wording_version, wording_url, pos_eligible, channels, effective_from, effective_to,
         status, locked_at, quote_requirements, key_facts)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       on conflict (id) do update set wording_url = excluded.wording_url, pos_eligible = excluded.pos_eligible, channels = excluded.channels,
         effective_to = excluded.effective_to, status = excluded.status, locked_at = excluded.locked_at,
         quote_requirements = excluded.quote_requirements, key_facts = excluded.key_facts`,
      [p.id, p.productId, p.insurerId, p.line, p.uin, p.wordingVersion, p.wordingUrl ?? null, p.posEligible, p.channels, p.effectiveFrom, p.effectiveTo ?? null,
        p.status, p.lockedAt ?? null, p.quoteRequirements, JSON.stringify(p.keyFacts)]);
  }

  async research(versionIds: readonly string[]): Promise<ResearchSummary[]> {
    if (versionIds.length === 0) return [];
    const { rows } = await this.reader.query<ResearchRow>(
      `select version_id, summary, points, source_ref, to_char(source_date, 'YYYY-MM-DD') as source_date, reviewed_wording_version, reviewed_at
       from research_summary where version_id = any($1::text[])`, [versionIds]);
    return rows.map((r) => ({
      versionId: r.version_id, summary: r.summary, points: r.points, sourceRef: r.source_ref, sourceDate: r.source_date,
      reviewedWordingVersion: r.reviewed_wording_version, reviewedAt: r.reviewed_at.toISOString(),
    }));
  }

  async saveResearch(r: ResearchSummary): Promise<void> {
    await this.writer.query(
      `insert into research_summary (version_id, summary, points, source_ref, source_date, reviewed_wording_version, reviewed_at) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (version_id) do update set summary = excluded.summary, points = excluded.points, source_ref = excluded.source_ref,
         source_date = excluded.source_date, reviewed_wording_version = excluded.reviewed_wording_version, reviewed_at = excluded.reviewed_at`,
      [r.versionId, r.summary, JSON.stringify(r.points), r.sourceRef, r.sourceDate, r.reviewedWordingVersion, r.reviewedAt]);
  }
}

function toProps(r: VersionRow): ProductVersionProps {
  return {
    id: r.id, productId: r.product_id, insurerId: r.insurer_id, line: r.line, uin: r.uin, wordingVersion: r.wording_version,
    ...(r.wording_url ? { wordingUrl: r.wording_url } : {}), posEligible: r.pos_eligible, channels: r.channels, effectiveFrom: r.effective_from,
    ...(r.effective_to ? { effectiveTo: r.effective_to } : {}), status: r.status, ...(r.locked_at ? { lockedAt: r.locked_at.toISOString() } : {}),
    quoteRequirements: r.quote_requirements, keyFacts: r.key_facts,
  };
}

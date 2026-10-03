import { Pool } from 'pg';
import { ProductVersion } from '../domain/product-version';
import { PgCatalogueRepository } from './pg-catalogue.repository';
import { SEED_INSURERS, SEED_PRODUCTS, SEED_RESEARCH, SEED_VERSIONS } from './seed-catalogue';

/** Loads the development catalogue into an empty Postgres catalogue (owner role). Never overwrites operator data. */
export async function seedCatalogueIfEmpty(owner: Pool): Promise<boolean> {
  const { rows } = await owner.query<{ n: string }>('select count(*) as n from insurer');
  if (Number(rows[0]?.n ?? 0) > 0) return false;
  const repo = new PgCatalogueRepository(owner, owner);
  for (const i of SEED_INSURERS) await repo.saveInsurer(i);
  for (const p of SEED_PRODUCTS) await repo.saveProduct(p);
  for (const v of SEED_VERSIONS) await repo.saveVersion(ProductVersion.restore(v));
  for (const r of SEED_RESEARCH) await repo.saveResearch(r);
  return true;
}

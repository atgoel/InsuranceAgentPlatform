import { Insurer, Product } from '../domain/catalogue';
import { ProductVersionProps } from '../domain/product-version';
import { ResearchSummary } from '../domain/research';

/**
 * Launch catalogue seed (platform scope). Names and UINs are representative fixtures for development and tests;
 * the production catalogue is loaded by operators through /ops/catalogue.
 */
export const SEED_INSURERS: Insurer[] = [
  { id: 'ins_hdfc_life', name: 'HDFC Life', irdaiRegNo: '101', lines: ['LIFE'], active: true },
  { id: 'ins_icici_pru', name: 'ICICI Prudential Life', irdaiRegNo: '105', lines: ['LIFE'], active: true },
  { id: 'ins_tata_aia', name: 'Tata AIA Life', irdaiRegNo: '110', lines: ['LIFE'], active: true },
  { id: 'ins_star', name: 'Star Health', irdaiRegNo: '129', lines: ['HEALTH'], active: true },
  { id: 'ins_niva', name: 'Niva Bupa', irdaiRegNo: '145', lines: ['HEALTH'], active: true },
  { id: 'ins_care', name: 'Care Health', irdaiRegNo: '148', lines: ['HEALTH'], active: true },
  { id: 'ins_icici_lombard', name: 'ICICI Lombard', irdaiRegNo: '115', lines: ['GENERAL', 'HEALTH'], active: true },
  { id: 'ins_hdfc_ergo', name: 'HDFC ERGO', irdaiRegNo: '146', lines: ['GENERAL', 'HEALTH'], active: false },
];

export const SEED_PRODUCTS: Product[] = [
  { id: 'prd_hdfc_term', insurerId: 'ins_hdfc_life', line: 'LIFE', name: 'Click 2 Protect Supreme', category: 'TERM' },
  { id: 'prd_hdfc_saral', insurerId: 'ins_hdfc_life', line: 'LIFE', name: 'Saral Jeevan Bima', category: 'TERM' },
  { id: 'prd_hdfc_sanchay', insurerId: 'ins_hdfc_life', line: 'LIFE', name: 'Sanchay Plus', category: 'SAVINGS' },
  { id: 'prd_icici_term', insurerId: 'ins_icici_pru', line: 'LIFE', name: 'iProtect Smart', category: 'TERM' },
  { id: 'prd_icici_ulip', insurerId: 'ins_icici_pru', line: 'LIFE', name: 'Signature Assure', category: 'ULIP' },
  { id: 'prd_tata_term', insurerId: 'ins_tata_aia', line: 'LIFE', name: 'Sampoorna Raksha Promise', category: 'TERM' },
  { id: 'prd_star_comp', insurerId: 'ins_star', line: 'HEALTH', name: 'Comprehensive', category: 'HEALTH_INDIVIDUAL' },
  { id: 'prd_star_floater', insurerId: 'ins_star', line: 'HEALTH', name: 'Family Health Optima', category: 'HEALTH_FLOATER' },
  { id: 'prd_star_arogya', insurerId: 'ins_star', line: 'HEALTH', name: 'Arogya Sanjeevani', category: 'STANDARD_HEALTH' },
  { id: 'prd_niva_reassure', insurerId: 'ins_niva', line: 'HEALTH', name: 'ReAssure 2.0', category: 'HEALTH_INDIVIDUAL' },
  { id: 'prd_care_supreme', insurerId: 'ins_care', line: 'HEALTH', name: 'Care Supreme', category: 'HEALTH_FLOATER' },
  { id: 'prd_icicil_motor', insurerId: 'ins_icici_lombard', line: 'GENERAL', name: 'Private Car Package', category: 'MOTOR' },
  { id: 'prd_ergo_motor', insurerId: 'ins_hdfc_ergo', line: 'GENERAL', name: 'Private Car Comprehensive', category: 'MOTOR' },
];

const ALL: ProductVersionProps['channels'] = ['IMF', 'BROKER', 'CORPORATE_AGENT', 'INDIVIDUAL_AGENT'];
/** Insurer and line come from the seed product, as they do for operator-created versions. */
function v([id, productId, uin, posEligible]: [string, string, string, boolean], extra: Partial<ProductVersionProps> = {}): ProductVersionProps {
  const product = SEED_PRODUCTS.find((p) => p.id === productId);
  if (!product) throw new Error(`Seed product ${productId} missing`);
  return {
    id, productId, insurerId: product.insurerId, line: product.line, uin, wordingVersion: 'v1', posEligible, channels: ALL, effectiveFrom: '2025-04-01',
    status: 'active', quoteRequirements: product.line === 'GENERAL' ? ['registration', 'vehicle'] : ['dob', 'sum_assured'], keyFacts: [], ...extra,
  };
}

export const SEED_VERSIONS: ProductVersionProps[] = [
  v(['pv_hdfc_term_v1', 'prd_hdfc_term', '101N183V01', false], { keyFacts: [{ label: 'Cover up to age', value: '85' }, { label: 'Claim settlement', value: 'Insurer published' }] }),
  v(['pv_hdfc_saral_v1', 'prd_hdfc_saral', '101N160V02', true]),
  v(['pv_hdfc_sanchay_v1', 'prd_hdfc_sanchay', '101N134V19', false]),
  v(['pv_icici_term_v1', 'prd_icici_term', '105N151V08', false]),
  v(['pv_icici_ulip_v1', 'prd_icici_ulip', '105L177V03', false], { channels: ['IMF', 'BROKER', 'CORPORATE_AGENT'] }),
  v(['pv_tata_term_v1', 'prd_tata_term', '110N160V05', false]),
  v(['pv_star_comp_v1', 'prd_star_comp', 'SHAHLIP22028V022122', false]),
  v(['pv_star_floater_v1', 'prd_star_floater', 'SHAHLIP21046V062021', true]),
  v(['pv_star_arogya_v1', 'prd_star_arogya', 'SHAHLIP21225V012021', true]),
  v(['pv_niva_reassure_v1', 'prd_niva_reassure', 'NBHHLIP23169V012223', false]),
  v(['pv_care_supreme_v1', 'prd_care_supreme', 'CHIHLIP23128V012223', true]),
  v(['pv_icicil_motor_v1', 'prd_icicil_motor', 'IRDAN115RP0017V01201920', true]),
  v(['pv_ergo_motor_v1', 'prd_ergo_motor', 'IRDAN125RP0001V01200102', true]),
  v(['pv_star_comp_v0', 'prd_star_comp', 'SHAHLIP20001V012019', false], { wordingVersion: 'v0', status: 'withdrawn', effectiveFrom: '2020-04-01', effectiveTo: '2025-03-31' }),
];

export const SEED_RESEARCH: ResearchSummary[] = [
  { versionId: 'pv_hdfc_term_v1', summary: 'Pure term cover with optional critical-illness and accidental-death riders.', points: ['Life cover to age 85', 'Return-of-premium variant available', 'Riders priced separately'], sourceRef: 'Policy wording v1, sections 2–4', sourceDate: '2025-04-01', reviewedWordingVersion: 'v1', reviewedAt: '2026-01-15T00:00:00.000Z' },
  { versionId: 'pv_star_floater_v1', summary: 'Family floater with automatic restoration of the sum insured.', points: ['100% restoration once a year', 'Day-care procedures covered', 'Pre-existing diseases after 36 months'], sourceRef: 'Policy wording v1, section 3', sourceDate: '2025-04-01', reviewedWordingVersion: 'v1', reviewedAt: '2026-02-01T00:00:00.000Z' },
  { versionId: 'pv_star_comp_v1', summary: 'Individual comprehensive cover including maternity after waiting period.', points: ['Maternity after 24 months', 'Outpatient dental and ophthalmic cover'], sourceRef: 'Policy wording v0', sourceDate: '2024-03-01', reviewedWordingVersion: 'v0', reviewedAt: '2025-06-01T00:00:00.000Z' },
  { versionId: 'pv_care_supreme_v1', summary: 'High sum insured floater with unlimited recharge.', points: ['Unlimited automatic recharge', 'No room-rent capping'], sourceRef: 'Policy wording v1', sourceDate: '2024-04-01', reviewedWordingVersion: 'v1', reviewedAt: '2024-09-01T00:00:00.000Z' },
];

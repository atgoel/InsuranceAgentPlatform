import { z } from 'zod';
import { RegisteredSchema, SchemaRegistry } from '../domain/schema-registry';
import { BusinessRuleError } from '../errors/domain-errors';
import { PolicyCategory, PolicyCommercials, PolicyCommercialsProps, lineOfCategory } from './policy-commercials';

const paise = z.number().int().safe().nonnegative();
const text = (max: number): z.ZodString => z.string().min(1).max(max);

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, { message: 'Not a real calendar date' });

const registrationNo = z
  .string()
  .transform((value) => value.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z.string().refine((value) => /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(value) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(value), {
      message: 'Invalid registration number',
    }),
  );

// ---------------------------------------------------------------- motor

export interface MotorRiskV1 {
  registrationNo: string;
  registrationYear: number;
  make: string;
  model: string;
  variant?: string;
  fuel?: 'PETROL' | 'DIESEL' | 'CNG' | 'LPG' | 'ELECTRIC' | 'HYBRID';
  ncbPercent: 0 | 20 | 25 | 35 | 45 | 50;
  claimInPreviousYear: boolean;
  odPremiumPaise: number;
  tpPremiumPaise: number;
  addOns: string[];
}

const motorSchema: z.ZodType<MotorRiskV1> = z
  .object({
    registrationNo,
    registrationYear: z.number().int().min(1950).max(2100),
    make: text(60),
    model: text(60),
    variant: text(60).optional(),
    fuel: z.enum(['PETROL', 'DIESEL', 'CNG', 'LPG', 'ELECTRIC', 'HYBRID']).optional(),
    ncbPercent: z.union([z.literal(0), z.literal(20), z.literal(25), z.literal(35), z.literal(45), z.literal(50)]),
    claimInPreviousYear: z.boolean(),
    odPremiumPaise: paise,
    tpPremiumPaise: paise,
    addOns: z.array(text(40)).max(20),
  })
  .refine((value) => !(value.claimInPreviousYear && value.ncbPercent !== 0), {
    path: ['ncbPercent'],
    message: 'NCB must be 0 when a claim was made in the previous year',
  });

export const MOTOR_V1: RegisteredSchema<MotorRiskV1> = { id: 'motor', version: 1, schema: motorSchema, p2Paths: ['registrationNo'] };

// ---------------------------------------------------------------- health

export type HealthRelation = 'SELF' | 'SPOUSE' | 'SON' | 'DAUGHTER' | 'FATHER' | 'MOTHER' | 'FATHER_IN_LAW' | 'MOTHER_IN_LAW' | 'OTHER';
export type AgeBand = '0-17' | '18-35' | '36-45' | '46-55' | '56-60' | '61-65' | '66-70' | '71+';

export interface HealthRiskV1 {
  coverType: 'INDIVIDUAL' | 'FLOATER';
  members: Array<{ relation: HealthRelation; ageBand: AgeBand }>;
  portabilityFrom?: { insurerName: string; continuousCoverSince: string };
}

const healthSchema: z.ZodType<HealthRiskV1> = z
  .object({
    coverType: z.enum(['INDIVIDUAL', 'FLOATER']),
    members: z
      .array(
        z.object({
          relation: z.enum(['SELF', 'SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'FATHER_IN_LAW', 'MOTHER_IN_LAW', 'OTHER']),
          ageBand: z.enum(['0-17', '18-35', '36-45', '46-55', '56-60', '61-65', '66-70', '71+']),
        }),
      )
      .min(1)
      .max(12),
    portabilityFrom: z.object({ insurerName: text(120), continuousCoverSince: realDate }).optional(),
  })
  .refine((value) => !(value.coverType === 'FLOATER' && value.members.length < 2), {
    path: ['members'],
    message: 'A floater cover needs at least two members',
  });

export const HEALTH_V1: RegisteredSchema<HealthRiskV1> = { id: 'health', version: 1, schema: healthSchema, p2Paths: [] };

export function memberMix(members: HealthRiskV1['members']): string {
  const adults = members.filter((member) => member.ageBand !== '0-17').length;
  const children = members.length - adults;
  return children === 0 ? `${adults}A` : `${adults}A+${children}C`;
}

// ---------------------------------------------------------------- life

export interface LifeRiskV1 {
  ppt: number;
  payoutOption?: string;
  riders: string[];
}

const lifeSchema: z.ZodType<LifeRiskV1> = z.object({
  ppt: z.number().int().min(1).max(100),
  payoutOption: text(40).optional(),
  riders: z.array(text(60)).max(10),
});

export const LIFE_V1: RegisteredSchema<LifeRiskV1> = { id: 'life', version: 1, schema: lifeSchema, p2Paths: [] };

// ---------------------------------------------------------------- registry helpers

export function createRiskSchemaRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry();
  registry.register(MOTOR_V1);
  registry.register(HEALTH_V1);
  registry.register(LIFE_V1);
  return registry;
}

export function riskSchemaFor(category: PolicyCategory): { id: string; version: number } | undefined {
  if (category === 'MOTOR') return { id: 'motor', version: 1 };
  if (category === 'HEALTH_INDIVIDUAL' || category === 'HEALTH_FLOATER' || category === 'STANDARD_HEALTH') {
    return { id: 'health', version: 1 };
  }
  if (lineOfCategory(category) === 'LIFE') return { id: 'life', version: 1 };
  return undefined;
}

function checkMotor(motor: MotorRiskV1, props: Readonly<PolicyCommercialsProps>, today: string): void {
  if (motor.odPremiumPaise + motor.tpPremiumPaise > props.premiumNetPaise) {
    throw new BusinessRuleError('motor_premium_exceeds_net', 'OD plus TP premium exceeds the net premium', {
      netPaise: props.premiumNetPaise,
    });
  }
  if (motor.registrationYear > Number(today.slice(0, 4))) {
    throw new BusinessRuleError('registration_year_in_future', 'Registration year is in the future');
  }
}

const FLOATER_CATEGORIES: readonly PolicyCategory[] = ['HEALTH_FLOATER', 'STANDARD_HEALTH'];
const INDIVIDUAL_CATEGORIES: readonly PolicyCategory[] = ['HEALTH_INDIVIDUAL', 'STANDARD_HEALTH'];

function checkHealth(health: HealthRiskV1, props: Readonly<PolicyCommercialsProps>): void {
  const allowed = health.coverType === 'FLOATER' ? FLOATER_CATEGORIES : INDIVIDUAL_CATEGORIES;
  if (!allowed.includes(props.category)) {
    throw new BusinessRuleError('cover_type_category_mismatch', 'Cover type does not match the policy category');
  }
  if (props.businessType === 'PORTABILITY' && health.portabilityFrom === undefined) {
    throw new BusinessRuleError('portability_details_required', 'Portability details are required');
  }
}

function checkLife(life: LifeRiskV1, props: Readonly<PolicyCommercialsProps>): void {
  if (props.policyTermMonths !== undefined && life.ppt * 12 > props.policyTermMonths) {
    throw new BusinessRuleError('ppt_exceeds_term', 'Premium paying term exceeds the policy term');
  }
}

export function checkRiskAgainstCommercials(schemaId: string, risk: unknown, commercials: PolicyCommercials, today: string): void {
  const props = commercials.props;
  if (schemaId === 'motor') checkMotor(risk as MotorRiskV1, props, today);
  else if (schemaId === 'health') checkHealth(risk as HealthRiskV1, props);
  else if (schemaId === 'life') checkLife(risk as LifeRiskV1, props);
}

import { z } from 'zod';

const SalespersonType = z.enum(['EMPLOYEE', 'ISP', 'POSP', 'SOLO']);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CreateOrgUnitSchema = z
  .object({ parentId: z.string().min(1), kind: z.enum(['REGION', 'BRANCH', 'TEAM']), name: z.string().trim().min(2).max(120), territoryCodes: z.array(z.string().max(20)).max(50).optional() })
  .strict();
export const MoveOrgUnitSchema = z.object({ parentId: z.string().min(1) }).strict();

export const InviteMemberSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    phone: z.string().optional(),
    email: z.string().optional(),
    roles: z.array(z.string().min(1)).min(1).max(10),
    salespersonType: SalespersonType.optional(),
    orgUnitId: z.string().min(1),
  })
  .strict();

export const ListMembersQuery = z.object({
  status: z.enum(['invited', 'onboarding', 'active', 'suspended', 'exited']).optional(),
  role: z.string().optional(),
  orgUnitId: z.string().optional(),
  salespersonType: SalespersonType.optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export const PatchMemberSchema = z
  .object({ roles: z.array(z.string()).min(1).max(10).optional(), orgUnitId: z.string().optional(), capacityPerDay: z.number().int().min(0).max(500).optional(),
    skills: z.array(z.string().min(1).max(40)).max(20).optional(), languages: z.array(z.string().min(2).max(10)).max(10).optional() })
  .strict();
export const MemberTransitionSchema = z.object({ to: z.enum(['active', 'suspended']), reason: z.string().trim().min(3).max(200) }).strict();
export const ExitMemberSchema = z.object({ transferToMemberId: z.string().optional(), reason: z.string().trim().min(3).max(200) }).strict();
export const EvidenceSchema = z.object({ key: z.enum(['IDENTITY_PAN', 'EXAM', 'CERTIFICATE', 'INSURER_CODE']), evidenceRef: z.string().min(1).max(120), note: z.string().max(200).optional() }).strict();
export const TrainingSchema = z.object({ hours: z.number().min(0.5).max(40), evidenceRef: z.string().min(1).max(120) }).strict();
export const InsurerCodeSchema = z.object({ code: z.string().trim().min(2).max(40) }).strict();
export const LicenceSchema = z
  .object({ kind: z.enum(['POSP_LIFE', 'POSP_GENERAL', 'ISP', 'INDIVIDUAL_AGENT', 'OTHER']), number: z.string().trim().min(3).max(40), validFrom: IsoDate, validTo: IsoDate })
  .strict();
export const ExpiringQuery = z.object({ withinDays: z.coerce.number().int().min(1).max(365).default(60) });
export const LeaveSchema = z.object({ from: IsoDate, to: IsoDate }).strict();
export const RolePermissionsSchema = z.object({ permissions: z.array(z.string()).max(100) }).strict();

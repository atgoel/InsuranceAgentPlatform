import { z } from 'zod';

export const ProvisionTenantSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  kind: z.enum(['SOLO', 'ORGANISATION']),
  planCode: z.enum(['SOLO', 'SOLO_PRO', 'TEAM', 'BUSINESS', 'WHITE_LABEL', 'DEDICATED']),
  entity: z.object({
    entityType: z.enum(['IMF', 'BROKER', 'INDIVIDUAL_AGENT', 'CORPORATE_AGENT']),
    legalName: z.string(),
    registrationNo: z.string(),
    registrationValidTo: z.string(),
    principalOfficerName: z.string().optional(),
  }),
  admin: z.object({
    name: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
});

export type ProvisionTenantInput = z.infer<typeof ProvisionTenantSchema>;

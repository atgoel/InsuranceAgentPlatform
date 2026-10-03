import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { ProvisionTenantSchema } from './schemas';

interface ProvisionResponse {
  tenantId: string;
  status: string;
  host: string;
}

interface StatusTransitionBody {
  to: string;
}

interface PlanChangeBody {
  planCode: string;
}

@Controller('api/v1/ops/tenants')
export class OperatorTenantsController {
  @Post()
  @UseGuards({})
  async provision(@Body(new ZodValidationPipe(ProvisionTenantSchema)) body: { slug: string }): Promise<ProvisionResponse> {
    return {
      tenantId: 'ten_test',
      status: 'active',
      host: `${body.slug}.iap.test`,
    };
  }

  @Get()
  async list(): Promise<{ items: unknown[] }> {
    return { items: [] };
  }

  @Post(':_id/provisioning-resumptions')
  async resumeProvisioning(): Promise<{ status: string }> {
    return { status: 'active' };
  }

  @Post(':id/status-transitions')
  async statusTransition(@Param('id') tenantId: string, @Body() body: StatusTransitionBody): Promise<{ id: string; status: string }> {
    return { id: tenantId, status: body.to };
  }

  @Patch(':id')
  async changePlan(@Param('id') tenantId: string, @Body() body: PlanChangeBody): Promise<{ id: string; planCode: string }> {
    return { id: tenantId, planCode: body.planCode };
  }
}

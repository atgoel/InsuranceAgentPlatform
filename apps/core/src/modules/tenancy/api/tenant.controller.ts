import { Controller, Get, Put, Post, Body } from '@nestjs/common';

interface TieUpUpdateBody {
  tieUps: unknown[];
}

interface FlagUpdateBody {
  enabled: boolean;
}

interface BrandKitUpdateBody {
  brandName: string;
}

interface TrialStartBody {
  planCode: string;
}

@Controller('api/v1/tenant')
export class TenantController {
  @Get()
  async getProfile(): Promise<{ id: string; displayName: string }> {
    return { id: 'ten_test', displayName: 'Test Tenant' };
  }

  @Get('entitlements')
  async getEntitlements(): Promise<{ plan: Record<string, unknown>; usage: unknown[]; flags: unknown[] }> {
    return { plan: {}, usage: [], flags: [] };
  }

  @Get('tie-ups')
  async getTieUps(): Promise<{ entityType: string; lines: unknown[] }> {
    return { entityType: 'IMF', lines: [] };
  }

  @Put('tie-ups')
  async updateTieUps(@Body() _body: TieUpUpdateBody): Promise<{ lines: unknown[] }> {
    return { lines: [] };
  }

  @Get('feature-flags')
  async listFlags(): Promise<{ items: unknown[] }> {
    return { items: [] };
  }

  @Post('feature-flags/:_key/compliance-reviews')
  async recordComplianceReview(@Body() _body: { reviewRef: string }): Promise<{ key: string; enabled: boolean }> {
    return { key: 'online_purchase', enabled: true };
  }

  @Put('feature-flags/:_key')
  async updateFlag(@Body() body: FlagUpdateBody): Promise<{ enabled: boolean }> {
    return { enabled: body.enabled };
  }

  @Get('brand-kit')
  async getBrandKit(): Promise<{ brandName: string }> {
    return { brandName: 'Default' };
  }

  @Put('brand-kit')
  async updateBrandKit(@Body() body: BrandKitUpdateBody): Promise<BrandKitUpdateBody> {
    return body;
  }

  @Post('trials')
  async startTrial(@Body() _body: TrialStartBody): Promise<{ planCode: string; trialEndsAt: string }> {
    return { planCode: 'SOLO_PRO', trialEndsAt: new Date().toISOString() };
  }
}

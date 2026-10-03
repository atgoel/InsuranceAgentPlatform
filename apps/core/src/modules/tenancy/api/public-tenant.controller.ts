import { Controller, Get, Post, Body } from '@nestjs/common';

interface SignupStartBody {
  phone: string;
  displayName: string;
  licence: { insurerName: string; line: string; licenceNo: string };
  consent: { noticeVersion: string; accepted: boolean };
}

interface SignupVerifyBody {
  otp: string;
}

interface TenantConfigResponse {
  displayName: string;
  brand: { brandName: string; primary: string; secondary: string; typeface: string };
  languages: string[];
}

@Controller('api/v1/public')
export class PublicTenantController {
  @Get('tenant-config')
  async getTenantConfig(): Promise<TenantConfigResponse> {
    return {
      displayName: 'Test',
      brand: {
        brandName: 'Test Brand',
        primary: '#1F5FBF',
        secondary: '#163F7F',
        typeface: 'IBM Plex Sans',
      },
      languages: ['en', 'hi'],
    };
  }

  @Post('solo-signups')
  async startSignup(@Body() _body: SignupStartBody): Promise<{ signupId: string; expiresAt: string }> {
    return { signupId: 'sig_test', expiresAt: new Date().toISOString() };
  }

  @Post('solo-signups/:_id/verifications')
  async verifySignup(@Body() _body: SignupVerifyBody): Promise<{ tenantId: string; host: string; status: string; licenceStatus: string }> {
    return {
      tenantId: 'ten_test',
      host: 'test.iap.test',
      status: 'active',
      licenceStatus: 'pending_verification',
    };
  }
}

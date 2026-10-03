import { Controller, Headers, HttpCode, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../../kernel/tenancy/decorators';
import { TwentyWebhookService } from '../application/twenty-webhook.service';

/** Inbound Twenty events (M04b). Public: authenticated by the per-workspace HMAC signature, never by a user token. */
@Controller('api/v1/webhooks/twenty')
@Public()
export class TwentyWebhookController {
  constructor(private readonly webhooks: TwentyWebhookService) {}

  @Post(':workspaceId')
  @HttpCode(200)
  receive(
    @Param('workspaceId') workspaceId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-twenty-signature') signature: string | undefined,
    @Headers('x-twenty-timestamp') timestamp: string | undefined,
  ) {
    return this.webhooks.receive(workspaceId, req.rawBody, signature, timestamp);
  }
}

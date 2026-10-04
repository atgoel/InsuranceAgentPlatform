import { Controller, HttpCode, Post, Param, Req } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../../kernel/tenancy/decorators';
import { RequestContext } from '../../../kernel/observability/request-context';
import { CallbackService } from '../application/callback.service';
@Controller('api/v1/callbacks')
export class CallbacksController {
  constructor(private readonly callbacks: CallbackService) { }
  @Post(':adapterId')
  @Public()
  @HttpCode(200)
  accept(
  @Param('adapterId')
  adapterId: string,
  @Req()
  request: RawBodyRequest<Request>) {
    const req = request as unknown as {
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
    };
    const signature = req.headers['x-callback-signature'];
    const timestamp = req.headers['x-callback-timestamp'];
    return this.callbacks.accept({
      adapterId,
      tenantId: RequestContext.current()?.tenantId,
      rawBody: req.rawBody ?? Buffer.alloc(0),
      signatureHeader: typeof signature === 'string' ? signature : undefined,
      timestampHeader: typeof timestamp === 'string' ? timestamp : undefined,
    });
  }
}

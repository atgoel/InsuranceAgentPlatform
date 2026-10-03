import { Body, Controller, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { OperatorOnly } from '../../../kernel/tenancy/decorators';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { CatalogueAdminService } from '../application/catalogue-admin.service';
import { InsurerSchema, ProductSchema, ResearchSchema, VersionPatchSchema, VersionSchema, WithdrawalSchema } from './schemas';

/** Platform catalogue maintenance (W09). Workforce realm + platform.operator only; tenant users get 403. */
@Controller('api/v1/ops/catalogue')
@OperatorOnly()
export class OperatorCatalogueController {
  constructor(private readonly admin: CatalogueAdminService) {}

  @Put('insurers')
  upsertInsurer(@Body(new ZodValidationPipe(InsurerSchema)) body: z.infer<typeof InsurerSchema>) {
    return this.admin.upsertInsurer(body);
  }

  @Put('products')
  upsertProduct(@Body(new ZodValidationPipe(ProductSchema)) body: z.infer<typeof ProductSchema>) {
    return this.admin.upsertProduct(body);
  }

  @Post('versions')
  @Idempotent()
  createDraft(@Body(new ZodValidationPipe(VersionSchema)) body: z.infer<typeof VersionSchema>) {
    return this.admin.createDraft(body);
  }

  /** Edits a version that has not been quoted yet; locked versions → 422 product_version_locked. */
  @Put('versions/:id')
  edit(@Param('id') id: string, @Body(new ZodValidationPipe(VersionPatchSchema)) body: z.infer<typeof VersionPatchSchema>) {
    return this.admin.edit(id, body);
  }

  @Post('versions/:id/activation')
  @HttpCode(200)
  @Idempotent()
  activate(@Param('id') id: string) {
    return this.admin.activate(id);
  }

  @Post('versions/:id/withdrawal')
  @HttpCode(200)
  @Idempotent()
  withdraw(@Param('id') id: string, @Body(new ZodValidationPipe(WithdrawalSchema)) body: z.infer<typeof WithdrawalSchema>) {
    return this.admin.withdraw(id, body.on);
  }

  @Put('versions/:id/research')
  research(@Param('id') id: string, @Body(new ZodValidationPipe(ResearchSchema)) body: z.infer<typeof ResearchSchema>) {
    return this.admin.saveResearch(id, body);
  }
}

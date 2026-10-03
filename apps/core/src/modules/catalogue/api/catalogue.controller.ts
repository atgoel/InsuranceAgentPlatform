import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { CatalogueQueryService } from '../application/catalogue-query.service';
import { CatalogueQuery, EvaluationSchema, ResearchQuery } from './schemas';

/** Tenant-facing catalogue (W07 table, M07 research library, compare). Every read is scoped by LA-6. */
@Controller('api/v1/catalogue')
export class CatalogueController {
  constructor(private readonly queries: CatalogueQueryService) {}

  @Get('products')
  @RequirePermission('catalogue.read')
  products(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(CatalogueQuery)) q: z.infer<typeof CatalogueQuery>) {
    return this.queries.catalogueForTenant(p, q);
  }

  /** Read-only evaluation (no side effects), hence 200 and no idempotency key. */
  @Post('comparison-scopes/evaluations')
  @HttpCode(200)
  @RequirePermission('catalogue.read')
  evaluate(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(EvaluationSchema)) body: z.infer<typeof EvaluationSchema>) {
    return this.queries.evaluate(p, body);
  }

  @Get('research')
  @RequirePermission('catalogue.read')
  research(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ResearchQuery)) q: z.infer<typeof ResearchQuery>) {
    return this.queries.research(p, q);
  }

  @Get('versions/:id')
  @RequirePermission('catalogue.read')
  version(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.queries.version(p, id);
  }
}

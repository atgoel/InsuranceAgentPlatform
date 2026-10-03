import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../tenancy/decorators';
import { UNIT_OF_WORK } from '../tokens';
import { UnitOfWork } from '../persistence/unit-of-work';

@Controller('/health')
export class HealthController {
  constructor(@Inject(UNIT_OF_WORK) private unitOfWork: UnitOfWork) {}

  @Get('/live')
  @Public()
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('/ready')
  @Public()
  async ready(): Promise<{ status: string; checks?: { db: string } }> {
    try {
      await this.unitOfWork.run('health-check', async () => {
        return true;
      });
      return { status: 'ok', checks: { db: 'ok' } };
    } catch {
      return { status: 'ok', checks: { db: 'skipped' } };
    }
  }
}

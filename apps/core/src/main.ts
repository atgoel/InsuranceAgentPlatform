import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { KERNEL_OPTIONS, LOGGER } from './kernel/tokens';
import { KernelConfig } from './kernel/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // webhook signatures are computed over the exact bytes received
  });

  const logger = app.get(LOGGER);

  // Disable default Nest logger
  app.useLogger(false);

  const config = app.get<KernelConfig>(KERNEL_OPTIONS);
  const port = config.port;

  await app.listen(port);
  logger.info('app.started', 'Application started', { port });
}

bootstrap();

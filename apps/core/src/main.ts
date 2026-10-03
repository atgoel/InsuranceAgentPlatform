import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LOGGER } from './kernel/tokens';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(LOGGER);

  // Disable default Nest logger
  app.useLogger(false);

  const config = app.get('KernelConfig');
  const port = config.port;

  await app.listen(port);
  logger.info('app.started', 'Application started', { port });
}

bootstrap();

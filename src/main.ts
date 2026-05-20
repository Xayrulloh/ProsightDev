import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cors from 'cors';
import { AppModule } from './app.module';
import { checkedEnv } from './config/env/env';
import SwaggerBuilder from './config/swagger/swagger.config';
import { CLIENT_URL, GLOBAL_PREFIX } from './utils/constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(
    cors({
      origin: CLIENT_URL,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: 'Content-Type, Authorization',
      credentials: true,
    }),
  );

  SwaggerBuilder.make(app);

  const port = checkedEnv.PORT;
  await app.listen(port);

  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${GLOBAL_PREFIX}`,
  );
  Logger.log(`📘 Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();

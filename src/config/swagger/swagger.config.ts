import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { checkedEnv } from '../env/env';

// biome-ignore lint/complexity/noStaticOnlyClass: matches existing project style
class SwaggerBuilder {
  static make(app: INestApplication): void {
    app.use(
      '/docs',
      basicAuth({
        challenge: true,
        users: { [checkedEnv.SWAGGER_USER]: checkedEnv.SWAGGER_PASSWORD },
      }),
    );

    const config = new DocumentBuilder()
      .setTitle('Locus API')
      .setDescription(
        'GET /locus endpoint over the public RNAcentral Postgres DB. Use POST /api/auth/login to obtain a JWT, then click Authorize to call protected routes.',
      )
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();

    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(app, config),
    );

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        docExpansion: 'none',
        persistAuthorization: true,
      },
    });
  }
}

export default SwaggerBuilder;

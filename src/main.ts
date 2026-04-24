import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const logger = new Logger('Bootstrap');

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({ origin: '*' });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Baileys WhatsApp API')
    .setDescription(
      'Comprehensive REST API for WhatsApp using Baileys library.\n\n' +
      '## Features\n' +
      '- 📱 Multi-session management (QR code & pairing code)\n' +
      '- 💬 Full messaging: text, media, contacts, location, polls, buttons, lists\n' +
      '- 👥 Group management: create, modify, participants, invite codes\n' +
      '- 📋 Chat operations: archive, pin, mute, delete\n' +
      '- 📇 Contact management: check numbers, profiles, block/unblock\n' +
      '- 🟢 Presence: composing, recording, available, unavailable\n' +
      '- 🏷️ Labels: assign/remove from chats and messages\n' +
      '- 🔒 Privacy settings management\n' +
      '- 📢 Newsletter/Channel management\n' +
      '- 📡 Status/Stories: post text, image, video\n' +
      '- 🔔 Webhook delivery with HMAC signing\n' +
      '- 🔌 WebSocket for real-time events',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Baileys API Documentation',
    customCss: `
      .swagger-ui .topbar { background-color: #1a1a2e; }
      .swagger-ui .topbar .download-url-wrapper .select-label { color: #e94560; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Baileys API running on http://localhost:${port}`);
  logger.log(`📚 Swagger docs at http://localhost:${port}/docs`);
  logger.log(`🔌 WebSocket at ws://localhost:${port}/ws`);
}

bootstrap();

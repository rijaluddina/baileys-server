import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module.js';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

async function generate() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'] },
  );

  const config = new DocumentBuilder()
    .setTitle('Baileys WhatsApp API')
    .setDescription(
      'Comprehensive REST API for WhatsApp using Baileys library.',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const yamlString = yaml.dump(document, { noRefs: true });

  const outputPath = path.resolve(process.cwd(), 'api/contract/openapi.yaml');

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, yamlString, 'utf8');

  console.log(`✅ OpenAPI contract generated at: ${outputPath}`);
  await app.close();
  process.exit(0);
}

generate().catch((err) => {
  console.error('❌ Failed to generate OpenAPI contract:', err);
  process.exit(1);
});

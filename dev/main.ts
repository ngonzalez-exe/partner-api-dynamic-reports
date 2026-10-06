import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { DevAppModule } from './dev.module';

async function bootstrap() {
  const app = await NestFactory.create(DevAppModule);
  const port = process.env.PORT || 3000;

  // Prefijo global de rutas (/dynamic-reports)
  const globalPrefix = process.env.GLOBAL_PREFIX || 'dynamic-reports';
  app.setGlobalPrefix(globalPrefix);

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Partner API - Dev Environment')
    .setDescription('Entorno de desarrollo local para el módulo partner')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  await app.listen(port);
  Logger.log(`🚀 Servidor local listo en: http://localhost:${port}/${globalPrefix}`, 'DevBootstrap');
  Logger.log(`📖 Swagger UI disponible en: http://localhost:${port}/${globalPrefix}/docs`, 'DevBootstrap');
}

bootstrap().catch((err) => {
  console.error('Error al iniciar el servidor de desarrollo:', err);
  process.exit(1);
});

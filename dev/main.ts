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

  // No se usa setGlobalPrefix porque los controladores ya declaran explícitamente
  // sus prefijos ('dynamic-reports/v1/...', 'v1/partner/...') evitando colisiones.
  
  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Partner API - Dev Environment')
    .setDescription('Entorno de desarrollo local para el módulo partner')
    .setVersion('0.1.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  Logger.log(`🚀 Servidor local listo en: http://localhost:${port}`, 'DevBootstrap');
  Logger.log(`📖 Swagger UI disponible en: http://localhost:${port}/docs`, 'DevBootstrap');
}

bootstrap().catch((err) => {
  console.error('Error al iniciar el servidor de desarrollo:', err);
  process.exit(1);
});

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamicSchemasController } from './dynamic-schemas.controller';
import { DynamicSchemasService } from './dynamic-schemas.service';
import { GeminiService } from './insights/gemini.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [DynamicSchemasController],
  providers: [DynamicSchemasService, GeminiService],
  exports: [DynamicSchemasService, GeminiService],
})
export class DynamicSchemasModule {}


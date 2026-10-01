import { Module } from '@nestjs/common';
import { DynamicSchemasController } from './dynamic-schemas.controller';
import { DynamicSchemasService } from './dynamic-schemas.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DynamicSchemasController],
  providers: [DynamicSchemasService],
  exports: [DynamicSchemasService],
})
export class DynamicSchemasModule {}

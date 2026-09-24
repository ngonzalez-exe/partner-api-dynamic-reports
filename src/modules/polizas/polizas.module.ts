import { Module } from '@nestjs/common';
import { PolizasService } from './polizas.service';
import { DatabaseModule } from '../../database/database.module';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';

@Module({
  imports: [DatabaseModule, DynamicSchemasModule],
  providers: [PolizasService],
  exports: [PolizasService],
})
export class PolizasModule {}

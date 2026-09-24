import { Module } from '@nestjs/common';
import { ComisionesService } from './comisiones.service';
import { DatabaseModule } from '../../database/database.module';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';

@Module({
  imports: [DatabaseModule, DynamicSchemasModule],
  providers: [ComisionesService],
  exports: [ComisionesService],
})
export class ComisionesModule {}

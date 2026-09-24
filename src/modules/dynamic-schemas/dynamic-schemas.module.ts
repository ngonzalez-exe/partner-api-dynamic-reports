import { Module } from '@nestjs/common';
import { DynamicSchemasService } from './dynamic-schemas.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [DynamicSchemasService],
  exports: [DynamicSchemasService],
})
export class DynamicSchemasModule {}

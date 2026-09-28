import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AseguradoraResolverService } from './aseguradora-resolver.service';
import { SyncContextService } from './sync-context.service';

@Module({
  imports: [DatabaseModule],
  providers: [AseguradoraResolverService, SyncContextService],
  exports: [AseguradoraResolverService, SyncContextService],
})
export class ReportesSyncModule {}

import { Module } from '@nestjs/common';
import { ComponentsController } from './components.controller';
import { ComponentsService } from './components.service';
import { DatabaseModule } from '../../database/database.module';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';
import { PolizasModule } from '../polizas/polizas.module';
import { ComisionesModule } from '../comisiones/comisiones.module';
import { ReportesSyncModule } from '../reportes-sync/reportes-sync.module';

@Module({
  imports: [
    DatabaseModule,
    DynamicSchemasModule,
    PolizasModule,
    ComisionesModule,
    ReportesSyncModule,
  ],
  controllers: [ComponentsController],
  providers: [ComponentsService],
  exports: [ComponentsService],

})
export class ComponentsModule {}

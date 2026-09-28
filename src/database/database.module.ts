import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { ReportesPgService } from './reportes-pg.service';

export * from './reportes-pg.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [DatabaseService, ReportesPgService],
  exports: [DatabaseService, ReportesPgService],
})
export class DatabaseModule {}
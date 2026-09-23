import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';

export const ReportesPgService = DatabaseService;
export type ReportesPgService = DatabaseService;

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    DatabaseService,
    {
      provide: 'ReportesPgService',
      useExisting: DatabaseService,
    },
  ],
  exports: [DatabaseService, 'ReportesPgService'],
})
export class DatabaseModule {}
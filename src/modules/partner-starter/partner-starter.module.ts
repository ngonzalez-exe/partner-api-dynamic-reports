import { DynamicModule, Module } from '@nestjs/common';
import { PartnerModuleRegisterOptions } from '@jsotoexelixitech/nest-api-sdk';
import { PartnerStarterController } from './partner-starter.controller';
import { DatabaseModule } from '../../database/database.module';
import { ComponentsModule } from '../components/components.module';
import { DynamicSchemasModule } from '../dynamic-schemas/dynamic-schemas.module';

@Module({})
export class PartnerStarterModule {
  static register(_options?: PartnerModuleRegisterOptions): DynamicModule {
    return {
      module: PartnerStarterModule,
      imports: [DatabaseModule, ComponentsModule, DynamicSchemasModule],
      controllers: [PartnerStarterController],
      exports: [DatabaseModule, ComponentsModule, DynamicSchemasModule],
    };
  }
}

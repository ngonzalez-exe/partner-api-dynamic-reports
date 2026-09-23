export { PartnerStarterModule } from './modules/partner-starter/partner-starter.module';
export { PartnerStarterController } from './modules/partner-starter/partner-starter.controller';
export { ComponentsModule } from './modules/components/components.module';
export { ComponentsController } from './modules/components/components.controller';
export { ComponentsService } from './modules/components/components.service';
export * from './database';

import { PartnerStarterModule } from './modules/partner-starter/partner-starter.module';

/** Entrada estándar que carga sysip-nest-api vía PARTNER_PACKAGES. */
export function register(
  options?: import('@jsotoexelixitech/nest-api-sdk').PartnerModuleRegisterOptions,
) {
  return PartnerStarterModule.register(options);
}
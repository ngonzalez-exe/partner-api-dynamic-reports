import { Global, Module } from '@nestjs/common';
import { EXELIXI_PARTNER_HOST } from '@jsotoexelixitech/nest-api-sdk';
import { DevPartnerHost } from './dev-host.mock';
import { register } from '../src/index';

const devHostInstance = new DevPartnerHost();

@Global()
@Module({
  providers: [
    {
      provide: EXELIXI_PARTNER_HOST,
      useValue: devHostInstance,
    },
  ],
  exports: [EXELIXI_PARTNER_HOST],
})
export class DevGlobalHostModule {}

@Module({
  imports: [
    DevGlobalHostModule,
    register({ host: devHostInstance }),
  ],
})
export class DevAppModule {}

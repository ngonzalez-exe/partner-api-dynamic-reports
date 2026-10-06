import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  EXELIXI_PARTNER_HOST,
  ExelixiPartnerHost,
  PARTNER_SWAGGER_TAG,
} from '@jsotoexelixitech/nest-api-sdk';
import { DatabaseService } from '../../database/database.service';

@ApiTags(PARTNER_SWAGGER_TAG)
@Controller([
  'v1/partner/rpt-comisiones',
  'dynamic-reports/v1/health',
])
export class PartnerStarterController {
  constructor(
    @Inject(EXELIXI_PARTNER_HOST)
    private readonly host: ExelixiPartnerHost,
    private readonly db: DatabaseService,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Health del módulo partner (plantilla)',
    description:
      'Ejemplo para integradores. Renombrar controlador/rutas en su paquete npm.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { status: true, module: '@ngonzalez-exe/rpt-comisiones', env: 'development' },
    },
  })
  health() {
    this.host.log('log', 'GET /partner/starter/health', 'PartnerStarter');
    return {
      status: true,
      module: '@ngonzalez-exe/rpt-comisiones',
      env: this.host.getConfig('NODE_ENV') ?? 'unknown',
    };
  }

  @Get('db-test')
  @ApiOperation({
    summary: 'Test de conectividad y type parsers con PostgreSQL',
    description: 'Ejecuta una consulta de prueba usando parámetros nombrados y verifica parsers numéricos.',
  })
  async dbTest() {
    this.host.log('log', 'GET /partner/starter/db-test', 'PartnerStarter');
    const rows = await this.db.executeQuery(
      'SELECT NOW() as server_time, @testNumber::int8 as parsed_bigint, @testDecimal::numeric as parsed_numeric, @status as status',
      {
        testNumber: '1234567890123',
        testDecimal: '89.75',
        status: 'ok',
      },
    );

    return {
      success: true,
      result: rows[0],
      bigintType: typeof rows[0]?.parsed_bigint,
      numericType: typeof rows[0]?.parsed_numeric,
    };
  }
}

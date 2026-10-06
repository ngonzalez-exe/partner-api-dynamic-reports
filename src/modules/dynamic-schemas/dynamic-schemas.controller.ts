import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PARTNER_SWAGGER_TAG } from '@jsotoexelixitech/nest-api-sdk';
import { DynamicSchemasService } from './dynamic-schemas.service';
import {
  isReportesError,
  ReportesHeaders,
  ReportesRequestUser,
} from '../components/utils/request-context.util';

function asUser(headers: ReportesHeaders): ReportesRequestUser | null {
  const raw = headers['x-cusuario'] ?? headers['X-CUsuario'];
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? { cusuario: n } : null;
}

@ApiTags(PARTNER_SWAGGER_TAG)
@Controller('v1/dynamic-schemas')
export class DynamicSchemasController {
  constructor(private readonly service: DynamicSchemasService) {}

  private throwIfError(result: unknown): void {
    if (isReportesError(result)) {
      throw new BadRequestException(result.message);
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar esquemas de reporte activos' })
  async getReports() {
    const data = await this.service.getReports();
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':nombreInterno/meta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Meta / esquema estructural de un reporte' })
  @ApiParam({
    name: 'nombreInterno',
    example: 'RPT_COMISIONES',
    description: 'Nombre interno o slug del reporte (ej. RPT_POLIZAS, RPT_COMISIONES)',
  })
  @ApiHeader({
    name: 'x-cusuario',
    required: false,
    description: 'Identificador de usuario (cusuario)',
  })
  @ApiHeader({
    name: 'x-aseguradora-id',
    required: false,
    description: 'Identificador de la aseguradora',
  })
  async getSchema(
    @Param('nombreInterno') nombreInterno: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getSchema(
      { nombreInterno },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':nombreInterno/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener configuración KPIs/gráficos' })
  async getConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getConfiguracion(
      { nombreInterno },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':nombreInterno/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar configuración' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async saveConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveVistaConfiguracion(
      { nombreInterno },
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':nombreInterno/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar vistas de configuración' })
  async getVistasConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getVistasConfiguracion(
      { nombreInterno },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':nombreInterno/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar vista de configuración' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async saveVistaConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveVistaConfiguracion(
      { nombreInterno },
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Delete(':nombreInterno/vista-configuracion/:cconfiguracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar vista de configuración' })
  async deleteVistaConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Param('cconfiguracion', ParseIntPipe) cconfiguracion: number,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.deleteVistaConfiguracion(
      { nombreInterno, cconfiguracion },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }
}


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
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PARTNER_SWAGGER_TAG } from '@jsotoexelixitech/nest-api-sdk';
import { ComponentsService } from './components.service';
import type {
  ReportesHeaders,
  ReportesRequestUser,
} from './components.service';

function asUser(headers: ReportesHeaders): ReportesRequestUser | null {
  const raw = headers['x-cusuario'] ?? headers['X-CUsuario'];
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? { cusuario: n } : null;
}

@ApiTags(PARTNER_SWAGGER_TAG)
@Controller('v1/components')
export class ComponentsController {
  constructor(private readonly service: ComponentsService) {}

  private throwIfError(result: unknown): void {
    if (
      result &&
      typeof result === 'object' &&
      'error' in result &&
      (result as { error: boolean }).error
    ) {
      throw new BadRequestException(
        (result as { message?: string }).message || 'Error en la petición de componentes',
      );
    }
  }

  @Post(':slug/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar componente/reporte por slug' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async execute(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.execute(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':slug/filtros')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Filtros del componente por slug' })
  async getFiltros(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getFiltros(
      slug,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':slug/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configuración KPIs/gráficos del componente' })
  async getConfiguracion(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getConfiguracion(
      slug,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':slug/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar configuración del componente' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async saveConfiguracion(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveConfiguracion(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':slug/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar vistas de configuración' })
  async getVistasConfiguracion(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getVistasConfiguracion(
      slug,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':slug/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar vista de configuración' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async saveVistaConfiguracion(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveConfiguracion(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Delete(':slug/vista-configuracion/:cconfiguracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar vista de configuración' })
  async deleteVistaConfiguracion(
    @Param('slug') slug: string,
    @Param('cconfiguracion', ParseIntPipe) cconfiguracion: number,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.deleteVistaConfiguracion(
      slug,
      cconfiguracion,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':slug/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exportar componente/reporte por slug' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async exportData(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
    @Res({ passthrough: false }) res: any,
  ) {
    const result = await this.service.exportData(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(result);

    if (
      result &&
      typeof result === 'object' &&
      'buffer' in result &&
      (result as { buffer?: unknown }).buffer
    ) {
      const file = result as unknown as {
        buffer: Buffer;
        contentType: string;
        filename: string;
        extension: string;
      };
      res.setHeader('Content-Type', file.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.filename}.${file.extension}"`,
      );
      return res.status(HttpStatus.OK).send(file.buffer);
    }

    return res.status(HttpStatus.OK).json({ status: true, data: result });
  }

  @Post(':slug/insights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Insights IA del componente' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async getInsights(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getInsights(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    return { status: true, data };
  }
}

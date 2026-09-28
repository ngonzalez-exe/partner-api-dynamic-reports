import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DynamicSchemasService } from '../dynamic-schemas/dynamic-schemas.service';
import { PolizasService } from '../polizas/polizas.service';
import { ComisionesService } from '../comisiones/comisiones.service';
import { AseguradoraResolverService } from '../reportes-sync/aseguradora-resolver.service';
import {
  extractAseguradoraIdExplicit,
  mergeAseguradoraIntoBody,
  paginateRows,
  resolvePagination,
} from './utils/request-context.util';
export {
  ReportesHeaders,
  ReportesRequestUser,
} from './utils/request-context.util';
import type {
  ReportesHeaders,
  ReportesRequestUser,
} from './utils/request-context.util';

@Injectable()
export class ComponentsService {
  private readonly logger = new Logger(ComponentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly dynamicSchemasService: DynamicSchemasService,
    private readonly polizasService: PolizasService,
    private readonly comisionesService: ComisionesService,
    private readonly aseguradoraResolver: AseguradoraResolverService,
  ) {}

  async enrichBodyWithAseguradora(
    body: Record<string, unknown>,
    headers: ReportesHeaders,
  ): Promise<Record<string, unknown>> {
    const explicit = extractAseguradoraIdExplicit(body || {}, headers || {});
    const aseguradoraId = await this.aseguradoraResolver.resolveAseguradoraId(
      explicit,
      body || {},
      headers || {},
    );
    return mergeAseguradoraIntoBody(body || {}, headers || {}, aseguradoraId);
  }

  buildPolizasAdapterBody(
    body: Record<string, unknown>,
    headers: ReportesHeaders,
  ): Record<string, unknown> {
    const filtros =
      body && body.filtros && typeof body.filtros === 'object'
        ? (body.filtros as Record<string, unknown>)
        : {};
    const { page, pageSize } = resolvePagination(body, headers);
    const nullable = (value: unknown) => {
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text === '' ? null : value;
    };

    return {
      filtros: {
        polzia: nullable(filtros.polzia ?? filtros.poliza ?? filtros.xpoliza ?? filtros.numero_poliza),
        cramo: nullable(filtros.cramo ?? filtros.ramo),
        cestatus: nullable(filtros.cestatus ?? filtros.estatus ?? filtros.estatus_poliza),
        cproductor: nullable(filtros.cproductor ?? filtros.productor),
        ccanal: nullable(filtros.ccanal ?? filtros.canal ?? filtros.canal_alterno),
        moneda: nullable(filtros.moneda ?? filtros.cmoneda),
        fdesdeemi: nullable(filtros.fdesdeemi ?? filtros.desdeEmision ?? filtros.desde_emision ?? filtros.desde),
        fhastaemi: nullable(filtros.fhastaemi ?? filtros.hastaEmision ?? filtros.hasta_emision ?? filtros.hasta),
        aseguradoraId: nullable(filtros.aseguradoraId ?? filtros.id_aseguradora),
        id_aseguradora: nullable(filtros.id_aseguradora ?? filtros.aseguradoraId),
      },
      page,
      pageSize,
      sortField: body.sortField ?? 'fecha_emision_poliza',
      sortDir: body.sortDir === 'desc' ? 'desc' : 'asc',
      grilla: Array.isArray(body?.grilla) ? body.grilla : [],
      kpis: Array.isArray(body?.kpis) ? body.kpis : [],
      graficos: Array.isArray(body?.graficos) ? body.graficos : [],
    };
  }

  buildComisionesAdapterBody(
    body: Record<string, unknown>,
    headers: ReportesHeaders,
  ): Record<string, unknown> {
    const filtros =
      body && body.filtros && typeof body.filtros === 'object'
        ? (body.filtros as Record<string, unknown>)
        : {};
    const { page, pageSize } = resolvePagination(body, headers);
    const nullable = (value: unknown) => {
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text === '' ? null : value;
    };

    return {
      filtros: {
        poliza: nullable(filtros.poliza ?? filtros.numero_poliza ?? filtros.polzia ?? filtros.xpoliza),
        recibo: nullable(filtros.recibo ?? filtros.numero_recibo ?? filtros.cnrecibo),
        cramo: nullable(filtros.cramo ?? filtros.id_ramo ?? filtros.ramo),
        cproductor: nullable(filtros.cproductor ?? filtros.id_productor ?? filtros.productor),
        cmoneda: nullable(filtros.cmoneda ?? filtros.moneda),
        tipo_movimiento: nullable(filtros.tipo_movimiento ?? filtros.tipo_movimiento_codigo ?? filtros.imovcom),
        estado_recibo: nullable(filtros.estado_recibo ?? filtros.iestadorec ?? filtros.estado),
        tipoFecha: nullable(filtros.tipoFecha ?? filtros.tipo_fecha ?? 'fecha_cobro'),
        desde: nullable(filtros.desde ?? filtros.fdesde ?? filtros.fdesdecob ?? filtros.finicio_cobro ?? filtros.fecha_desde),
        hasta: nullable(filtros.hasta ?? filtros.fhasta ?? filtros.fhastacob ?? filtros.ffin_cobro ?? filtros.fecha_hasta),
        fdesdepago: nullable(filtros.fdesdepago ?? filtros.finicio_pago),
        fhastapago: nullable(filtros.fhastapago ?? filtros.ffin_pago),
        aseguradoraId: nullable(filtros.aseguradoraId ?? filtros.id_aseguradora),
        id_aseguradora: nullable(filtros.id_aseguradora ?? filtros.aseguradoraId),
      },
      page,
      pageSize,
      sortField: body.sortField ?? 'fecha_cobro_recibo',
      sortDir: body.sortDir === 'desc' ? 'desc' : 'asc',
      grilla: Array.isArray(body?.grilla) ? body.grilla : [],
      kpis: Array.isArray(body?.kpis) ? body.kpis : [],
      graficos: Array.isArray(body?.graficos) ? body.graficos : [],
    };
  }

  async execute(
    slug: string,
    body: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    const normalizedSlug = String(slug || '').trim().toUpperCase();
    this.logger.log(`[execute] slug=${normalizedSlug}, user=${user?.cusuario}`);

    const enrichedBody = await this.enrichBodyWithAseguradora(body, headers);

    if (normalizedSlug === 'RPT_POLIZAS') {
      const adapterBody = this.buildPolizasAdapterBody(enrichedBody, headers);
      return this.polizasService.execute(adapterBody, user, headers);
    }

    if (normalizedSlug === 'RPT_COMISIONES') {
      const adapterBody = this.buildComisionesAdapterBody(enrichedBody, headers);
      return this.comisionesService.execute(adapterBody, user, headers);
    }

    // Slugs dinámicos sin adapter dedicado
    this.logger.log(`[execute] reporte dinámico sin adapter para slug=${normalizedSlug}`);
    const result = await this.dynamicSchemasService.executeReport(
      { nombreInterno: normalizedSlug },
      enrichedBody,
      user,
      headers,
    );
    if (result?.error) return result;

    const allRows = Array.isArray(result.grid) ? result.grid : [];
    const { page, pageSize } = resolvePagination(enrichedBody, headers);
    const pagedRows = paginateRows(allRows, page, pageSize);

    return {
      data: pagedRows,
      grid: pagedRows,
      kpis: result.kpis || [],
      graphics: result.graphics || {},
      total: allRows.length,
    };
  }

  async getFiltros(
    slug: string,
    query: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    const normalizedSlug = String(slug || '').trim().toUpperCase();
    this.logger.log(`[getFiltros] slug=${normalizedSlug}, user=${user?.cusuario}`);

    // Enrutamiento por Adapter específico
    if (normalizedSlug === 'RPT_POLIZAS') {
      return this.polizasService.getFiltros(user, headers, query);
    }

    if (normalizedSlug === 'RPT_COMISIONES') {
      return this.comisionesService.getFiltros(user, headers, query);
    }

    // Slugs dinámicos sin adapter específico: devolver únicamente la lista de campos activos
    const schema = await this.dynamicSchemasService.getSchema(
      slug,
      user,
      headers,
      query,
    );
    if (schema?.error) {
      return schema;
    }

    const campos = (schema.campos || []).filter((c: any) => !c.hidden);
    return { campos };
  }

  async getConfiguracion(
    slug: string,
    query: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(`[getConfiguracion] slug=${slug}, user=${user?.cusuario}`);
    return {
      slug,
      kpis: [],
      graficos: [],
    };
  }

  async saveConfiguracion(
    slug: string,
    body: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(`[saveConfiguracion] slug=${slug}, user=${user?.cusuario}`);
    return {
      slug,
      saved: true,
    };
  }

  async getVistasConfiguracion(
    slug: string,
    query: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(`[getVistasConfiguracion] slug=${slug}, user=${user?.cusuario}`);
    return {
      slug,
      vistas: [],
    };
  }

  async deleteVistaConfiguracion(
    slug: string,
    cconfiguracion: number,
    query: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(
      `[deleteVistaConfiguracion] slug=${slug}, cconfiguracion=${cconfiguracion}, user=${user?.cusuario}`,
    );
    return {
      slug,
      cconfiguracion,
      deleted: true,
    };
  }

  async exportData(
    slug: string,
    body: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(`[exportData] slug=${slug}, user=${user?.cusuario}`);
    return {
      slug,
      exported: true,
    };
  }

  async getInsights(
    slug: string,
    body: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(`[getInsights] slug=${slug}, user=${user?.cusuario}`);
    return {
      slug,
      insights: [],
    };
  }
}

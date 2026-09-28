import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DynamicSchemasService } from '../dynamic-schemas/dynamic-schemas.service';
import { SyncContextService } from '../reportes-sync/sync-context.service';
import {
  evaluateKpiOperation,
  filterRowsByKpiConditions,
  findCampo,
  formatPersonaDocNombre,
  getRowFieldValue,
  isAllFilterValue,
  mapCatalogOption,
  matchesCondition,
  mergeKpiDefinitions,
  normalizeFilterString,
  opcionesFromCampo,
  paginateRows,
  parseKpiConditions,
  ReportesHeaders,
  ReportesRequestUser,
  resolveAseguradoraId,
  resolveCusuario,
  sortRows,
  toNumber,
} from '../components/utils/request-context.util';

/** Columnas del SELECT de sp_rpt_polizas expuestas en grilla */
export const POLIZAS_COLUMN_ORDER = [
  'numero_poliza',
  'numero_poliza_relacionada',
  'fecha_emision_poliza',
  'fecha_desde_poliza',
  'fecha_hasta_poliza',
  'estado',
  'ramo',
  'tipo_ramo',
  'plan',
  'forma',
  'frecuencia',
  'sucursal',
  'canal_venta',
  'canal_alterno',
  'productor',
  'estatus_poliza',
  'moneda',
  'prima_total',
  'tomador',
  'asegurado',
  'beneficiario',
  'marca_vehiculo',
  'modelo_vehiculo',
  'version_vehiculo',
  'anio_vehiculo',
  'placa',
  'color_vehiculo',
  'serial_carroceria',
  'serial_motor',
];

export const POLIZAS_COLUMNS_EXCLUDED = new Set([
  'id',
  'id_aseguradora',
  'id_ramo',
  'id_productor',
  'origen_clave',
  'nombre_tomador',
  'cedula_tomador',
  'nombre_asegurado',
  'cedula_asegurado',
  'nombre_beneficiario_preferencial',
  'cedula_beneficiario_preferencial',
]);

export const POLIZAS_COLUMN_LABELS: Record<string, string> = {
  numero_poliza: 'Número Póliza',
  numero_poliza_relacionada: 'Póliza Relacionada',
  fecha_emision_poliza: 'Fecha Emisión',
  fecha_desde_poliza: 'Vigencia Desde',
  fecha_hasta_poliza: 'Vigencia Hasta',
  moneda: 'Moneda',
  sucursal: 'Sucursal',
  productor: 'Productor',
  canal_venta: 'Canal Venta',
  canal_alterno: 'Canal Alterno',
  ramo: 'Ramo',
  plan: 'Plan',
  frecuencia: 'Frecuencia',
  tipo_ramo: 'Tipo Ramo',
  forma: 'Forma',
  estado: 'Estado',
  estatus_poliza: 'Estatus',
  prima_total: 'Prima Total',
  tomador: 'Tomador',
  asegurado: 'Asegurado',
  beneficiario: 'Beneficiario',
  marca_vehiculo: 'Marca',
  modelo_vehiculo: 'Modelo',
  version_vehiculo: 'Versión',
  anio_vehiculo: 'Año',
  placa: 'Placa',
  color_vehiculo: 'Color',
  serial_carroceria: 'Serial Carrocería',
  serial_motor: 'Serial Motor',
};

const SP_FILTER_KEYS = [
  'polzia',
  'cramo',
  'cestatus',
  'cproductor',
  'ccanal',
  'moneda',
  'fdesdeemi',
  'fhastaemi',
];

@Injectable()
export class PolizasService {
  private readonly logger = new Logger(PolizasService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly dynamicSchemasService: DynamicSchemasService,
    private readonly syncContext: SyncContextService,
  ) {}

  private async runCatalogSp(
    spName: string,
    aseguradoraId: number | null = null,
  ): Promise<{ cvalor: string; xdescripcion: string }[]> {
    try {
      const rows = await this.db.executeSP(spName, {
        p_id_aseguradora: aseguradoraId || null,
      });
      const list = Array.isArray(rows) ? rows : [];
      return list.map(mapCatalogOption).filter(Boolean) as {
        cvalor: string;
        xdescripcion: string;
      }[];
    } catch (error: any) {
      this.logger.warn(`Error ejecutando SP de catálogo '${spName}': ${error.message}`);
      return [];
    }
  }

  private async getRamosCatalog(aseguradoraId: number | null) {
    return this.runCatalogSp('sp_obtener_ramos', aseguradoraId);
  }

  private async getProductoresCatalog(aseguradoraId: number | null) {
    return this.runCatalogSp('sp_obtener_productores', aseguradoraId);
  }

  private async getCanalesCatalog(campo: any, aseguradoraId: number | null) {
    const configured = String(campo?.xsp_lista || '').trim();
    const fallback = 'sp_obtener_canales_alternos';
    const primary = configured || fallback;

    let result = await this.runCatalogSp(primary, aseguradoraId);
    if (result.length === 0 && primary !== fallback) {
      this.logger.log(`Intentando fallback '${fallback}' para catálogo de canales`);
      result = await this.runCatalogSp(fallback, aseguradoraId);
    }
    return result;
  }

  private async opcionesDesdeListaValoresDb(
    nombreInterno: string,
    nombreParam: string,
  ): Promise<{ cvalor: string; xdescripcion: string }[]> {
    try {
      const rows = await this.db.executeQuery(
        `SELECT lista_valores
         FROM campos
         WHERE id_esquema = (SELECT id FROM esquemas WHERE nombre_interno = @nombreInterno LIMIT 1)
           AND nombre_param = @nombreParam
           AND activo = TRUE
         LIMIT 1`,
        { nombreInterno, nombreParam },
      );

      if (!rows || rows.length === 0) return [];
      const raw = rows[0]?.lista_valores;
      if (!raw) return [];

      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((o: any) =>
          mapCatalogOption({
            cvalor: o.cvalor ?? o.valor ?? o.value,
            xdescripcion: o.xdescripcion ?? o.descripcion ?? o.label,
          }),
        )
        .filter(Boolean) as { cvalor: string; xdescripcion: string }[];
    } catch (error: any) {
      this.logger.debug(
        `opcionesDesdeListaValoresDb no pudo consultar tabla 'campos' para '${nombreParam}': ${error.message}. Se usará fallback del esquema.`,
      );
      return [];
    }
  }

  async loadFiltrosOpciones(
    user?: ReportesRequestUser | null,
    headers?: ReportesHeaders,
    query?: Record<string, unknown>,
    aseguradoraId: number | null = null,
  ): Promise<any> {
    const resolvedAseguradoraId =
      aseguradoraId ?? resolveAseguradoraId({ headers, query });

    const schema = await this.dynamicSchemasService.getSchema(
      'RPT_POLIZAS',
      user,
      headers,
      query,
    );
    if (schema?.error) return schema;

    const campos = (schema.campos || []).filter((c: any) => !c.hidden);
    const canalCampo = findCampo(campos, 'ccanal', 'canal');

    const [ramos, productores, canales, estatusDb, monedaDb] = await Promise.all([
      this.getRamosCatalog(resolvedAseguradoraId),
      this.getProductoresCatalog(resolvedAseguradoraId),
      this.getCanalesCatalog(canalCampo, resolvedAseguradoraId),
      this.opcionesDesdeListaValoresDb('RPT_POLIZAS', 'cestatus'),
      this.opcionesDesdeListaValoresDb('RPT_POLIZAS', 'moneda'),
    ]);

    const estatusCampo = findCampo(campos, 'cestatus', 'estatus');
    const monedaCampo = findCampo(campos, 'moneda', 'cmoneda');
    const estatusFromSchema = opcionesFromCampo(estatusCampo);
    const monedaFromSchema = opcionesFromCampo(monedaCampo);

    const estatus = estatusDb.length > 0 ? estatusDb : estatusFromSchema;
    const moneda = monedaDb.length > 0 ? monedaDb : monedaFromSchema;

    return {
      ramos,
      estatus,
      productos: [],
      canales,
      productores,
      ...(moneda.length > 0 ? { moneda } : {}),
    };
  }

  async getFiltros(
    user?: ReportesRequestUser | null,
    headers?: ReportesHeaders,
    query?: Record<string, unknown>,
  ): Promise<any> {
    const resolvedAseguradoraId = resolveAseguradoraId({ headers, query });
    const opciones = await this.loadFiltrosOpciones(
      user,
      headers,
      query,
      resolvedAseguradoraId,
    );
    if (opciones?.error) return opciones;

    return opciones;
  }

  buildExecutePayload(body: Record<string, any>, schema: Record<string, any>): Record<string, any> {
    const filtros = body && body.filtros ? body.filtros : {};
    const grillaBase =
      Array.isArray(body?.grilla) && body.grilla.length > 0
        ? body.grilla
        : Array.isArray(schema?.grilla) && schema.grilla.length > 0
          ? schema.grilla
          : [...POLIZAS_COLUMN_ORDER];

    const grilla = Array.from(new Set([...(grillaBase || []), 'estado']));
    const payload: Record<string, any> = {
      filtros: Object.fromEntries(SP_FILTER_KEYS.map((key) => [key, null])),
      grilla,
      kpis: mergeKpiDefinitions(body?.kpis, schema?.kpis),
      graficos:
        Array.isArray(body?.graficos) && body.graficos.length > 0
          ? body.graficos
          : Array.isArray(schema?.graficos)
            ? schema.graficos
            : [],
    };

    const aliases: Record<string, string[]> = {
      polzia: ['polzia', 'poliza', 'xpoliza', 'numero_poliza'],
      cramo: ['cramo', 'ramo'],
      cestatus: ['cestatus', 'estatus', 'estatus_poliza'],
      cproductor: ['cproductor', 'productor'],
      ccanal: ['ccanal', 'canal'],
      moneda: ['moneda', 'cmoneda'],
      fdesdeemi: ['fdesdeemi', 'desdeEmision', 'desde_emision', 'fecha_emision_desde', 'desde'],
      fhastaemi: ['fhastaemi', 'hastaEmision', 'hasta_emision', 'fecha_emision_hasta', 'hasta'],
    };

    for (const [targetKey, sourceKeys] of Object.entries(aliases)) {
      const picked = sourceKeys
        .map((key) => filtros[key])
        .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
      if (picked !== undefined) {
        payload.filtros[targetKey] = picked;
      }
    }

    const aseguradoraId = filtros.aseguradoraId ?? filtros.id_aseguradora ?? body?.aseguradoraId;
    if (aseguradoraId !== undefined && aseguradoraId !== null && String(aseguradoraId).trim() !== '') {
      payload.filtros.id_aseguradora = Number(aseguradoraId);
      payload.filtros.aseguradoraId = Number(aseguradoraId);
    }

    payload.bpreview = body?.bpreview ? 1 : 0;
    payload.bexportar = body?.bexportar ? 1 : 0;

    return payload;
  }

  ensureRowColumns(row: any): Record<string, any> {
    const source = row && typeof row === 'object' ? row : {};
    const base: Record<string, any> = {};

    for (const col of POLIZAS_COLUMN_ORDER) {
      if (col === 'tomador') {
        base.tomador =
          formatPersonaDocNombre(source.cedula_tomador, source.nombre_tomador) ??
          (typeof source.tomador === 'string' && source.tomador.trim() ? source.tomador.trim() : null);
        continue;
      }
      if (col === 'asegurado') {
        base.asegurado =
          formatPersonaDocNombre(source.cedula_asegurado, source.nombre_asegurado) ??
          (typeof source.asegurado === 'string' && source.asegurado.trim() ? source.asegurado.trim() : null);
        continue;
      }
      if (col === 'beneficiario') {
        base.beneficiario =
          formatPersonaDocNombre(
            source.cedula_beneficiario_preferencial ?? source.cedula_beneficiario,
            source.nombre_beneficiario_preferencial ?? source.nombre_beneficiario,
          ) ??
          (typeof source.beneficiario === 'string' && source.beneficiario.trim()
            ? source.beneficiario.trim()
            : null);
        continue;
      }
      base[col] = source[col] ?? null;
    }

    for (const [key, value] of Object.entries(source)) {
      if (POLIZAS_COLUMNS_EXCLUDED.has(key)) continue;
      if (!(key in base)) base[key] = value;
    }

    return base;
  }

  private valorFiltroParaCampo(campo: string, filtros: Record<string, any>): any {
    const key = normalizeFilterString(campo).replace(/_/g, '');
    if (key === 'cestatus' || key === 'estatus' || key === 'estatuspoliza') {
      return filtros?.cestatus ?? filtros?.estatus ?? '';
    }
    if (key === 'cramo' || key === 'ramo') {
      return filtros?.cramo ?? filtros?.ramo ?? '';
    }
    if (key === 'cproductor' || key === 'productor') {
      return filtros?.cproductor ?? filtros?.productor ?? '';
    }
    if (key === 'moneda' || key === 'cmoneda') {
      return filtros?.moneda ?? filtros?.cmoneda ?? '';
    }
    if (key === 'estado') {
      return filtros?.estado ?? '';
    }
    return filtros?.[campo] ?? '';
  }

  private kpiVisibleByFiltros(kpi: any, filtros: Record<string, any>): boolean {
    const conditions = parseKpiConditions(kpi);
    if (conditions.length === 0) return true;

    return conditions.every((condition) => {
      const selected = this.valorFiltroParaCampo(condition?.campo, filtros);
      if (isAllFilterValue(selected)) {
        const flag = condition?.mostrar_en_todos ?? condition?.show_when_all ?? condition?.aplicar_en_todos;
        const showAll = flag === true || String(flag).toLowerCase() === 'true' || String(flag) === '1';
        const op = String(condition?.operador || '').toUpperCase();
        return showAll || op.includes('NOT');
      }
      return matchesCondition(condition, selected);
    });
  }

  mapKpis(
    kpiDefinitions: any[],
    rows: any[],
    filtros: Record<string, any>,
  ): Record<string, number> {
    const lista = Array.isArray(rows) ? rows : [];
    const defs = Array.isArray(kpiDefinitions) ? kpiDefinitions : [];

    if (defs.length > 0) {
      const salida: Record<string, number> = {};
      for (const kpi of defs) {
        if (!kpi || typeof kpi !== 'object') continue;
        if (!this.kpiVisibleByFiltros(kpi, filtros)) continue;

        const conditions = parseKpiConditions(kpi);
        const filasKpi = filterRowsByKpiConditions(lista, conditions);
        const label = kpi.xetiqueta_ui || kpi.etiqueta_ui || kpi.xcampo_metrica || kpi.campo_metrica;
        const campo = kpi.xcampo_metrica || kpi.campo_metrica;
        const operacion = kpi.ioperacion || kpi.operacion;
        if (!label || !campo) continue;

        salida[label] = evaluateKpiOperation(filasKpi, campo, operacion);
      }
      if (Object.keys(salida).length > 0) return salida;
    }

    return {};
  }

  buildPolizasGraphics(
    graficoDefinitions: any[],
    rows: any[],
    filtros: Record<string, any>,
  ): Record<string, Array<{ EjeX: string; Serie: number }>> {
    const lista = Array.isArray(rows) ? rows : [];
    const defs = Array.isArray(graficoDefinitions) ? graficoDefinitions : [];
    const graphics: Record<string, Array<{ EjeX: string; Serie: number }>> = {};

    for (const grafico of defs) {
      if (!grafico || typeof grafico !== 'object') continue;
      if (!this.kpiVisibleByFiltros(grafico, filtros)) continue;

      const id = grafico.id_grafico || grafico.xtitulo_ui;
      const dimensionField = grafico.xcampo_dimension;
      const metricField = grafico.xcampo_metrica;
      if (!id || !dimensionField || !metricField) continue;

      const grouped = new Map<string, any[]>();
      for (const row of lista) {
        if (!row || typeof row !== 'object') continue;
        const rawDim = getRowFieldValue(row, dimensionField);
        const dim =
          rawDim === undefined || rawDim === null || String(rawDim).trim() === ''
            ? 'Sin dato'
            : String(rawDim).trim();
        if (!grouped.has(dim)) grouped.set(dim, []);
        grouped.get(dim)!.push(row);
      }

      let points = Array.from(grouped.entries()).map(([dimensionValue, groupRows]) => ({
        EjeX: dimensionValue,
        Serie: evaluateKpiOperation(groupRows, metricField, grafico.ioperacion),
      }));

      const orden = String(grafico.iorden || 'DESC').toUpperCase() === 'ASC' ? 1 : -1;
      points.sort((a, b) => (a.Serie - b.Serie) * orden);

      const ntop = Number(grafico.ntop);
      if (Number.isFinite(ntop) && ntop > 0) {
        points = points.slice(0, ntop);
      }

      if (points.length > 0) graphics[id] = points;
    }

    return graphics;
  }

  async execute(
    body: Record<string, any>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    const syncMeta = await this.syncContext.maybeSyncBeforeReport('polizas', body || {}, {}, headers);
    const schema = await this.dynamicSchemasService.getSchema('RPT_POLIZAS', user, headers);
    if (schema?.error) return schema;

    const cusuario = resolveCusuario({ user, body, headers });
    const payload = this.buildExecutePayload(body || {}, schema);
    const result = await this.dynamicSchemasService.executeReportSp('RPT_POLIZAS', payload, cusuario);
    if (result?.error) return result;

    const rawRows = Array.isArray(result.recordsets?.[0])
      ? result.recordsets[0].map((r: any) => this.ensureRowColumns(r))
      : [];
    const sortedRows = sortRows(rawRows, body?.sortField as string, body?.sortDir as string);
    const pagedRows = paginateRows(sortedRows, body?.page, Math.min(Number(body?.pageSize) || 25, 200));

    const filtrosOpciones = body?.includeFiltrosOpciones
      ? await this.loadFiltrosOpciones(user, headers)
      : undefined;
    if (filtrosOpciones?.error) return filtrosOpciones;

    const [dbKpis, dbGraficos] = await Promise.all([
      this.dynamicSchemasService.loadKpisFromDb('RPT_POLIZAS'),
      this.dynamicSchemasService.loadGraficosFromDb('RPT_POLIZAS'),
    ]);

    const kpiDefs = mergeKpiDefinitions(
      payload.kpis,
      dbKpis.length > 0 ? dbKpis : schema.kpis || [],
    );
    const graficoDefs = dbGraficos.length > 0 ? dbGraficos : payload.graficos || schema.graficos || [];

    return {
      data: pagedRows,
      grid: pagedRows,
      total: sortedRows.length,
      kpis: this.mapKpis(kpiDefs, sortedRows, payload.filtros),
      graphics: this.buildPolizasGraphics(graficoDefs, sortedRows, payload.filtros),
      chartSource: sortedRows,
      filtrosOpciones,
      grilla: payload.grilla,
      columnLabels: POLIZAS_COLUMN_LABELS,
      sync: syncMeta,
    };
  }
}

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
} from '../components/utils/request-context.util';

/** Columnas del SELECT de sp_rpt_comisiones expuestas en grilla */
export const COMISIONES_COLUMN_ORDER = [
  'numero_poliza',
  'numero_recibo',
  'ramo',
  'poliza_origen',
  'tomador',
  'asegurado',
  'fecha_emision_recibo',
  'fecha_desde_recibo',
  'fecha_hasta_recibo',
  'dias_vigencia',
  'estado_recibo',
  'estado_recibo_desc',
  'fecha_cobro_recibo',
  'numero_ingreso',
  'moneda_recibo',
  'suma_asegurada',
  'suma_asegurada_ext',
  'monto_recibo_bruto',
  'monto_recibo_bruto_ext',
  'monto_recibo_pagado',
  'monto_recibo_pagado_ext',
  'sucursal',
  'productor',
  'tipo_persona_productor',
  'tipo_movimiento_codigo',
  'tipo_movimiento',
  'monto_movimiento',
  'monto_movimiento_bs',
  'monto_movimiento_ext',
  'porcentaje_comision',
  'porcentaje_islr',
  'monto_islr',
  'moneda_cobro',
  'moneda_pago',
  'tasa_cobro',
  'numero_orden_pago',
  'banco',
  'referencia_bancaria',
  'fecha_pago_comision',
  'monto_sustraendo',
  'monto_orden',
  'monto_neto_orden',
  'monto_islr_orden',
  'monto_bruto_orden',
];

export const COMISIONES_COLUMNS_EXCLUDED = new Set([
  'id',
  'id_aseguradora',
  'id_ramo',
  'id_productor',
  'id_sucursal',
  'origen_clave',
  'cedula_tomador',
  'nombre_tomador',
  'cedula_asegurado',
  'nombre_asegurado',
  'cedula_productor',
  'origen_modified_at',
  'synced_at',
]);

export const COMISIONES_COLUMN_LABELS: Record<string, string> = {
  numero_poliza: 'Número Póliza',
  numero_recibo: 'Número Recibo',
  ramo: 'Ramo',
  poliza_origen: 'Póliza Origen',
  tomador: 'Tomador',
  asegurado: 'Asegurado',
  fecha_emision_recibo: 'Fecha Emisión Recibo',
  fecha_desde_recibo: 'Vigencia Recibo Desde',
  fecha_hasta_recibo: 'Vigencia Recibo Hasta',
  dias_vigencia: 'Días Vigencia',
  estado_recibo: 'Estado Recibo',
  estado_recibo_desc: 'Descripción Estado',
  fecha_cobro_recibo: 'Fecha Cobro Recibo',
  numero_ingreso: 'Número Ingreso',
  moneda_recibo: 'Moneda Recibo',
  suma_asegurada: 'Suma Asegurada',
  suma_asegurada_ext: 'Suma Asegurada Ext',
  monto_recibo_bruto: 'Monto Recibo Bruto',
  monto_recibo_bruto_ext: 'Monto Recibo Bruto Ext',
  monto_recibo_pagado: 'Monto Recibo Pagado',
  monto_recibo_pagado_ext: 'Monto Recibo Pagado Ext',
  sucursal: 'Sucursal',
  productor: 'Productor',
  tipo_persona_productor: 'Tipo Persona',
  tipo_movimiento_codigo: 'Cód. Movimiento',
  tipo_movimiento: 'Tipo Movimiento',
  monto_movimiento: 'Monto Movimiento',
  monto_movimiento_bs: 'Monto Movimiento (Bs)',
  monto_movimiento_ext: 'Monto Movimiento (Ext)',
  porcentaje_comision: '% Comisión',
  porcentaje_islr: '% ISLR',
  monto_islr: 'Monto ISLR',
  moneda_cobro: 'Moneda Cobro',
  moneda_pago: 'Moneda Pago',
  tasa_cobro: 'Tasa Cobro',
  numero_orden_pago: 'Nro. Orden Pago',
  banco: 'Banco',
  referencia_bancaria: 'Referencia Bancaria',
  fecha_pago_comision: 'Fecha Pago Comisión',
  monto_sustraendo: 'Monto Sustraendo',
  monto_orden: 'Monto Orden',
  monto_neto_orden: 'Monto Neto Orden',
  monto_islr_orden: 'Monto ISLR Orden',
  monto_bruto_orden: 'Monto Bruto Orden',
};

const SP_COMISIONES_FILTER_KEYS = [
  'poliza',
  'recibo',
  'cramo',
  'cproductor',
  'cmoneda',
  'tipo_movimiento',
  'estado_recibo',
  'tipoFecha',
  'desde',
  'hasta',
  'fdesdepago',
  'fhastapago',
];

@Injectable()
export class ComisionesService {
  private readonly logger = new Logger(ComisionesService.name);

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
      'RPT_COMISIONES',
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
      this.opcionesDesdeListaValoresDb('RPT_COMISIONES', 'cestatus'),
      this.opcionesDesdeListaValoresDb('RPT_COMISIONES', 'moneda'),
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
          : [...COMISIONES_COLUMN_ORDER];

    const grilla = Array.from(new Set(grillaBase || []));
    const payload: Record<string, any> = {
      filtros: Object.fromEntries(SP_COMISIONES_FILTER_KEYS.map((key) => [key, null])),
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
      poliza: ['poliza', 'numero_poliza', 'polzia', 'xpoliza'],
      recibo: ['recibo', 'numero_recibo', 'cnrecibo'],
      cramo: ['cramo', 'id_ramo', 'ramo'],
      cproductor: ['cproductor', 'id_productor', 'productor'],
      cmoneda: ['cmoneda', 'moneda'],
      tipo_movimiento: ['tipo_movimiento', 'tipo_movimiento_codigo', 'imovcom'],
      estado_recibo: ['estado_recibo', 'iestadorec', 'estado'],
      tipoFecha: ['tipoFecha', 'tipo_fecha'],
      desde: ['desde', 'fdesde', 'fdesdecob', 'finicio_cobro', 'fecha_desde'],
      hasta: ['hasta', 'fhasta', 'fhastacob', 'ffin_cobro', 'fecha_hasta'],
      fdesdepago: ['fdesdepago', 'finicio_pago'],
      fhastapago: ['fhastapago', 'ffin_pago'],
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

    for (const col of COMISIONES_COLUMN_ORDER) {
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
      if (col === 'productor') {
        base.productor =
          formatPersonaDocNombre(source.cedula_productor, source.productor) ??
          (typeof source.productor === 'string' && source.productor.trim() ? source.productor.trim() : null);
        continue;
      }
      base[col] = source[col] ?? null;
    }

    for (const [key, value] of Object.entries(source)) {
      if (COMISIONES_COLUMNS_EXCLUDED.has(key)) continue;
      if (!(key in base)) base[key] = value;
    }

    return base;
  }

  private valorFiltroParaCampo(campo: string, filtros: Record<string, any>): any {
    const key = normalizeFilterString(campo).replace(/_/g, '');
    if (key === 'cestatus' || key === 'estatus' || key === 'estadorecibo' || key === 'estado') {
      return filtros?.estado_recibo ?? filtros?.cestatus ?? filtros?.estatus ?? '';
    }
    if (key === 'cramo' || key === 'ramo') {
      return filtros?.cramo ?? filtros?.ramo ?? '';
    }
    if (key === 'cproductor' || key === 'productor') {
      return filtros?.cproductor ?? filtros?.productor ?? '';
    }
    if (key === 'moneda' || key === 'cmoneda') {
      return filtros?.cmoneda ?? filtros?.moneda ?? '';
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

  buildComisionesGraphics(
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
    const syncMeta = await this.syncContext.maybeSyncBeforeReport('comisiones', body || {}, {}, headers);
    const schema = await this.dynamicSchemasService.getSchema('RPT_COMISIONES', user, headers);
    if (schema?.error) return schema;

    const cusuario = resolveCusuario({ user, body, headers });
    const payload = this.buildExecutePayload(body || {}, schema);
    const result = await this.dynamicSchemasService.executeReportSp('RPT_COMISIONES', payload, cusuario);
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
      this.dynamicSchemasService.loadKpisFromDb('RPT_COMISIONES'),
      this.dynamicSchemasService.loadGraficosFromDb('RPT_COMISIONES'),
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
      graphics: this.buildComisionesGraphics(graficoDefs, sortedRows, payload.filtros),
      chartSource: sortedRows,
      filtrosOpciones,
      grilla: payload.grilla,
      columnLabels: COMISIONES_COLUMN_LABELS,
      sync: syncMeta,
    };
  }
}

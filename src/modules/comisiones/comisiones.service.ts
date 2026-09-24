import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DynamicSchemasService } from '../dynamic-schemas/dynamic-schemas.service';
import {
  findCampo,
  mapCatalogOption,
  opcionesFromCampo,
  ReportesHeaders,
  ReportesRequestUser,
  resolveAseguradoraId,
} from '../components/utils/request-context.util';

@Injectable()
export class ComisionesService {
  private readonly logger = new Logger(ComisionesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly dynamicSchemasService: DynamicSchemasService,
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

    // Paso 3: Carga del Esquema de Filtros para RPT_COMISIONES
    const schema = await this.dynamicSchemasService.getSchema(
      'RPT_COMISIONES',
      user,
      headers,
      query,
    );
    if (schema?.error) return schema;

    const campos = (schema.campos || []).filter((c: any) => !c.hidden);
    const canalCampo = findCampo(campos, 'ccanal', 'canal');

    // Paso 4: Consultas de Catálogos y Opciones en paralelo (Promise.all)
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
    // Paso 2: Pre-Sincronización de Catálogos (Sync Context) - Omitido de momento, reservado para sincronización de orígenes
    // const syncCatalogs = await this.syncContext.maybeSyncCatalogsOnOpen(query, headers);

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
}

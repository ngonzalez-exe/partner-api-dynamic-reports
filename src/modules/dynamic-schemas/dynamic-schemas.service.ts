import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  ReportesHeaders,
  ReportesRequestUser,
  resolveCusuario,
} from '../components/utils/request-context.util';

const TIPO_CONTROL_MAP: Record<string, string> = {
  DATE: 'date',
  DATETIME: 'datetime',
  SELECT: 'select',
  AUTOCOMPLETE: 'autocomplete',
  TEXT: 'text',
  NUMBER: 'number',
  CHECKBOX: 'checkbox',
  TOGGLE: 'toggle',
  TEXTAREA: 'textarea',
  RADIO: 'radio',
  SLIDER: 'slider',
};

const ORDEN_INFINITO = Number.MAX_SAFE_INTEGER;

@Injectable()
export class DynamicSchemasService {
  private readonly logger = new Logger(DynamicSchemasService.name);

  constructor(private readonly db: DatabaseService) {}

  mapCampo(c: any) {
    const campo: Record<string, any> = {
      key: c.xnombre_param || c.nombre_param,
      label: c.xetiqueta || c.etiqueta,
      tipo: TIPO_CONTROL_MAP[c.itipo_control || c.tipo_control] || 'text',
      required: (c.bobligatorio ?? c.obligatorio) === true,
      hidden: (c.boculto ?? c.oculto) === true,
      ccampo: c.ccampo ?? c.id,
      nancho_grid: c.nancho_grid ?? c.ancho_grid,
      noffset_grid: c.noffset_grid ?? c.offset_grid,
      xicono: c.xicono ?? c.icono,
      bdesde_query: (c.bdesde_query ?? c.desde_query) === true,
      bsolo_lectura: (c.bsolo_lectura ?? c.solo_lectura) === true,
      xpadre_param: c.xpadre_param || c.padre_param || null,
    };
    const xvalorMinimo = c.xvalor_minimo ?? c.valor_minimo;
    const xvalorMaximo = c.xvalor_maximo ?? c.valor_maximo;
    const xspLista = c.xsp_lista ?? c.sp_lista;
    const xlistaValores = c.xlista_valores ?? c.lista_valores;
    if (xvalorMinimo) campo.xvalor_minimo = xvalorMinimo;
    if (xvalorMaximo) campo.xvalor_maximo = xvalorMaximo;
    if (xspLista) campo.xsp_lista = xspLista;
    if (xlistaValores) {
      try {
        const parsed = typeof xlistaValores === 'string' ? JSON.parse(xlistaValores) : xlistaValores;
        if (Array.isArray(parsed)) {
          campo.opciones = parsed.map((o: any) => ({
            value: String(o.cvalor ?? o.valor ?? o.value),
            label: o.xdescripcion ?? o.descripcion ?? o.label,
          }));
        }
      } catch (_) {}
    }
    return campo;
  }

  mapGrafico(g: any) {
    let conf = g.configuracion || g.xconfiguracion_json || g.configuracion_json || {};
    if (typeof conf === 'string') {
      try {
        conf = JSON.parse(conf);
      } catch {
        conf = {};
      }
    }
    const nordenRaw = g.norden ?? g.orden;
    return {
      id_grafico: g.id_grafico || g.xtitulo_ui || g.titulo_ui,
      xtitulo_ui: g.xtitulo_ui || g.titulo_ui || null,
      xcampo_dimension: conf.xcampo_dimension || conf.campo_dimension || '',
      xcampo_metrica: conf.xcampo_metrica || conf.campo_metrica || '',
      ioperacion: conf.ioperacion || conf.operacion || 'SUM',
      itipo_grafico: g.itipo_grafico || g.tipo_grafico,
      xcondiciones_json: g.xcondiciones_json || g.condiciones_json || null,
      norden: typeof nordenRaw === 'number' ? nordenRaw : Number.isFinite(Number(nordenRaw)) ? Number(nordenRaw) : ORDEN_INFINITO,
      ntop: typeof conf.ntop === 'number' ? conf.ntop : undefined,
      ...(Array.isArray(g.xfechas_compatibles) ? { xfechas_compatibles: g.xfechas_compatibles } : {}),
    };
  }

  mapKpi(k: any) {
    const condicionesRaw = k.xcondiciones_json ?? k.condiciones_json ?? k.condiciones ?? null;
    let xcondiciones_json = null;
    if (typeof condicionesRaw === 'string' && condicionesRaw.trim() !== '') {
      xcondiciones_json = condicionesRaw;
    } else if (Array.isArray(condicionesRaw) || (condicionesRaw && typeof condicionesRaw === 'object')) {
      xcondiciones_json = JSON.stringify(condicionesRaw);
    }

    const nordenRaw = k.norden ?? k.orden;
    const out: Record<string, any> = {
      xetiqueta_ui: k.xetiqueta_ui || k.etiqueta_ui,
      xdescripcion_ui: k.xdescripcion_ui || k.descripcion_ui || null,
      clase_ui: k.clase_ui || k.xclase_ui || null,
      xcampo_metrica: k.xcampo_metrica || k.campo_metrica,
      ioperacion: k.ioperacion || k.operacion,
      xformato: k.xformato || k.formato || 'NUMERO',
      xcondiciones_json,
      norden: typeof nordenRaw === 'number' ? nordenRaw : Number.isFinite(Number(nordenRaw)) ? Number(nordenRaw) : ORDEN_INFINITO,
    };
    if (k.xsimbolo) out.xsimbolo = k.xsimbolo;
    if (typeof k.xdecimales === 'number') out.xdecimales = k.xdecimales;
    if (Array.isArray(k.xfechas_compatibles)) out.xfechas_compatibles = k.xfechas_compatibles;
    return out;
  }

  async getSchema(
    slug: string,
    user?: ReportesRequestUser | null,
    headers?: ReportesHeaders,
    query?: Record<string, unknown>,
  ): Promise<any> {
    const cusuario = resolveCusuario({ user, headers, query });

    try {
      const rows = await this.db.executeSP('generar_esquema', {
        cusuario,
        p_usuario: cusuario,
        xnombre_interno: slug,
        p_nombre_interno: slug,
      });

      if (!rows || rows.length === 0) {
        return { error: true, message: `Esquema '${slug}' no encontrado` };
      }

      const row: any = rows[0];
      const rawSchema = row.xesquema_json ?? row.esquema_json ?? row;
      let esquema: any;
      try {
        esquema = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema;
      } catch (parseErr: any) {
        return { error: true, message: 'Error al parsear el esquema JSON' };
      }

      const campos = Array.isArray(esquema?.campos)
        ? esquema.campos.map((c: any) => this.mapCampo(c))
        : [];
      const graficos = Array.isArray(esquema?.graficos_default)
        ? esquema.graficos_default.map((g: any) => this.mapGrafico(g))
        : [];
      const kpis = Array.isArray(esquema?.kpis_default)
        ? esquema.kpis_default.map((k: any) => this.mapKpi(k))
        : [];
      const grilla = Array.isArray(esquema?.grilla) ? esquema.grilla : [];

      const pasosWizard = Array.isArray(esquema?.pasos_wizard)
        ? esquema.pasos_wizard.map((paso: any) => ({
            npaso: paso.npaso,
            xtitulo: paso.xtitulo || `Paso ${paso.npaso}`,
            campos: Array.isArray(paso.campos)
              ? paso.campos.map((c: any) => this.mapCampo(c))
              : [],
          }))
        : [];

      return {
        nombreInterno: esquema?.xnombre_interno || esquema?.nombre_interno || slug,
        nombre: esquema?.xtitulo_ui || esquema?.titulo_ui,
        cesquema: esquema?.cesquema ?? esquema?.id ?? null,
        icomportamiento: esquema?.icomportamiento || esquema?.comportamiento || 'ES',
        itipo: esquema?.itipo || esquema?.tipo || 'R',
        iformato_reporte: esquema?.iformato_reporte || esquema?.formato_reporte || 'XLSX',
        xnombre_archivo: esquema?.xnombre_archivo || esquema?.nombre_archivo || null,
        xdelimitador: esquema?.xdelimitador || esquema?.delimitador || null,
        campos,
        grilla,
        kpis,
        graficos,
        pasos_wizard: pasosWizard,
      };
    } catch (error: any) {
      this.logger.error(`Error ejecutando generar_esquema para '${slug}': ${error.message}`);
      return { error: true, message: error.message };
    }
  }

  buildPayloadForSp(body: Record<string, unknown> = {}): Record<string, unknown> {
    const filtros =
      body.filtros && typeof body.filtros === 'object'
        ? (body.filtros as Record<string, unknown>)
        : body;
    return {
      filtros,
      grilla: Array.isArray(body.grilla) ? body.grilla : [],
      kpis: Array.isArray(body.kpis) ? body.kpis : [],
      graficos: Array.isArray(body.graficos) ? body.graficos : [],
      bpreview: body.bpreview ? 1 : 0,
      bexportar: body.bexportar ? 1 : 0,
    };
  }

  async executeReportSp(
    slug: string,
    body: Record<string, unknown>,
    cusuario: number | null,
  ): Promise<any> {
    try {
      const payload = this.buildPayloadForSp(body);
      const rows = await this.db.executeSP('ejecutar_reporte', {
        p_usuario: cusuario,
        p_nombre_interno: slug,
        p_filtros_json: JSON.stringify(payload),
      });

      const list = Array.isArray(rows) ? rows : [];
      // En PostgreSQL, ejecutar_reporte devuelve SETOF jsonb, que pg mapea como { ejecutar_reporte: { ... } }
      const unpacked = list.map((r: any) => r.ejecutar_reporte ?? r);
      return { recordsets: [unpacked] };
    } catch (error: any) {
      this.logger.error(`executeReportSp failed for '${slug}': ${error.message}`);
      return { error: true, message: error.message };
    }
  }

  async loadKpisFromDb(slug: string): Promise<any[]> {
    try {
      const rows = await this.db.executeQuery(
        `SELECT
            etiqueta_ui AS "xetiqueta_ui",
            descripcion_ui AS "xdescripcion_ui",
            clase_ui AS "clase_ui",
            campo_metrica AS "xcampo_metrica",
            operacion AS "ioperacion",
            formato AS "xformato",
            orden AS "norden",
            condiciones_json AS "xcondiciones_json"
         FROM kpis
         WHERE id_esquema = (SELECT id FROM esquemas WHERE nombre_interno = @nombreInterno LIMIT 1)
           AND activo = TRUE
         ORDER BY orden ASC`,
        { nombreInterno: slug },
      );
      return Array.isArray(rows) ? rows : [];
    } catch (error: any) {
      this.logger.warn(`Error loading KPIs from DB for '${slug}': ${error.message}`);
      return [];
    }
  }

  async loadGraficosFromDb(slug: string): Promise<any[]> {
    try {
      const rows = await this.db.executeQuery(
        `SELECT
            titulo_ui AS "titulo_ui",
            tipo_grafico AS "tipo_grafico",
            configuracion_json AS "configuracion_json",
            orden AS "orden",
            condiciones_json AS "condiciones_json",
            ancho_grid AS "ancho_grid"
         FROM graficos
         WHERE id_esquema = (SELECT id FROM esquemas WHERE nombre_interno = @nombreInterno LIMIT 1)
           AND activo = TRUE
         ORDER BY orden ASC`,
        { nombreInterno: slug },
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((g: any, index: number) => {
        let conf: Record<string, any> = {};
        const raw = g.configuracion_json;
        if (typeof raw === 'string' && raw.trim() !== '') {
          try {
            conf = JSON.parse(raw);
          } catch {
            conf = {};
          }
        } else if (raw && typeof raw === 'object') {
          conf = raw;
        }
        return {
          id_grafico: g.titulo_ui || `grafico_${index + 1}`,
          xtitulo_ui: g.titulo_ui,
          itipo_grafico: g.tipo_grafico || 'BAR',
          xcampo_dimension: conf['xcampo_dimension'] || conf['campo_dimension'] || '',
          xcampo_metrica: conf['xcampo_metrica'] || conf['campo_metrica'] || '',
          ioperacion: conf['ioperacion'] || conf['operacion'] || 'COUNT',
          norden: typeof g.orden === 'number' ? g.orden : index + 1,
          ntop: typeof conf['ntop'] === 'number' ? conf['ntop'] : null,
          iorden: conf['iorden'] || 'DESC',
          xcondiciones_json: g.condiciones_json || null,
        };
      });
    } catch (error: any) {
      this.logger.warn(`Error loading Graficos from DB for '${slug}': ${error.message}`);
      return [];
    }
  }

  async executeReport(
    params: { nombreInterno: string },
    body: Record<string, unknown>,
    user?: ReportesRequestUser | null,
    headers?: ReportesHeaders,
  ): Promise<any> {
    const slug = String(params.nombreInterno || '').trim().toUpperCase();
    const cusuario = resolveCusuario({ user, body, headers });
    const result = await this.executeReportSp(slug, body, cusuario);
    if (result.error) return result;

    const grid = result.recordsets?.[0] || [];
    return { grid, kpis: [], graphics: {} };
  }
}


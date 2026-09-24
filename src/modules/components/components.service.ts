import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DynamicSchemasService } from '../dynamic-schemas/dynamic-schemas.service';
import { PolizasService } from '../polizas/polizas.service';
import { ComisionesService } from '../comisiones/comisiones.service';
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
  ) {}

  async execute(
    slug: string,
    body: Record<string, unknown>,
    user: ReportesRequestUser | null,
    headers: ReportesHeaders,
  ): Promise<any> {
    this.logger.log(`[execute] slug=${slug}, user=${user?.cusuario}`);
    // Pendiente de lógica de negocio personalizada
    return {
      slug,
      executed: true,
      data: [],
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
    // Pendiente de lógica de negocio personalizada
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
    // Pendiente de lógica de negocio personalizada
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
    // Pendiente de lógica de negocio personalizada
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
    // Pendiente de lógica de negocio personalizada
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
    // Pendiente de lógica de negocio personalizada
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
    // Pendiente de lógica de negocio personalizada
    return {
      slug,
      insights: [],
    };
  }
}

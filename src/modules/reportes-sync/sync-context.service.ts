import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AseguradoraResolverService } from './aseguradora-resolver.service';

export type SyncResult = {
  skipped: boolean;
  reason?: string;
  error?: string;
  aseguradoraId?: number | null;
  [key: string]: unknown;
};

export type SyncFiltrosBuilt = Record<string, unknown> & {
  aseguradoraId: number | null;
  desde?: Date;
  hasta?: Date;
  refreshScope: boolean;
  tipoFecha: unknown;
};

@Injectable()
export class SyncContextService {
  private readonly logger = new Logger(SyncContextService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aseguradoraResolver: AseguradoraResolverService,
  ) {}

  isSyncEnabled(): boolean {
    const raw = this.config.get<string | boolean>('REPORTES_SYNC_ENABLED', false);
    return raw === true || raw === 'true' || raw === '1';
  }

  private parseDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value as string | number | Date);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private syncLog(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      this.logger.log(`${message} ${JSON.stringify(meta)}`);
    } else {
      this.logger.log(message);
    }
  }

  async buildSyncFilters(
    body: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<SyncFiltrosBuilt> {
    const filtros =
      body.filtros && typeof body.filtros === 'object'
        ? (body.filtros as Record<string, unknown>)
        : {};
    const syncBlock =
      body.sync && typeof body.sync === 'object'
        ? (body.sync as Record<string, unknown>)
        : {};

    const aseguradoraId = await this.aseguradoraResolver.resolveAseguradoraId(
      null,
      body,
      headers,
    );

    const desde = this.parseDate(
      syncBlock.desde ??
        filtros.desde ??
        filtros.fdesdeemi ??
        filtros.fdesdenot ??
        filtros.fdesdeinc ??
        filtros.fecha_desde,
    );

    const hasta = this.parseDate(
      syncBlock.hasta ??
        filtros.hasta ??
        filtros.fhastaemi ??
        filtros.fhastanot ??
        filtros.fhastainc ??
        filtros.fecha_hasta,
    );

    return {
      ...filtros,
      aseguradoraId: aseguradoraId ? Number(aseguradoraId) : null,
      desde,
      hasta,
      refreshScope: Boolean(syncBlock.refreshScope),
      tipoFecha: filtros.tipoFecha ?? null,
    };
  }

  async maybeSyncBeforeReport(
    entidad: string,
    body: Record<string, unknown> = {},
    options: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<SyncResult> {
    this.syncLog(`iniciando sync antes de reporte (${entidad})`, {
      force: Boolean(body?.forceSync || (body?.sync as Record<string, unknown>)?.force),
    });

    try {
      if (!this.isSyncEnabled()) {
        const result: SyncResult = { skipped: true, reason: 'REPORTES_SYNC_ENABLED=false' };
        this.syncLog(`${entidad}: omitido (REPORTES_SYNC_ENABLED=false)`);
        return result;
      }

      const filtros = await this.buildSyncFilters(body, headers);
      if (!filtros.aseguradoraId) {
        const result: SyncResult = {
          skipped: true,
          reason: 'aseguradoraId es requerido para sincronizar',
        };
        this.syncLog(`${entidad}: omitido (${result.reason})`);
        return result;
      }

      this.syncLog(
        `${entidad}: sincronización origen aseguradora ${filtros.aseguradoraId} (preparado para ETL)`,
        {
          desde: filtros.desde?.toISOString?.() ?? null,
          hasta: filtros.hasta?.toISOString?.() ?? null,
        },
      );

      // Cuando se porte el motor ETL completo, aquí se invocará syncService.syncIncremental
      return {
        skipped: true,
        reason: 'etl_engine_pending_port',
        aseguradoraId: filtros.aseguradoraId,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      this.syncLog(
        `${entidad}: error en sync previo, se continúa con datos locales`,
        { message },
      );
      return {
        skipped: true,
        reason: 'sync_preflight_error',
        error: message,
      };
    }
  }

  async maybeSyncCatalogsOnOpen(
    body: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<SyncResult> {
    if (!this.isSyncEnabled()) {
      return {
        skipped: true,
        reason: 'REPORTES_SYNC_ENABLED=false',
        catalogs: [],
      };
    }

    const filtros = await this.buildSyncFilters(body, headers);
    return {
      skipped: true,
      reason: 'etl_engine_pending_port',
      aseguradoraId: filtros.aseguradoraId,
      catalogs: [],
    };
  }
}

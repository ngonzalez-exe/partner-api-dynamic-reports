import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';
import { firstRow, assertQueryResult } from '../utils/sync.helpers';

@Injectable()
export class SyncWatermarkRepository {
  private readonly enumSupportedEntities = new Set([
    'polizas',
    'recibos',
    'siniestros',
  ]);

  constructor(private readonly reportesPg: ReportesPgService) {}

  async getWatermark(
    aseguradoraId: number,
    entidad: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.enumSupportedEntities.has(entidad)) {
      return null;
    }
    const result = await this.reportesPg.executeQuery(
      `SELECT id, last_modified_at, last_run_at, rows_synced, last_error
     FROM sync_watermark
     WHERE id_aseguradora = @aseguradoraId AND entidad = @entidad::sync_entidad
     LIMIT 1`,
      { aseguradoraId, entidad },
    );
    return firstRow(result, 'getWatermark');
  }

  async upsertWatermark(
    aseguradoraId: number,
    entidad: string,
    data: {
      lastModifiedAt?: Date | null;
      lastRunAt?: Date | null;
      rowsSynced?: number;
      lastError?: string | null;
    },
  ): Promise<Record<string, unknown> | null> {
    if (!this.enumSupportedEntities.has(entidad)) {
      return null;
    }
    try {
      const existing = await this.getWatermark(aseguradoraId, entidad);
      if (existing?.id) {
        const result = await this.reportesPg.executeQuery(
          `UPDATE sync_watermark
           SET last_modified_at = COALESCE(@lastModifiedAt, last_modified_at),
               last_run_at = @lastRunAt,
               rows_synced = @rowsSynced,
               last_error = @lastError
           WHERE id = @id
           RETURNING id, last_modified_at, last_run_at, rows_synced, last_error`,
          {
            id: existing.id,
            lastModifiedAt: data.lastModifiedAt ?? null,
            lastRunAt: data.lastRunAt ?? null,
            rowsSynced: data.rowsSynced ?? 0,
            lastError: data.lastError ?? null,
          },
        );
        return firstRow(result, 'upsertWatermark');
      }

      const result = await this.reportesPg.executeQuery(
        `INSERT INTO sync_watermark (
           id, id_aseguradora, entidad, last_modified_at, last_run_at, rows_synced, last_error
         ) VALUES (
           (SELECT COALESCE(MAX(id), 0) + 1 FROM sync_watermark),
           @aseguradoraId, @entidad::sync_entidad, @lastModifiedAt, @lastRunAt, @rowsSynced, @lastError
         )
         RETURNING id, last_modified_at, last_run_at, rows_synced, last_error`,
        {
          aseguradoraId,
          entidad,
          lastModifiedAt: data.lastModifiedAt ?? null,
          lastRunAt: data.lastRunAt ?? null,
          rowsSynced: data.rowsSynced ?? 0,
          lastError: data.lastError ?? null,
        },
      );
      return firstRow(result, 'upsertWatermark');
    } catch {
      return null;
    }
  }

  async listByAseguradora(
    aseguradoraId: number,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.reportesPg.executeQuery(
      `SELECT entidad, last_modified_at, last_run_at, rows_synced, last_error
     FROM sync_watermark
     WHERE id_aseguradora = @aseguradoraId
     ORDER BY entidad ASC`,
      { aseguradoraId },
    );
    return assertQueryResult(result, 'listByAseguradora');
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { extractAseguradoraIdExplicit } from './aseguradora-context';

@Injectable()
export class AseguradoraResolverService {
  private readonly logger = new Logger(AseguradoraResolverService.name);

  constructor(private readonly db: DatabaseService) {}

  private normalizeId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**
   * Resuelve id de aseguradora para sync/reportes.
   * - Header X-Aseguradora-Id, body.sync, body.filtros o body.aseguradoraId
   * - Si hay una sola activa -> se infiere
   * - Si hay varias -> requiere id explícito
   */
  async resolveAseguradoraId(
    explicitId?: unknown,
    body: Record<string, unknown> | null = null,
    headers: Record<string, unknown> | null = null,
  ): Promise<number | null> {
    const fromContext =
      body || headers
        ? extractAseguradoraIdExplicit(body || {}, headers || {})
        : null;
    const candidate = explicitId ?? fromContext;
    const normalized = this.normalizeId(candidate);
    if (normalized) return normalized;

    try {
      const active = await this.db.executeQuery(
        `SELECT id, codigo, nombre FROM aseguradora_conexion WHERE activo = TRUE ORDER BY codigo ASC`,
      );

      if (!active || active.length === 0) {
        return null;
      }

      if (active.length === 1) {
        return Number(active[0].id);
      }
    } catch (error: any) {
      this.logger.error(`Error consultando aseguradora_conexion: ${error.message}`);
    }

    return null;
  }

  aseguradoraRequiredMessage(activeCount: number): string {
    if (activeCount === 0) {
      return 'No hay aseguradoras activas configuradas en aseguradora_conexion';
    }
    return 'aseguradoraId es requerido cuando hay múltiples orígenes activos';
  }
}

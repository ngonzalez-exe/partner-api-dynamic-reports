import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

export interface ReportesQuerySuccess {
  recordset: Record<string, unknown>[];
  recordsets: Record<string, unknown>[][];
  rowsAffected: number;
  error?: undefined;
}

export interface ReportesQueryError {
  error: true;
  message: string;
}

export type ReportesQueryResult = ReportesQuerySuccess | ReportesQueryError;

@Injectable()
export class ReportesPgService {
  private readonly logger = new Logger(ReportesPgService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  isEnabled(): boolean {
    const raw = this.configService.get<string | boolean>('REPORTES_ENABLED', true);
    return raw === true || raw === 'true' || raw === '1';
  }

  async executeQuery(
    query: string,
    params: Record<string, unknown> = {},
  ): Promise<ReportesQueryResult> {
    try {
      const rows = await this.db.executeQuery(query, params);
      const list = Array.isArray(rows) ? rows : [];
      return {
        recordset: list,
        recordsets: [list],
        rowsAffected: list.length,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`executeQuery failed: ${message}`);
      return { error: true, message };
    }
  }

  async executeSP(
    spName: string,
    params: Record<string, unknown> = {},
  ): Promise<ReportesQueryResult> {
    try {
      const rows = await this.db.executeSP(spName, params);
      const list = Array.isArray(rows) ? rows : [];
      return {
        recordset: list,
        recordsets: [list],
        rowsAffected: list.length,
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`executeSP(${spName}) failed: ${message}`);
      return { error: true, message };
    }
  }
}

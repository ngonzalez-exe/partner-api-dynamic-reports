import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';

// 1. Configuracion de Type Parsers globales de node-postgres
// OID 20: INT8 (bigint) -> Number nativo de JavaScript
types.setTypeParser(20, (val: string | null) => (val === null ? null : parseInt(val, 10)));
// OID 1700: NUMERIC / DECIMAL -> Number (float) nativo de JavaScript
types.setTypeParser(1700, (val: string | null) => (val === null ? null : parseFloat(val)));

export interface RoutineArgumentMeta {
  name: string;
  mode: string; // 'i' = IN, 'b' = INOUT, 'o' = OUT, 't' = TABLE
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;
  private defaultSchema = 'public';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('DB_HOST');
    const port = Number(this.configService.get<number | string>('DB_PORT', 5432));
    const user = this.configService.get<string>('DB_USER');
    const password = this.configService.get<string>('DB_PASSWORD');
    const database = this.configService.get<string>('DB_NAME');
    this.defaultSchema = this.configService.get<string>('DB_SCHEMA', 'public');
    const encryptRaw = this.configService.get<string | boolean>('DB_ENCRYPT', false);
    const encrypt = encryptRaw === true || encryptRaw === 'true' || encryptRaw === '1';

    if (!host || !user || !password || !database) {
      this.logger.warn(
        'Faltan variables de entorno de conexion a PostgreSQL (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME). Verifica tu archivo .env.',
      );
    }

    this.pool = new Pool({
      host,
      port,
      user,
      password,
      database,
      ssl: encrypt ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Configurar search_path al conectar nuevos clientes
    this.pool.on('connect', (client: PoolClient) => {
      client.query(`SET search_path TO "${this.defaultSchema}", public`).catch((err) => {
        this.logger.warn(`No se pudo establecer search_path a ${this.defaultSchema}: ${err.message}`);
      });
    });

    this.pool.on('error', (err) => {
      this.logger.error(`Error inesperado en el pool inactivo de PostgreSQL: ${err.message}`, err.stack);
    });

    try {
      await this.runWithRetry(async () => {
        await this.pool.query('SELECT 1');
      });
      this.logger.log(`Connected to PostgreSQL database: ${host}:${port}/${database} (schema: ${this.defaultSchema})`);
    } catch (error: any) {
      this.logger.error(`Error conectando a la base de datos PostgreSQL: ${error.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      this.logger.log('Cerrando pool de conexiones PostgreSQL...');
      await this.pool.end();
      this.logger.log('Pool de conexiones cerrado con exito.');
    }
  }

  /**
   * Ejecuta una operacion de base de datos con reintentos automaticos ante errores transitorios.
   */
  async runWithRetry<T>(
    operation: () => Promise<T>,
    retries = 3,
    initialDelayMs = 1000,
  ): Promise<T> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (attempt < retries) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        const isTransient = this.isTransientError(error);

        if (!isTransient || attempt >= retries) {
          throw error;
        }

        this.logger.warn(
          `Error transitorio en base de datos [${error.code || error.message}]. Reintento ${attempt}/${retries} en ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    throw new Error('Numero maximo de reintentos superado');
  }

  /**
   * Ejecuta una consulta SQL con soporte para parametros nombrados (@paramName).
   * Traduce @paramName a $1, $2, etc., de forma parametrizada y segura.
   */
  async executeQuery<T extends QueryResultRow = any>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const { transformedSql, values } = this.transformNamedParameters(sql, params);

    return this.runWithRetry(async () => {
      const result = await this.pool.query(transformedSql, values);
      return result.rows as T[];
    });
  }

  /**
   * Ejecuta un procedimiento almacenado (PROCEDURE con CALL) o una funcion (FUNCTION con SELECT * FROM)
   * consultando previamente el catalogo pg_proc para resolver sus argumentos en el orden requerido.
   */
  async executeSP<T extends QueryResultRow = any>(
    routineName: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    let schema = this.defaultSchema;
    let pureRoutine = routineName;

    if (routineName.includes('.')) {
      const parts = routineName.split('.');
      schema = parts[0];
      pureRoutine = parts[1];
    }

    // Consultar el catalogo pg_proc para resolver la rutina
    const catalogSql = `
      SELECT 
        p.proname,
        p.prokind,
        p.proargnames,
        p.proargmodes,
        n.nspname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = $1
        AND (n.nspname = $2 OR $2 IS NULL)
      ORDER BY (n.nspname = $2) DESC
      LIMIT 1;
    `;

    const metaRows = await this.runWithRetry(async () => {
      const res = await this.pool.query(catalogSql, [pureRoutine, schema]);
      return res.rows;
    });

    if (metaRows.length === 0) {
      // Si no se encuentra en pg_proc con ese esquema, intentar sin restriccion de esquema
      const fallbackRows = await this.runWithRetry(async () => {
        const res = await this.pool.query(catalogSql, [pureRoutine, null]);
        return res.rows;
      });

      if (fallbackRows.length > 0) {
        return this.invokeRoutine<T>(fallbackRows[0], params);
      }

      this.logger.warn(
        `Rutina "${routineName}" no encontrada en el catalogo pg_proc. Intentando ejecucion directa...`,
      );
      return this.executeDirectRoutineFallback<T>(routineName, params);
    }

    return this.invokeRoutine<T>(metaRows[0], params);
  }

  /**
   * Retorna el pool subyacente para casos avanzados (transacciones manuales, streaming, etc.).
   */
  getPool(): Pool {
    return this.pool;
  }

  // --- Metodos auxiliares internos ---

  private transformNamedParameters(
    sql: string,
    params?: Record<string, unknown>,
  ): { transformedSql: string; values: unknown[] } {
    if (!params || Object.keys(params).length === 0) {
      return { transformedSql: sql, values: [] };
    }

    const paramMap = new Map<string, number>();
    const values: unknown[] = [];

    // Reemplaza @paramName por $1, $2, etc. Reutiliza el indice si el parametro aparece mas de una vez.
    const transformedSql = sql.replace(/@([a-zA-Z0-9_]+)\b/g, (_match, paramName) => {
      if (!paramMap.has(paramName)) {
        values.push(params[paramName] !== undefined ? params[paramName] : null);
        paramMap.set(paramName, values.length);
      }
      const index = paramMap.get(paramName);
      return `$${index}`;
    });

    return { transformedSql, values };
  }

  private async invokeRoutine<T extends QueryResultRow = any>(
    routineMeta: any,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const { proname, prokind, proargnames, proargmodes, nspname } = routineMeta;
    const isProcedure = prokind === 'p';
    const qualifiedName = `"${nspname}"."${proname}"`;

    const values: unknown[] = [];
    const placeholders: string[] = [];

    if (proargnames && Array.isArray(proargnames)) {
      let valueIndex = 1;

      for (let i = 0; i < proargnames.length; i++) {
        const argName = proargnames[i];
        const mode = proargmodes ? proargmodes[i] : 'i';

        // Solo procesar argumentos de entrada: 'i' (IN), 'b' (INOUT), 'v' (VARIADIC)
        if (mode === 'i' || mode === 'b' || mode === 'v' || !mode) {
          const val = this.resolveParamValue(argName, params);
          values.push(val);
          placeholders.push(`$${valueIndex++}`);
        }
      }
    } else if (params) {
      // Si no tiene proargnames pero se pasaron parametros
      let index = 1;
      for (const key of Object.keys(params)) {
        values.push(params[key]);
        placeholders.push(`$${index++}`);
      }
    }

    const argsList = placeholders.join(', ');
    const query = isProcedure
      ? `CALL ${qualifiedName}(${argsList});`
      : `SELECT * FROM ${qualifiedName}(${argsList});`;

    return this.runWithRetry(async () => {
      const result = await this.pool.query(query, values);
      return result.rows as T[];
    });
  }

  private async executeDirectRoutineFallback<T extends QueryResultRow = any>(
    routineName: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    if (params) {
      let index = 1;
      for (const key of Object.keys(params)) {
        values.push(params[key]);
        placeholders.push(`$${index++}`);
      }
    }

    const argsList = placeholders.join(', ');
    const query = `SELECT * FROM ${routineName}(${argsList});`;

    return this.runWithRetry(async () => {
      const result = await this.pool.query(query, values);
      return result.rows as T[];
    });
  }

  private resolveParamValue(
    argName: string,
    params?: Record<string, unknown>,
  ): unknown {
    if (!params) return null;

    // 1. Coincidencia exacta
    if (params[argName] !== undefined) {
      return params[argName];
    }

    // 2. Coincidencia sin prefijo p_ o _
    const strippedArg = argName.replace(/^(p_|_)/i, '');
    if (params[strippedArg] !== undefined) {
      return params[strippedArg];
    }

    // 3. Coincidencia insensible a mayusculas/minusculas
    const lowerArg = argName.toLowerCase();
    for (const key of Object.keys(params)) {
      if (key.toLowerCase() === lowerArg || key.toLowerCase() === strippedArg.toLowerCase()) {
        return params[key];
      }
    }

    return null;
  }

  private isTransientError(error: any): boolean {
    if (!error) return false;

    const transientCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      '57P01', // admin_shutdown
      '57P02', // crash_shutdown
      '57P03', // cannot_connect_now
      '08006', // connection_failure
      '08001', // sqlclient_unable_to_establish_sqlconnection
      '08004', // sqlserver_rejected_establishment_of_sqlconnection
    ];

    if (error.code && transientCodes.includes(String(error.code).toUpperCase())) {
      return true;
    }

    const message = (error.message || '').toLowerCase();
    return (
      message.includes('connection terminated') ||
      message.includes('timeout') ||
      message.includes('connection closed') ||
      message.includes('server closed the connection')
    );
  }
}
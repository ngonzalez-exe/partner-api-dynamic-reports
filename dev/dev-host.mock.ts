import { Logger } from '@nestjs/common';
import { ExelixiPartnerHost } from '@jsotoexelixitech/nest-api-sdk';

export class DevPartnerHost implements ExelixiPartnerHost {
  private readonly logger = new Logger('DevPartnerHost');

  getConfig(key: string): string | undefined {
    return process.env[key];
  }

  log(level: 'log' | 'warn' | 'error', message: string, context?: string): void {
    const ctx = context ?? 'PartnerModule';
    if (level === 'error') {
      this.logger.error(`[${ctx}] ${message}`);
    } else if (level === 'warn') {
      this.logger.warn(`[${ctx}] ${message}`);
    } else {
      this.logger.log(`[${ctx}] ${message}`);
    }
  }
}

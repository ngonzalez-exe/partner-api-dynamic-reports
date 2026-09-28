export function formatPersonaDocNombre(
  cedula: unknown,
  nombre: unknown,
): string | null {
  const doc = String(cedula ?? '').trim();
  const name = String(nombre ?? '').trim();
  if (doc && name) return `${doc} - ${name}`;
  if (name) return name;
  if (doc) return doc;
  return null;
}

export function sortRows<T = Record<string, any>>(
  rows: T[],
  sortField?: string,
  sortDir?: string,
): T[] {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (!sortField) return list;
  const dir = String(sortDir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  list.sort((a: any, b: any) => {
    const av = a?.[sortField];
    const bv = b?.[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return (
      String(av).localeCompare(String(bv), 'es', {
        numeric: true,
        sensitivity: 'base',
      }) * dir
    );
  });
  return list;
}

export function paginateRows<T = Record<string, any>>(
  rows: T[],
  page: unknown,
  pageSize: unknown,
): T[] {
  const size = Math.max(1, Number(pageSize) || 20);
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * size;
  return (rows || []).slice(start, start + size);
}

export function resolvePagination(
  body: any,
  headers?: any,
): { page: number; pageSize: number } {
  const paginacion =
    body && body.paginacion && typeof body.paginacion === 'object'
      ? body.paginacion
      : {};
  const pageRaw =
    paginacion.pagina ??
    body?.page ??
    headers?.['x-report-page'] ??
    headers?.['X-Report-Page'] ??
    1;
  const sizeRaw =
    paginacion.tamano ??
    body?.pageSize ??
    headers?.['x-report-page-size'] ??
    headers?.['X-Report-Page-Size'] ??
    20;
  const page = Math.max(1, Number(pageRaw) || 1);
  const pageSize = Math.max(1, Math.min(500, Number(sizeRaw) || 20));
  return { page, pageSize };
}

export function toNumber(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value)
    .trim()
    .replace(/[$€RD\s]/gi, '')
    .replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseMetricNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text === '') return null;
  const cleaned = text.replace(/[$€RD\s]/gi, '').replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function getRowFieldValue(row: any, field: string): any {
  if (!row || typeof row !== 'object' || field == null) return undefined;
  const wanted = String(field).trim();
  if (!wanted) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, wanted)) return row[wanted];
  const lower = wanted.toLowerCase();
  const key = Object.keys(row).find((k) => String(k).toLowerCase() === lower);
  return key ? row[key] : undefined;
}

export function normalizeKpiOperation(operation: unknown): string {
  const op = String(operation || '').trim().toUpperCase();
  return ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(op) ? op : 'SUM';
}

export function evaluateKpiOperation(
  rows: any[],
  field: string,
  operation: unknown,
): number {
  const op = normalizeKpiOperation(operation);
  if (op === 'COUNT') return Array.isArray(rows) ? rows.length : 0;

  const values = (Array.isArray(rows) ? rows : [])
    .map((row) => parseMetricNumber(getRowFieldValue(row, field)))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return 0;
  if (op === 'MIN') return Math.min(...values);
  if (op === 'MAX') return Math.max(...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return op === 'AVG' ? total / values.length : total;
}

export function normalizeFilterString(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function monedaAliases(value: unknown): string[] {
  const n = normalizeFilterString(value);
  if (!n) return [];
  if (n.includes('dolar') || n === 'usd' || n === '$') {
    return ['dolares', 'dolar', 'usd', '$'];
  }
  if (n.includes('euro') || n === 'eur' || n === '€') {
    return ['euros', 'euro', 'eur', '€'];
  }
  if (n.includes('bolivar') || n === 'bs' || n === 'ves' || n.startsWith('bs')) {
    return ['bolivares', 'bolivar', 'bs', 'ves'];
  }
  return [n];
}

export function monedasCoinciden(a: unknown, b: unknown): boolean {
  const na = normalizeFilterString(a);
  const nb = normalizeFilterString(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aa = monedaAliases(a);
  const ab = monedaAliases(b);
  return aa.some((x) => ab.includes(x));
}

export function parseKpiConditions(item: any): any[] {
  if (!item || typeof item !== 'object') return [];
  const raw = item.condiciones ?? item.xcondiciones_json ?? item.condiciones_json;
  if (Array.isArray(raw)) return raw.filter((i) => i && typeof i === 'object');
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((i) => i && typeof i === 'object')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function matchesCondition(condition: any, fieldValue: unknown): boolean {
  const operator = String(condition?.operador ?? '=')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  const rawValor = condition?.valor;
  const actual = normalizeFilterString(fieldValue);

  const expectedValues = Array.isArray(rawValor)
    ? rawValor.map((item) => normalizeFilterString(item)).filter(Boolean)
    : typeof rawValor === 'string' && rawValor.includes(',')
      ? rawValor
          .split(',')
          .map((item) => normalizeFilterString(item))
          .filter(Boolean)
      : [normalizeFilterString(rawValor)].filter(Boolean);

  if (expectedValues.length === 0) return true;

  const campoKey = normalizeFilterString(condition?.campo || '').replace(/_/g, '');
  const isMoneda = campoKey === 'moneda' || campoKey === 'cmoneda';

  const hasMatch = isMoneda
    ? expectedValues.some((expected) => monedasCoinciden(actual, expected))
    : expectedValues.some((expected) => expected === actual);

  if (
    operator === 'NOT IN' ||
    operator === 'NOTIN' ||
    operator === '!=' ||
    operator === '<>'
  ) {
    return !hasMatch;
  }
  return hasMatch;
}

export function isAllFilterValue(value: unknown): boolean {
  const normalized = normalizeFilterString(value);
  return (
    normalized === '' ||
    normalized === '0' ||
    normalized === 'todos' ||
    normalized === 'all' ||
    normalized === '*' ||
    normalized === '_ninguno_'
  );
}

export function mergeKpiDefinitions(bodyKpis: any[], schemaKpis: any[]): any[] {
  const schemaList = Array.isArray(schemaKpis) ? schemaKpis : [];
  const bodyList = Array.isArray(bodyKpis) ? bodyKpis : [];
  const source = bodyList.length > 0 ? bodyList : schemaList;
  if (source.length === 0) return [];

  const schemaByLabel = new Map();
  for (const kpi of schemaList) {
    const label = String(kpi?.xetiqueta_ui || kpi?.etiqueta_ui || '').trim();
    if (label) schemaByLabel.set(label, kpi);
  }

  return source.map((kpi) => {
    if (!kpi || typeof kpi !== 'object') return kpi;
    const label = String(kpi.xetiqueta_ui || kpi.etiqueta_ui || '').trim();
    const fromSchema = label ? schemaByLabel.get(label) : null;
    if (!fromSchema) return kpi;

    const bodyHasCond = parseKpiConditions(kpi).length > 0;
    const schemaCond = parseKpiConditions(fromSchema);

    const xcondiciones_json =
      schemaCond.length > 0
        ? fromSchema.xcondiciones_json ||
          fromSchema.condiciones_json ||
          JSON.stringify(schemaCond)
        : bodyHasCond
          ? kpi.xcondiciones_json ||
            kpi.condiciones_json ||
            (Array.isArray(kpi.condiciones)
              ? JSON.stringify(kpi.condiciones)
              : null)
          : null;

    return {
      ...fromSchema,
      ...kpi,
      xdescripcion_ui:
        kpi.xdescripcion_ui ||
        kpi.descripcion_ui ||
        fromSchema.xdescripcion_ui ||
        fromSchema.descripcion_ui ||
        null,
      clase_ui:
        kpi.clase_ui ||
        kpi.xclase_ui ||
        fromSchema.clase_ui ||
        fromSchema.xclase_ui ||
        null,

      xcondiciones_json,
    };
  });
}

export function getConditionFieldValue(row: any, condition: any): any {
  const campo = String(condition?.campo || '').trim();
  const direct = getRowFieldValue(row, campo);
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') return direct;
  return (
    getRowFieldValue(row, 'estatus_poliza') ??
    getRowFieldValue(row, 'estado_recibo') ??
    getRowFieldValue(row, 'cestatus') ??
    getRowFieldValue(row, 'estatus') ??
    ''
  );
}


export function filterRowsByKpiConditions(rows: any[], conditions: any[]): any[] {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return Array.isArray(rows) ? rows : [];
  }
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    conditions.every((condition) =>
      matchesCondition(condition, getConditionFieldValue(row, condition)),
    ),
  );
}


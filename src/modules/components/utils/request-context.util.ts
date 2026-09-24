export interface ReportesRequestUser {
  cusuario: number;
}

export type ReportesHeaders = Record<string, string | string[] | undefined>;

function headerValue(
  headers: ReportesHeaders | undefined,
  ...names: string[]
): string | undefined {
  if (!headers) return undefined;
  for (const name of names) {
    const raw =
      headers[name] ??
      headers[name.toLowerCase()] ??
      headers[name.toUpperCase()];
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return undefined;
}

/** Resuelve cusuario: body/query -> header X-CUsuario -> user.cusuario. */
export function resolveCusuario(sources: {
  user?: ReportesRequestUser | null;
  headers?: ReportesHeaders;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
} = {}): number | null {
  const { user, headers, query, body } = sources;

  const fromBody = body?.cusuario ?? query?.cusuario;
  if (fromBody !== undefined && fromBody !== null && fromBody !== '') {
    const n = Number(fromBody);
    if (Number.isFinite(n)) return n;
  }

  const fromHeader = headerValue(headers, 'x-cusuario', 'X-CUsuario');
  if (fromHeader) {
    const n = Number(fromHeader);
    if (Number.isFinite(n)) return n;
  }

  if (user?.cusuario) {
    const n = Number(user.cusuario);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

/** Resuelve aseguradoraId: header X-Aseguradora-Id -> body/query. */
export function resolveAseguradoraId(sources: {
  headers?: ReportesHeaders;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
} = {}): number | null {
  const { headers, query, body } = sources;

  const fromHeader = headerValue(headers, 'x-aseguradora-id', 'X-Aseguradora-Id');
  if (fromHeader) {
    const n = Number(fromHeader);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const fromQueryOrBody =
    body?.aseguradoraId ??
    body?.id_aseguradora ??
    query?.aseguradoraId ??
    query?.id_aseguradora;

  if (fromQueryOrBody !== undefined && fromQueryOrBody !== null && String(fromQueryOrBody).trim() !== '') {
    const n = Number(fromQueryOrBody);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function mapCatalogOption(row: any): { cvalor: string; xdescripcion: string } | null {
  if (!row || typeof row !== 'object') return null;

  const value =
    row.cvalor ??
    row.value ??
    row.cestatus ??
    row.cramo ??
    row.cproductor ??
    row.ccanal ??
    row.ccanalalt ??
    row.codigo ??
    row.id;

  const label =
    row.xdescripcion ??
    row.xvalor ??
    row.label ??
    row.canal ??
    row.xcanal ??
    row.xcanalalt ??
    row.xramo ??
    row.ramo ??
    row.descripcion ??
    row.nombre;

  if (value === undefined || value === null) return null;

  const normalizedValue = String(value).trim();
  const normalizedLabel = normalizeText(label ?? value);
  if (normalizedValue === '' || normalizedLabel === '') return null;

  return {
    cvalor: normalizedValue,
    xdescripcion: normalizedLabel,
  };
}

export function findCampo(campos: any[], ...exactKeys: string[]): any | null {
  const wanted = new Set(exactKeys.map((k) => String(k).toLowerCase()));
  return (campos || []).find((c: any) => wanted.has(String(c?.key || '').toLowerCase())) || null;
}

export function opcionesFromCampo(campo: any): { cvalor: string; xdescripcion: string }[] {
  if (!Array.isArray(campo?.opciones) || campo.opciones.length === 0) return [];
  return campo.opciones
    .map((o: any) =>
      mapCatalogOption({
        cvalor: o.value ?? o.cvalor,
        xdescripcion: o.label ?? o.xdescripcion,
      }),
    )
    .filter(Boolean) as { cvalor: string; xdescripcion: string }[];
}

export interface InsightBloqueLike {
  tipo?: string;
  categoria?: string;
  prioridad?: string;
  titulo?: string;
  detalle?: string;
  valor?: string;
  formula?: string;
  origen_datos?: string;
  metodologia?: string;
  recomendacion?: string;
  top_elementos?: Array<{ nombre?: string; valor?: number | null; pct?: number }>;
  [key: string]: unknown;
}

export interface AnalisisIAResult {
  resumen_ejecutivo: string;
  observaciones: Array<{
    titulo: string;
    detalle: string;
    prioridad: string;
    recomendacion: string;
    origen_datos: string;
    metodologia: string;
    formula: string;
  }>;
  estrategias: string[];
  alertas: string[];
}

/**
 * Generador de contingencia (fallback) determinista.
 * Se activa si GEMINI_API_KEY no está configurada o si la llamada a Google Gemini falla,
 * garantizando que el frontend siempre reciba un análisis analítico estructurado y coherente.
 */
export function buildFallbackAnalisisIA(
  insights: InsightBloqueLike[],
  slug = 'RPT_COMISIONES',
): AnalisisIAResult {
  const nombreLegible = slug.replace(/^RPT_/i, '').replace(/_/g, ' ').toLowerCase();

  if (!Array.isArray(insights) || insights.length === 0) {
    return {
      resumen_ejecutivo: `Se evaluaron los indicadores actuales del reporte de ${nombreLegible}. No se detectaron anomalías críticas ni concentraciones atípicas en los filtros seleccionados.`,
      observaciones: [
        {
          titulo: 'Comportamiento dentro de parámetros normales',
          detalle: 'Los datos analizados no reflejan desviaciones extremas ni concentraciones irregulares en el período evaluado.',
          prioridad: 'Baja',
          recomendacion: 'Mantener la supervisión periódica de la cartera con los filtros comerciales habituales.',
          origen_datos: 'KPIs y Gráficos del Reporte',
          metodologia: 'Evaluación de rangos estadísticos estándar',
          formula: '',
        },
      ],
      estrategias: [
        'Monitorear la consistencia de las liquidaciones en los cierres de ciclo.',
        'Evaluar la evolución de las primas cobradas en comparación con períodos anteriores.',
        'Verificar el cumplimiento de los acuerdos comerciales establecidos.',
      ],
      alertas: [],
    };
  }

  // Filtrar y ordenar observaciones
  const ordenPrioridad: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 };
  const sorted = [...insights].sort(
    (a, b) =>
      (ordenPrioridad[String(a.prioridad)] ?? 9) -
      (ordenPrioridad[String(b.prioridad)] ?? 9),
  );

  const topObservaciones = sorted.slice(0, 6).map((item) => {
    const prioridad = ['Alta', 'Media', 'Baja'].includes(String(item.prioridad))
      ? String(item.prioridad)
      : 'Media';

    let recomendacion =
      typeof item.recomendacion === 'string' && item.recomendacion.trim()
        ? item.recomendacion.trim()
        : '';

    if (!recomendacion) {
      if (item.tipo === 'concentracion') {
        recomendacion =
          'Diversificar la cartera comercial y auditar las condiciones pactadas con los principales participantes.';
      } else if (item.tipo === 'anomalia') {
        recomendacion =
          'Revisar las transacciones individuales que originan esta desviación estadística para descartar inconsistencias operativas.';
      } else if (item.tipo === 'tendencia') {
        recomendacion =
          'Hacer seguimiento continuo a la variación porcentual para proyectar el cierre del ciclo.';
      } else {
        recomendacion =
          prioridad === 'Alta'
            ? 'Priorizar auditoría manual y validación con el área responsable.'
            : 'Mantener seguimiento en el tablero operativo.';
      }
    }

    return {
      titulo: String(item.titulo || 'Hallazgo operativo'),
      detalle: String(item.detalle || 'Detalle no disponible'),
      prioridad,
      recomendacion,
      origen_datos: String(item.origen_datos || item.categoria || 'Reporte de Comisiones'),
      metodologia: String(item.metodologia || (item.tipo ? `Análisis de ${item.tipo}` : 'Análisis estadístico')),
      formula: String(item.formula || ''),
    };
  });

  // Extraer alertas (prioridad Alta o anomalías)
  const alertas: string[] = [];
  for (const item of sorted) {
    if (item.prioridad === 'Alta' || item.tipo === 'anomalia') {
      const alertaTexto = item.detalle
        ? `${item.titulo}: ${item.detalle}`
        : String(item.titulo || '');
      if (alertaTexto && !alertas.includes(alertaTexto)) {
        alertas.push(alertaTexto);
      }
    }
    if (alertas.length >= 3) break;
  }

  // Generar 3 estrategias concretas
  const estrategias: string[] = [
    'Supervisar la concentración de comisiones y primas en los intermediarios clave para mitigar la dependencia operativa.',
    'Optimizar los tiempos de liquidación entre el cobro de recibos y el desembolso de comisiones para reducir la cartera rezagada.',
    'Auditar periódicamente los porcentajes pactados y las retenciones fiscales aplicadas para garantizar consistencia operativa.',
  ];

  const altasCount = topObservaciones.filter((o) => o.prioridad === 'Alta').length;
  const resumen_ejecutivo = `Análisis estadístico del reporte de ${nombreLegible}. Se identificaron ${topObservaciones.length} observaciones clave en la distribución y comportamiento de los datos, con ${altasCount} hallazgo(s) de atención prioritaria. Se recomienda enfocar las gestiones en el control de concentraciones y la agilización del ciclo de pago.`;

  return {
    resumen_ejecutivo,
    observaciones: topObservaciones,
    estrategias,
    alertas,
  };
}

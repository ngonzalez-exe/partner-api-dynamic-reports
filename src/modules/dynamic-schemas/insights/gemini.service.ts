import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  AnalisisIAResult,
  buildFallbackAnalisisIA,
  InsightBloqueLike,
} from './insights-fallback.util';

export { AnalisisIAResult, InsightBloqueLike };

const INSTRUCCIONES_JSON = `
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin bloques de código, solo el JSON puro.
Usa exactamente esta estructura:
{
  "resumen_ejecutivo": "string de 2 a 4 oraciones resumiendo el estado del portafolio, citando los KPIs/gráficos clave que lo sustentan",
  "observaciones": [
    {
      "titulo": "string corto del hallazgo",
      "detalle": "string explicando qué está pasando y en qué elementos específicos",
      "prioridad": "Alta",
      "recomendacion": "string con una acción concreta e inmediata para este hallazgo",
      "origen_datos": "KPI o gráfico exacto del bloque (campo Origen) del que se extrajo el hallazgo",
      "metodologia": "tipo de análisis aplicado en una frase corta (tendencia, concentración, anomalía, brecha, score de incobrabilidad, dominancia de motivo, etc.)",
      "formula": "copia textual del campo Fórmula del bloque, o cadena vacía si el bloque no la trae"
    }
  ],
  "estrategias": [
    "Estrategia inmediata 1 con acción concreta",
    "Estrategia inmediata 2 con acción concreta",
    "Estrategia inmediata 3 con acción concreta"
  ],
  "alertas": [
    "Alerta crítica citando el KPI/gráfico fuente y el dato específico que justifica atención inmediata"
  ]
}
Reglas:
- Las prioridades deben ser exactamente: "Alta", "Media" o "Baja".
- Genera mínimo 3 observaciones, cada una con su recomendacion, origen_datos, metodologia y formula.
- Los campos origen_datos, metodologia y formula son OBLIGATORIOS y deben rellenarse a partir de la sección "Datos estructurados del reporte" (campos Origen y Fórmula). Está prohibido inventarlos: si el bloque no trae fórmula, devuelve "formula": "".
- Genera exactamente 3 estrategias.
- Incluye al menos 1 alerta si los datos lo justifican; si no hay nada crítico, devuelve "alertas": [].
- Menciona nombres concretos (canales, productos, productores, meses, ramos) solo cuando los bloques los provean.
- No inventes cifras, nombres ni periodos que no estén en los datos entregados.`;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly config: ConfigService) {}

  private buildContextoDesdeInsights(insights: InsightBloqueLike[]): string {
    if (!Array.isArray(insights) || insights.length === 0) {
      return 'No se encontraron datos suficientes en el reporte para análisis detallado.';
    }

    return insights
      .map((ins, i) => {
        const partes = [
          `[${i + 1}] Tipo: ${ins.tipo || 'análisis'} | Categoría: ${ins.categoria || 'general'} | Prioridad: ${ins.prioridad || 'Media'}`,
        ];
        if (ins.titulo) partes.push(`    Título: ${ins.titulo}`);
        if (ins.detalle) partes.push(`    Detalle: ${ins.detalle}`);
        if (ins.valor) partes.push(`    Valor clave: ${ins.valor}`);
        partes.push(`    Origen: ${ins.origen_datos || ins.categoria || ins.titulo || 'Reporte'}`);
        if (ins.formula) partes.push(`    Fórmula: ${ins.formula}`);
        if (Array.isArray(ins.top_elementos) && ins.top_elementos.length > 0) {
          const lista = ins.top_elementos
            .map(
              (e) =>
                `${e.nombre} (${e.valor != null ? Number(e.valor).toLocaleString('es-ES') : ''})`,
            )
            .join(', ');
          partes.push(`    Elementos principales: ${lista}`);
        }
        return partes.join('\n');
      })
      .join('\n\n');
  }

  async generateInsights(
    promptBase: string | null,
    insights: InsightBloqueLike[],
    slug = 'RPT_COMISIONES',
  ): Promise<AnalisisIAResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY') || '';
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY no configurada. Activando fallback heurístico determinista.',
      );
      return buildFallbackAnalisisIA(insights, slug);
    }

    if (!promptBase || !promptBase.trim()) {
      this.logger.warn(
        'Sin prompt en esquemas.prompt_contexto_ia. Activando fallback heurístico determinista.',
      );
      return buildFallbackAnalisisIA(insights, slug);
    }

    const model =
      this.config.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
    const contexto = this.buildContextoDesdeInsights(insights);
    const promptCompleto = [
      promptBase,
      '',
      'Datos estructurados del reporte:',
      contexto,
      '',
      INSTRUCCIONES_JSON,
    ].join('\n');

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: promptCompleto,
      });

      const text = (response.text || '').trim();
      const clean = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(clean) as Record<string, unknown>;

      const observaciones = Array.isArray(parsed.observaciones)
        ? (parsed.observaciones as Record<string, unknown>[]).map((o) => ({
            titulo: String(o.titulo || ''),
            detalle: String(o.detalle || ''),
            prioridad: ['Alta', 'Media', 'Baja'].includes(String(o.prioridad))
              ? String(o.prioridad)
              : 'Media',
            recomendacion:
              typeof o.recomendacion === 'string' ? o.recomendacion : '',
            origen_datos:
              typeof o.origen_datos === 'string' ? o.origen_datos : '',
            metodologia:
              typeof o.metodologia === 'string' ? o.metodologia : '',
            formula: typeof o.formula === 'string' ? o.formula : '',
          }))
        : [];

      const resumen_ejecutivo =
        typeof parsed.resumen_ejecutivo === 'string'
          ? parsed.resumen_ejecutivo
          : '';

      const estrategias = Array.isArray(parsed.estrategias)
        ? parsed.estrategias.map(String)
        : [];

      const alertas = Array.isArray(parsed.alertas)
        ? parsed.alertas.map(String)
        : [];

      // Si por alguna razón el LLM devolvió campos vacíos, usar fallback
      if (!resumen_ejecutivo && observaciones.length === 0 && estrategias.length === 0) {
        this.logger.warn('La respuesta de Gemini fue incompleta. Usando fallback.');
        return buildFallbackAnalisisIA(insights, slug);
      }

      return {
        resumen_ejecutivo,
        observaciones,
        estrategias,
        alertas,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error al generar insights con IA: ${message}. Activando fallback heurístico.`);
      return buildFallbackAnalisisIA(insights, slug);
    }
  }
}

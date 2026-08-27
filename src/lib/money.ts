/**
 * Formato de plata del portal — pesos colombianos.
 *
 * El upstream venía con rupias indias por defecto (`₹`) y pintaba dos
 * decimales. En COP eso está mal por partida doble: el peso no usa
 * centavos en la práctica y los miles se separan con punto, no con
 * coma. Una comisión de $100.000 se veía como "₹1000.00".
 *
 * Los montos se guardan en CENTAVOS en la base (amountCents), como en
 * el resto de Amalia, para no arrastrar errores de redondeo.
 */

export const CURRENCY = "COP";
export const CURRENCY_SYMBOL = "$";

/** Centavos → "$100.000" */
export function formatCOP(cents: number | null | undefined): string {
  const pesos = Math.round((Number(cents) || 0) / 100);
  return CURRENCY_SYMBOL + pesos.toLocaleString("es-CO");
}

/** Pesos (no centavos) → "$100.000". Para valores que ya vienen en
 *  pesos, como el "valor estimado" que escribe la afiliada. */
export function formatPesos(pesos: number | null | undefined): string {
  return CURRENCY_SYMBOL + Math.round(Number(pesos) || 0).toLocaleString("es-CO");
}

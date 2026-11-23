/** Monto en pesos chilenos con punto de miles y sin decimales: 54900 → "$54.900". */
export function formatClp(amount: number): string {
  return `$${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Tasa del IVA; misma que `VAT_RATE_PERCENT` de `src/server/taller/rules.ts` (el sitio no importa `src/`). */
export const VAT_RATE_PERCENT = 19;

/** Precio con IVA a partir del neto, con el redondeo de `grossOfNet` de la plataforma: 54900 → 65331. */
export function grossOfNet(net: number): number {
  return net + Math.round((net * VAT_RATE_PERCENT) / 100);
}

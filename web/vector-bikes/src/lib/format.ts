/** Monto en pesos chilenos con punto de miles y sin decimales: 54900 → "$54.900". */
export function formatClp(amount: number): string {
  return `$${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

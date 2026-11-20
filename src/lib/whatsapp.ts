/** `null` cuando no hay número configurado: el botón no se renderiza. */
export function whatsappHref(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length < 8 ? null : `https://wa.me/${digits}`;
}

import { useEffect, useRef } from "preact/hooks";
import { MAX_QUEUED_PHOTOS } from "../../lib/photo-queue.ts";

/** Lo que dice la cola: en Fotos y firma, que las fotos esperan al "Guardar". */
export function queueLabel(count: number, saving: boolean): string {
  if (!saving) return `${count} de ${MAX_QUEUED_PHOTOS}`;
  return count === 1 ? "1 foto lista para guardar" : `${count} fotos listas para guardar`;
}

interface Uploader {
  busy: { current: boolean };
  /** Sube la cola; `true` si no quedó ninguna foto pendiente. */
  uploadAll: (reload?: boolean) => Promise<boolean>;
}

/**
 * Fotos y firma tienen un solo botón "Guardar": al enviar el formulario de la firma, primero se
 * suben las fotos de la cola y recién entonces se envía. Si alguna falla, el formulario no se
 * envía y la foto queda con su error para volver a apretar "Guardar".
 */
export function useSaveWithForm(
  formId: string | undefined,
  pending: () => number,
  upload: Uploader,
): void {
  const latest = useRef({ pending, upload });
  latest.current = { pending, upload };
  useEffect(() => {
    if (!formId) return;
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const onSubmit = (event: Event) => {
      const current = latest.current;
      if (!current.upload.busy.current && current.pending() === 0) return;
      event.preventDefault();
      if (current.upload.busy.current) return;
      void current.upload.uploadAll(false).then((ok) => {
        // `submit()` no vuelve a disparar este evento: la validación del formulario ya pasó.
        if (ok) form.submit();
      });
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formId]);
}

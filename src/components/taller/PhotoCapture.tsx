import { useEffect, useRef, useState } from "preact/hooks";
import {
  addToQueue,
  afterUpload,
  MAX_QUEUED_PHOTOS,
  removeFromQueue,
} from "../../lib/photo-queue.ts";
import type { QueuedPhoto, UploadOutcome } from "../../lib/photo-queue.ts";
import CameraCapture from "./CameraCapture.tsx";
import PhotoPicker from "./PhotoPicker.tsx";
import { queueLabel, useSaveWithForm } from "./save-with-form.ts";

interface Props {
  uploadUrl: string;
  stage: "recepcion" | "reparacion" | "terminado";
  label?: string;
  /** Id del formulario cuyo "Guardar" sube antes las fotos (Fotos y firma). Sin él, se suben solas. */
  saveWith?: string;
}

const UPLOAD_ERROR = "No se pudo subir la foto. Intenta de nuevo.";
const touchStyle = { minHeight: "48px", minWidth: "48px" };

// Sin mensaje, el aviso no dibuja el borde ni el relleno que le da taller-components.css.
const emptyStatusStyle = { padding: 0, border: "none", background: "none", margin: 0 };

function uploadPhoto(
  url: string,
  stage: Props["stage"],
  file: File,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append("foto", file);
    form.append("etapa", stage);
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };
    request.onload = () => {
      if (request.status === 201) return resolve();
      reject(
        new Error(
          request.status === 413
            ? "La foto pesa más de 15 MB"
            : request.status === 415
              ? "Ese archivo no es una foto"
              : UPLOAD_ERROR,
        ),
      );
    };
    request.onerror = request.onabort = request.ontimeout = () => reject(new Error(UPLOAD_ERROR));
    request.send(form);
  });
}

async function shrinkPhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap | undefined;
  try {
    if (typeof createImageBitmap !== "function") return file;
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

function usePendingWarning(pending: boolean) {
  const warning = useRef((event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  });
  const clearWarning = () => window.removeEventListener("beforeunload", warning.current);
  useEffect(() => {
    if (pending) window.addEventListener("beforeunload", warning.current);
    return clearWarning;
  }, [pending]);
  return clearWarning;
}

function usePhotoQueue() {
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const current = useRef<QueuedPhoto[]>([]);
  const previews = useRef(new Map<string, string>());
  const clearWarning = usePendingWarning(queue.length > 0);
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function replaceQueue(next: QueuedPhoto[]) {
    const ids = new Set(next.map((photo) => photo.id));
    for (const [id, url] of previews.current) {
      if (ids.has(id)) continue;
      URL.revokeObjectURL(url);
      previews.current.delete(id);
    }
    for (const photo of next) {
      if (!previews.current.has(photo.id)) {
        previews.current.set(photo.id, URL.createObjectURL(photo.file));
      }
    }
    if (next.length === 0) clearWarning();
    current.current = next;
    setQueue(next);
  }

  return { queue, current, previews: previews.current, replaceQueue };
}

type PhotoQueue = ReturnType<typeof usePhotoQueue>;

async function uploadQueuedPhoto(
  photo: QueuedPhoto,
  props: Props,
  onProgress: (value: number) => void,
): Promise<UploadOutcome> {
  try {
    const file = await shrinkPhoto(photo.file);
    await uploadPhoto(props.uploadUrl, props.stage, file, onProgress);
    return { id: photo.id, ok: true };
  } catch (error) {
    return {
      id: photo.id,
      ok: false,
      error: error instanceof Error ? error.message : UPLOAD_ERROR,
    };
  }
}

function usePhotoUpload(props: Props, photos: PhotoQueue) {
  const busy = useRef(false);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    mounted.current = true;
    setReady(true);
    return () => {
      mounted.current = false;
    };
  }, []);

  async function uploadAll(reload = true): Promise<boolean> {
    const batch = photos.current.current;
    if (busy.current) return false;
    if (batch.length === 0) return true;
    busy.current = true;
    setUploading(true);
    setProgress(0);
    const outcomes: UploadOutcome[] = [];
    for (const [index, photo] of batch.entries()) {
      if (!mounted.current) return false;
      setMessage(`Subiendo ${index + 1} de ${batch.length}`);
      const outcome = await uploadQueuedPhoto(photo, props, (value) => {
        if (mounted.current) setProgress((index * 100 + value) / batch.length);
      });
      outcomes.push(outcome);
      if (mounted.current) setProgress(((index + 1) / batch.length) * 100);
    }
    if (!mounted.current) return false;
    const remaining = afterUpload(batch, outcomes);
    photos.replaceQueue(remaining);
    busy.current = false;
    setUploading(false);
    if (remaining.length > 0) {
      setMessage(`Quedan ${remaining.length} fotos sin subir. Revisa los errores y reintenta.`);
      return false;
    }
    if (reload) window.location.reload();
    else setMessage("Fotos subidas. Guardando…");
    return true;
  }

  return { ready, uploading, busy, progress, message, setMessage, setProgress, uploadAll };
}

type PhotoUpload = ReturnType<typeof usePhotoUpload>;

/**
 * Lo elegido en la galería o con "Tomar foto" se sube de inmediato (`auto`): no hay paso que
 * olvidar. En Fotos y firma espera al "Guardar" del formulario.
 */
function selectFiles(event: Event, photos: PhotoQueue, upload: PhotoUpload, auto: boolean) {
  const input = event.currentTarget as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (queueFiles(files, photos, upload) && auto) void upload.uploadAll();
}

/** Agrega a la cola; devuelve si entró al menos una foto. */
function queueFiles(files: File[], photos: PhotoQueue, upload: PhotoUpload): boolean {
  if (upload.busy.current || files.length === 0) return false;
  const before = photos.current.current.length;
  const result = addToQueue(photos.current.current, files);
  photos.replaceQueue(result.queue);
  upload.setProgress(0);
  upload.setMessage(result.rejected.join(". "));
  return result.queue.length > before;
}

interface QueueViewProps {
  photos: PhotoQueue;
  upload: PhotoUpload;
}

interface ThumbnailProps extends QueueViewProps {
  photo: QueuedPhoto;
  index: number;
}

/** "Foto 1", "Foto 2"…: el nombre del archivo (`foto-<uuid>.jpg`) no le dice nada a quien recibe. */
function PhotoPreview({ photo, index, photos }: Omit<ThumbnailProps, "upload">) {
  return (
    <>
      <img
        src={photos.previews.get(photo.id)}
        alt={`Foto ${index + 1}`}
        width={120}
        height={120}
        style={{
          width: "100%",
          height: "120px",
          objectFit: "cover",
          border: "1px solid var(--rule)",
        }}
      />
      <span>Foto {index + 1}</span>
    </>
  );
}

function PhotoThumbnail({ photo, index, photos, upload }: ThumbnailProps) {
  return (
    <li style={{ display: "grid", gap: "8px", minWidth: 0, alignContent: "start" }}>
      <PhotoPreview photo={photo} index={index} photos={photos} />
      {photo.error && <p>Error: {photo.error}</p>}
      <button
        type="button"
        class="btn ghost"
        style={touchStyle}
        aria-label={`Quitar foto ${index + 1}`}
        disabled={upload.uploading}
        onClick={() => {
          if (upload.busy.current) return;
          photos.replaceQueue(removeFromQueue(photos.current.current, photo.id));
          upload.setProgress(0);
          upload.setMessage("");
        }}
      >
        Quitar
      </button>
    </li>
  );
}

function PhotoList({ photos, upload }: QueueViewProps) {
  return (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: "8px",
        listStyle: "none",
        padding: 0,
        margin: 0,
      }}
    >
      {photos.queue.map((photo, index) => (
        <PhotoThumbnail
          key={photo.id}
          photo={photo}
          index={index}
          photos={photos}
          upload={upload}
        />
      ))}
    </ul>
  );
}

function PhotoControls({
  photos,
  upload,
  label,
  auto,
}: QueueViewProps & { label?: string; auto: boolean }) {
  const disabled = !upload.ready || upload.uploading || photos.queue.length >= MAX_QUEUED_PHOTOS;
  const onChange = (event: Event) => selectFiles(event, photos, upload, auto);
  return (
    <>
      <CameraCapture
        onCapture={(files) => {
          queueFiles(files, photos, upload);
        }}
        // "Listo" sube todo lo sacado: en el iPhone, Safari no avisa si la página se va sin subir.
        onDone={auto ? () => void upload.uploadAll() : undefined}
        queued={photos.queue.length}
        max={MAX_QUEUED_PHOTOS}
        disabled={disabled}
        // En Fotos y firma hay dos botones: la cámara y la galería (que en el iPhone también saca).
        openLabel={auto ? undefined : "Sacar fotos"}
        fallbackHint={auto ? undefined : "Usa Elegir de la galería."}
      />
      {auto && (
        <PhotoPicker label={label ?? "Tomar foto"} camera disabled={disabled} onChange={onChange} />
      )}
      <PhotoPicker label="Elegir de la galería" disabled={disabled} onChange={onChange} />
    </>
  );
}

function UploadButton({ photos, upload }: QueueViewProps) {
  const retry = photos.queue.some((photo) => photo.error !== null);
  return (
    <button
      type="button"
      class="btn tap"
      style={touchStyle}
      disabled={!upload.ready || upload.uploading || photos.queue.length === 0}
      onClick={() => void upload.uploadAll()}
    >
      {retry ? "Reintentar" : `Subir ${photos.queue.length} fotos`}
    </button>
  );
}

export default function PhotoCapture(props: Props) {
  const photos = usePhotoQueue();
  const upload = usePhotoUpload(props, photos);
  const saving = Boolean(props.saveWith);
  useSaveWithForm(props.saveWith, () => photos.current.current.length, upload);
  const full = photos.queue.length >= MAX_QUEUED_PHOTOS;
  const message = `${upload.message}${full ? ` Máximo ${MAX_QUEUED_PHOTOS} fotos por vez` : ""}`;
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <PhotoControls photos={photos} upload={upload} label={props.label} auto={!saving} />
      {photos.queue.length > 0 ? (
        <>
          <p>{queueLabel(photos.queue.length, saving)}</p>
          <PhotoList photos={photos} upload={upload} />
          {!saving && <UploadButton photos={photos} upload={upload} />}
          <progress max={100} value={upload.progress} aria-label="Progreso de la foto" />
        </>
      ) : null}
      {/* La región viva queda montada siempre para que el lector de pantalla anuncie lo que
          aparece en ella; sin mensaje no dibuja su caja. */}
      <p role="status" aria-live="polite" style={message === "" ? emptyStatusStyle : undefined}>
        {message}
      </p>
    </div>
  );
}

const touchStyle = { minHeight: "48px", minWidth: "48px" };

interface PickerProps {
  label: string;
  camera?: boolean;
  disabled: boolean;
  onChange: (event: Event) => void;
}

/** Selector de archivos con aspecto de botón: la galería o, con `camera`, la cámara del sistema. */
export default function PhotoPicker({ label, camera, disabled, onChange }: PickerProps) {
  return (
    <label
      class="btn ghost"
      style={{ ...touchStyle, position: "relative" }}
      aria-disabled={disabled}
    >
      {label}
      <input
        type="file"
        aria-label={label}
        accept="image/*"
        capture={camera ? "environment" : undefined}
        multiple
        disabled={disabled}
        onChange={onChange}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0 }}
      />
    </label>
  );
}

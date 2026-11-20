import type { RefObject } from "preact";
import type { Dispatch } from "preact/hooks";
import { useEffect, useMemo, useReducer, useRef } from "preact/hooks";
import { BookingFields, FIELD_IDS } from "./BookingFields.tsx";
import { BLOCK_FIELDSET_ID, BlockFieldset, DayFieldset, ModeFieldset } from "./BookingSchedule.tsx";
import { BookingTicket } from "./BookingTicket.tsx";
import { useTurnstile } from "./turnstile.ts";
import type {
  Action,
  ApiDay,
  BookingResult,
  FormErrors,
  IslandShop,
  Mode,
  State,
} from "./booking-state.ts";
import {
  ShopContext,
  bookingReducer,
  firstErrorTarget,
  formErrorsFrom,
  initialState,
  parseResponseBody,
  phoneE164,
  selectedBlocks,
  validateForm,
} from "./booking-state.ts";

const TIMEZONE = "America/Santiago";
type BookingDispatch = Dispatch<Action>;
type SubmitContext = {
  state: State;
  shop: IslandShop;
  dispatch: BookingDispatch;
  turnstile: ReturnType<typeof useTurnstile>;
  formRef: RefObject<HTMLFormElement>;
};

function todayInSantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

async function loadAvailability(
  mode: Mode,
  shop: IslandShop,
  dispatch: BookingDispatch,
): Promise<void> {
  dispatch({ type: "loadStart" });
  try {
    const response = await fetch(
      `/api/disponibilidad?desde=${todayInSantiago()}&dias=${shop.horizonDays}&modo=${mode}&taller=${encodeURIComponent(shop.slug)}`,
    );
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const payload = (await response.json()) as { days: ApiDay[]; capacity: number };
    dispatch({ type: "loadSuccess", days: payload.days, capacity: payload.capacity });
  } catch {
    dispatch({ type: "loadError" });
  }
}

/** Foco y desplazamiento al primer error; el bloque lleva a la regla de horarios. */
function revealFirstError(errors: FormErrors, form: HTMLFormElement | null): void {
  const target = firstErrorTarget(errors);
  if (target === null || form === null) return;
  let focusOn: HTMLElement | null;
  let scrollTo: HTMLElement | null;
  if (target === "bloque") {
    const fieldset = form.querySelector<HTMLElement>(`#${BLOCK_FIELDSET_ID}`);
    scrollTo = fieldset?.querySelector<HTMLElement>(".ruler-box") ?? fieldset;
    focusOn = fieldset?.querySelector<HTMLElement>('.slot:not([aria-disabled="true"])') ?? fieldset;
  } else {
    focusOn = form.querySelector<HTMLElement>(`#${FIELD_IDS[target]}`);
    scrollTo = focusOn;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  focusOn?.focus({ preventScroll: true });
  scrollTo?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

function requestBody(state: State, turnstileToken: string, shop: IslandShop): string {
  return JSON.stringify({
    taller: shop.slug,
    mode: state.mode,
    service_date: state.selectedDate,
    start: state.selectedStart,
    nombre: state.form.nombre.trim(),
    telefono: phoneE164(state.form.telefono) ?? state.form.telefono,
    correo: state.form.correo.trim(),
    bicicleta: state.form.bicicleta.trim(),
    descripcion: state.form.descripcion.trim(),
    ...(state.mode === "retiro"
      ? { comuna: state.form.comuna, direccion: state.form.direccion.trim() }
      : {}),
    consentimiento: state.form.consentimiento,
    whatsapp_consentimiento: state.form.whatsappConsent,
    turnstile_token: turnstileToken,
  });
}

async function postBooking(context: SubmitContext, token: string): Promise<void> {
  const { state, shop, dispatch, turnstile, formRef } = context;
  try {
    const response = await fetch("/api/reservas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody(state, token, shop),
    });
    // El estado HTTP sigue eligiendo el mensaje si un proxy devuelve HTML o un cuerpo vacío.
    const body = parseResponseBody(await response.text());
    if (response.status === 201 && body.code) {
      dispatch({ type: "submitSuccess", result: body as BookingResult });
      return;
    }
    dispatch({ type: "submitFailed", status: response.status, body });
    turnstile.reset();
    if (response.status === 422)
      revealFirstError(formErrorsFrom(body.fields ?? {}), formRef.current);
    if (response.status === 409) void loadAvailability(state.mode, shop, dispatch);
  } catch {
    dispatch({ type: "submitFailed", status: 0, body: {} });
    turnstile.reset();
  }
}

async function submit(event: Event, context: SubmitContext): Promise<void> {
  event.preventDefault();
  const { state, shop, dispatch, turnstile, formRef } = context;
  const errors = validateForm(state, shop);
  if (Object.keys(errors).length > 0) {
    dispatch({
      type: "submitFailed",
      status: 422,
      body: { fields: errors as Record<string, string> },
    });
    revealFirstError(errors, formRef.current);
    return;
  }
  // Sin widget o sin token no se envía: el servidor respondería 403 de todos modos.
  const token = state.turnstileToken ?? turnstile.token();
  if (turnstile.enabled && token === null) {
    dispatch({ type: "turnstileUnavailable" });
    return;
  }
  dispatch({ type: "submitStart" });
  await postBooking(context, token ?? "");
}

type StageProps = {
  state: State;
  dispatch: BookingDispatch;
  shop: IslandShop;
  today: string;
  chosen: string[];
  turnstileRef: RefObject<HTMLDivElement>;
};

function BookingStage({ state, dispatch, shop, today, chosen, turnstileRef }: StageProps) {
  const days = state.availability.status === "ready" ? state.availability.days : [];
  const day = days.find((item) => item.date === state.selectedDate);
  const isPickup = state.mode === "retiro";
  return (
    <div class="stage">
      <ModeFieldset mode={state.mode} onMode={(mode) => dispatch({ type: "setMode", mode })} />
      <DayFieldset
        availability={state.availability}
        days={days}
        selectedDate={state.selectedDate}
        today={today}
        onPick={(date) => dispatch({ type: "selectDate", date })}
        onRetry={() => void loadAvailability(state.mode, shop, dispatch)}
      />
      <BlockFieldset
        day={day}
        chosen={chosen}
        isPickup={isPickup}
        error={state.errors.bloque}
        onPick={(start) => dispatch({ type: "selectStart", start })}
      />
      <BookingFields
        form={state.form}
        errors={state.errors}
        isPickup={isPickup}
        turnstileRef={turnstileRef}
        onField={(field, value) => dispatch({ type: "setField", field, value })}
      />
    </div>
  );
}

export default function BookingIsland({ siteKey, shop }: { siteKey: string; shop: IslandShop }) {
  const [state, dispatch] = useReducer(bookingReducer, initialState);
  const today = useMemo(todayInSantiago, []);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstile = useTurnstile(
    siteKey,
    turnstileRef,
    (token) => dispatch({ type: "setTurnstile", token }),
    shop.slug,
  );
  const chosen = selectedBlocks(state, shop);
  useEffect(() => {
    void loadAvailability(state.mode, shop, dispatch);
  }, [state.mode, shop]);
  return (
    <ShopContext.Provider value={shop}>
      <form
        class="booking"
        id="booking"
        novalidate
        ref={formRef}
        onSubmit={(event) => submit(event, { state, shop, dispatch, turnstile, formRef })}
      >
        <BookingStage
          state={state}
          dispatch={dispatch}
          shop={shop}
          today={today}
          chosen={chosen}
          turnstileRef={turnstileRef}
        />
        <BookingTicket state={state} chosen={chosen} isPickup={state.mode === "retiro"} />
      </form>
    </ShopContext.Provider>
  );
}

import type { IslandShop, State } from "./booking-state.ts";
import { ShopContext, formatClp, ticketCode, timeRange } from "./booking-state.ts";

type TicketProps = { state: State; chosen: string[]; isPickup: boolean };

function ticketHead(state: State, shop: IslandShop | null | undefined) {
  return (
    <div class="ticket-head">
      <span class="label">Orden de reserva</span>
      <span class="mono" style="font-size:.8rem">
        {shop && state.selectedDate && state.selectedStart
          ? ticketCode(state.selectedDate, state.selectedStart, shop)
          : `${shop?.codePrefix ?? ""}-——`}
      </span>
    </div>
  );
}

function ticketDetails({ state, chosen, isPickup }: TicketProps, shop?: IslandShop | null) {
  return (
    <dl class="ticket-body">
      <div class="row">
        <dt>Modalidad</dt>
        <dd>{isPickup ? "Retiro y devolución" : "La dejo en el taller"}</dd>
      </div>
      <div class="row">
        <dt>Día</dt>
        <dd>{state.selectedDate ?? "—"}</dd>
      </div>
      <div class="row">
        <dt>Hora</dt>
        <dd class="mono">{timeRange(chosen, shop) ?? "Elige un bloque"}</dd>
      </div>
      <div class="row">
        <dt>Pago</dt>
        <dd>Efectivo, transferencia o tarjeta, al recibir tu bici</dd>
      </div>
    </dl>
  );
}

function ticketFoot(state: State) {
  return (
    <div class="ticket-foot">
      {state.submit.message && (
        <p class="err" role="alert">
          {state.submit.message}
        </p>
      )}
      <button type="submit" class="btn" id="submit" disabled={state.submit.status === "submitting"}>
        {state.submit.status === "submitting" ? "Confirmando…" : "Confirmar reserva"}
      </button>
      <p>
        El diagnóstico y los repuestos se cotizan en el taller. Si hay un trabajo extra, te llamamos
        antes.
      </p>
    </div>
  );
}

/** Preact entrega ShopContext como segundo argumento; la boleta sigue siendo una función pura. */
export function BookingTicket(props: TicketProps, shop?: IslandShop | null) {
  const { state, isPickup } = props;
  const done = state.submit.status === "success" && state.result !== null;
  return (
    <aside class="ticket" aria-live="polite">
      {ticketHead(state, shop)}
      {ticketDetails(props, shop)}
      <div class="ticket-total">
        <span class="label">Recargo</span>
        <strong>{formatClp(isPickup ? (shop?.pickupFeeClp ?? 0) : 0)}</strong>
      </div>
      {!done && ticketFoot(state)}
      {done && state.result && (
        <div class="done">
          <span class="label">Reserva confirmada</span>
          <strong>{state.result.code}</strong>
          <p>Te enviamos la confirmación a {state.form.correo}.</p>
          <p>Si necesitas cancelar, usa el enlace del correo.</p>
        </div>
      )}
    </aside>
  );
}

BookingTicket.contextType = ShopContext;

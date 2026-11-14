# F2-14 · Send the breakdown in reception, ready and quote emails

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Conectar el desglose a los envíos reales: notifyReceived (reception.ts), notifyReadyForPickup (qc.ts) y sendQuote (quotes.ts) pasan el régimen y los montos de la orden a las plantillas que F2-13 ya preparó. Los correos siguen saliendo después del commit (regla de código 6); un fallo de correo nunca cambia el resultado de la operación. Con órdenes 'final', los correos enviados quedan idénticos y las pruebas existentes de notificaciones no cambian.

Es la tarea `E2-T6` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T6` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/reception.ts`
- `src/server/taller/qc.ts`
- `src/server/taller/quotes.ts`
- `tests/integration/pricing-notifications.test.ts`

## Criterios de aceptación

1. WHEN se finaliza la recepción de una orden `neto` con líneas por 10.000 THE SYSTEM SHALL enviar `Recibimos tu bicicleta` con `IVA (19%)` `$1.900` y `Total cotizado` `$11.900`
2. WHEN el control de calidad aprueba una orden `neto` de neto 10.000 THE SYSTEM SHALL enviar `Lista para retirar` con `Neto`, `IVA (19%)` y `Total` `$11.900`
3. WHEN `sendQuote` corre sobre una orden `neto` de neto 10.000 THE SYSTEM SHALL enviar neto, IVA y total, y registrar `notify.quote_sent` con `totalClp` 11900
4. WHEN las mismas acciones corren sobre una orden `final` THE SYSTEM SHALL enviar correos sin `IVA (19%)`, con `received-notification.test.ts`, `ready-notification.test.ts` y `quotes.test.ts` sin cambios

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/pricing-notifications.test.ts tests/integration/received-notification.test.ts tests/integration/ready-notification.test.ts tests/integration/quotes.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/reception.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.

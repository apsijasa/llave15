# F2-13 · Render net and VAT rows in order emails

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Correos de la orden: agregar las filas Neto / IVA (19%) / Total al renderizado de correos cuando la orden es 'neto'. Con 'final' o sin régimen, el HTML y el texto de cada correo deben ser byte a byte iguales a los de hoy: las pruebas existentes de correos (received-email, ready-email, quote-email, rescheduled-email y las demás) no se tocan y deben seguir pasando. Las plantillas nuevas van en order-templates.ts (templates.ts está cerca de 400 líneas). Ningún asunto ni texto con el nombre del taller escrito a mano: SITE.name.

Es la tarea `E2-T5` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T5` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/email/amounts.ts`
- `src/server/email/templates.ts`
- `src/server/email/order-templates.ts`
- `tests/unit/pricing-emails.test.ts`

## Criterios de aceptación

1. WHEN `receivedBikeEmail` recibe líneas por 10.000 y `pricingMode: neto` THE SYSTEM SHALL incluir en `text` y en `html` las filas `Neto` `$10.000`, `IVA (19%)` `$1.900` y `Total cotizado` `$11.900`
2. WHEN `readyForPickupEmail` recibe una orden `neto` con neto 10.000, IVA 1.900, total 11.900 y abonado 5.000 THE SYSTEM SHALL mostrar `Neto`, `IVA (19%)`, `Total` `$11.900`, `Abonado` `$5.000` y `Saldo` `$6.900`
3. WHEN `quoteEmail` recibe `pricingMode: neto` THE SYSTEM SHALL mostrar neto, IVA y `Total` con IVA, y `quoteTotalClp(items, 'neto')` SHALL devolver 11900 para 10.000 netos
4. WHEN las tres plantillas reciben `final` o no reciben régimen THE SYSTEM SHALL producir `subject`, `html` y `text` idénticos a los de hoy
5. WHEN se cuentan las líneas de `src/server/email/templates.ts` THE SYSTEM SHALL tener menos de 400

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/unit/pricing-emails.test.ts tests/unit/received-email.test.ts tests/unit/ready-email.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/email/templates.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.

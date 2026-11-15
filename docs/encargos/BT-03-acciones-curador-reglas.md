# BT-03 · Acciones de la biblioteca, `canCurate` y `rules.ts`

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Tercer paso de la fase Biblioteca (decisión BT-D2: el administrador central es un usuario con la marca `users.library_curator`, creada en BT-01, con rol `owner` o `admin`; BT-D7 autoriza editar `tests/unit/permissions.test.ts` para pasar de 36 a 40 acciones). Se agregan las acciones `library.view`, `library.ai`, `library.propose` (cuatro roles) y `library.curate` (`owner`, `admin`), `SessionUser.libraryCurator`, el módulo `src/server/library/access.ts` con `canCurate`/`canUseLibrary`, y `src/server/library/rules.ts` con todas las constantes y etiquetas del módulo (categorías, estados de validación, relaciones de compatibilidad, estados y transiciones de propuesta, niveles de confianza, tipos de especificación, cuotas de IA).

Es la tarea `E1-T3` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta es el bloque `E1-T3` de `blueprints/vector-biblioteca/epics/01-fundacion.md`: léelo completo junto con las **reglas transversales**.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md` (aplica a `src/server/auth/**`); `src/server/auth/permissions.ts`; `src/server/auth/admin-auth.ts`; `src/server/taller/rules.ts` (patrón de constantes `as const` + `Record` de etiquetas + `satisfies`); `tests/unit/permissions.test.ts`; `tests/integration/admin-auth.test.ts` (patrón de login con PGlite).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero.** Sin commit, tag ni push. Sandbox sin red: corre `pnpm format`, `pnpm check`, los tres tests del Verify, `pnpm test` y `pnpm build`.

## Archivos (siete, declarados en el bloque)

- `src/server/auth/permissions.ts`
- `src/server/auth/admin-auth.ts`
- `src/server/library/rules.ts` (nuevo)
- `src/server/library/access.ts` (nuevo)
- `tests/unit/permissions.test.ts` (edición autorizada: agregar las cuatro acciones a `expected` y cambiar 36 → 40)
- `tests/unit/library-rules.test.ts` (nuevo)
- `tests/integration/library-access.test.ts` (nuevo)

## Criterios de aceptación

1. WHEN se lee `permissions.ts` THE SYSTEM SHALL exponer 40 acciones; `library.view`, `library.ai`, `library.propose` para `ROLES`; `library.curate` para `administrators`.
2. WHEN `requireAdmin` resuelve una sesión THE SYSTEM SHALL devolver `libraryCurator` leído de `users.library_curator`; el campo es **opcional** en el tipo `SessionUser` (`libraryCurator?: boolean`) para no romper los objetos literales de las pruebas existentes.
3. WHEN `canCurate` recibe un `owner` con la marca THE SYSTEM SHALL devolver `true`; sin la marca, `false`; un `mechanic` con la marca, `false`. `canUseLibrary` devuelve `true` para los cuatro roles.
4. WHEN se lee `rules.ts` THE SYSTEM SHALL exportar exactamente las constantes del bloque E1-T3 con sus etiquetas en español, `PROPOSAL_TRANSITIONS` con los ocho estados e `isProposalTransition`.
5. WHEN corren las pruebas del Verify THE SYSTEM SHALL pasar; ninguna otra prueba existente cambia.

## No cambiar

- Firmas exportadas existentes de `admin-auth.ts` y `permissions.ts` (solo se agregan acciones y un campo opcional).
- Ningún archivo de esquema ni `drizzle/`.
- Ninguna prueba existente salvo `tests/unit/permissions.test.ts` en lo autorizado.
- `rules.ts` de la biblioteca no importa nada de `src/server/taller/**` ni de la base.
- Importaciones relativas con `.ts`; `import type`; sin `enum`; nombre del taller nunca literal.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/unit/permissions.test.ts tests/unit/library-rules.test.ts tests/integration/library-access.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas, resultado de `format`, `check`, `test` y `build`, desviaciones con motivo.

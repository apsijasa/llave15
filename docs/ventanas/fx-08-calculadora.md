# FX-08 — Calculadora de costos

Esta ventana agrega la tabla `cost_profiles` (migración `0047`). El cambio es aditivo: no hay datos que migrar ni script de datos que correr. Cada taller guarda su perfil desde `/taller/calculadora`, con un usuario que tenga `costs.view`.

Replit lleva a producción el esquema de la **base del workspace**, así que antes de publicar hay que migrarla. En el Shell de Replit, un comando a la vez:

```bash
git fetch origin
git reset --hard origin/main
git log --oneline -1
corepack pnpm@12.4.2 install --frozen-lockfile
corepack pnpm@12.4.2 db:migrate
corepack pnpm@12.4.2 db:check
rm -rf node_modules
```

Después, **Deployments → Republish**. Los cambios de esquema que muestre deben ser solo agregados (la tabla `cost_profiles`). Si propone borrar algo, no se publica.

La calculadora solo sugiere precios; no cambia precios del inventario ni del catálogo.

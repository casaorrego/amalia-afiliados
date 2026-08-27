# Portal de afiliadas de Amalia

Fork de [Refferq](https://github.com/Refferq/Refferq) (MIT) auto-hospedado
en `afiliados.somosamalia.com`. Sirve para las **afiliadas externas**
(influencers, nutricionistas, quien no es paciente): tienen su propio
login, ven sus referidas y sus comisiones.

Los **referidos entre pacientes** NO pasan por acá — viven en
`profiles.referral_code` de la base de Amalia y se ven en la app.

## Qué se cambió respecto al upstream

- **Correo por Loops, no por Resend.** Amalia ya manda todo su correo
  transaccional por Loops; tener dos proveedores era un dominio más que
  verificar y otra factura. El código de acceso del login sale de
  `src/lib/loops.ts` (espejo del de amalia-app).
- El resto de correos del portal (notificaciones de referida nueva,
  etc.) quedan silenciados si no hay proveedor: registran en consola y
  siguen. No son críticos.

## Variables de entorno (Vercel)

Solo tres, y las tres son secretas o propias de la instancia:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Conexión de Supabase tal cual (session pooler) |
| `JWT_SECRET` | Mínimo 32 caracteres. `openssl rand -base64 32` |
| `LOOPS_API_KEY` | API key de Loops — **sin esto nadie puede entrar** |

Todo lo demás va quemado en `src/lib/config.ts`, porque no son secretos
y no cambian entre despliegues: el dominio del portal y el schema de
Postgres. Mismo criterio que en los triggers de amalia-app.

⚠️ Las 28 tablas del portal viven en el schema `refferq`, aisladas de la
base de pacientes. **No hace falta poner `?schema=refferq` en la URL**:
`src/lib/prisma.ts` lo impone sobre la connection string, justamente
para que no dependa de que nadie lo olvide al pegar la variable.

## Correo en Loops

Crear un transactional llamado **exactamente** `afiliados_codigo_acceso`
con dos variables:

- `codigo` — el código de 6 dígitos
- `nombre` — nombre de quien entra

Se resuelve por nombre (no por id), así que no hace falta una variable
de entorno con el id: basta con que el nombre coincida.

## Puesta en marcha

1. En Supabase: `create schema if not exists refferq;`
2. Crear las 28 tablas con **`npm run db:push`** — nunca
   `npx prisma db push` a pelo.

   El CLI de Prisma lee `DATABASE_URL` cruda y se salta el forzado de
   schema que hace `src/lib/prisma.ts`. Una URL sin `?schema` apuntaría
   a `public`, que es donde viven las historias clínicas. El wrapper
   `scripts/db-push.mjs` impone el schema, aborta si la URL trae el
   marcador `[YOUR-PASSWORD]` sin reemplazar, y corre Prisma SIN
   `--accept-data-loss` para que cualquier operación destructiva falle
   en vez de ejecutarse.
3. Proyecto en Vercel con las variables de arriba.
4. DNS: `CNAME afiliados → cname.vercel-dns.com`
5. Registrarse en `/register`. **Ojo:** el portal bloquea a propósito
   que alguien se auto-registre como admin, así que queda como
   afiliada. Para volverse admin:
   ```sql
   update refferq."User" set role = 'ADMIN' where email = 'TU_CORREO';
   ```
6. Ya adentro: generar la API key (Admin → API keys) y definir la regla
   de comisión (Admin → Program settings).

## Conexión con el resto de Amalia

**Los códigos de afiliadas se validan desde el marketing** por una vista
de solo lectura sobre este schema:

```sql
create or replace view public.affiliate_codes as
  select a."referralCode" as code
  from refferq."Affiliate" a
  join refferq."User" u on u.id = a."userId"
  where u.status = 'ACTIVE';
```

**Las conversiones entran por API.** Cuando una referida llega a su
segundo pago, amalia-app hace:

```
POST https://afiliados.somosamalia.com/api/track/conversion
X-API-Key: <la API key del portal>

{ "referralCode": "...", "customerEmail": "...",
  "amount": 100000, "currency": "COP", "orderId": "..." }
```

Ojo: `amount` va en **pesos**, no en centavos. Esa API key va como
`AFILIADOS_API_KEY` en los Vercel de amalia-app y del marketing.

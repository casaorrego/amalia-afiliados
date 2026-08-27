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

| Variable | Valor | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Conexión de Supabase **con `?schema=refferq`** (usar el *session pooler* y `sslmode=require`) | Sí |
| `JWT_SECRET` | Mínimo 32 caracteres. Generar con `openssl rand -base64 32` | Sí |
| `LOOPS_API_KEY` | API key de Loops | Sí — **sin esto nadie puede entrar** |
| `NEXT_PUBLIC_APP_URL` | `https://afiliados.somosamalia.com` | Sí |
| `ADMIN_EMAILS` | Correos que reciben avisos de referida nueva | No |

⚠️ El `?schema=refferq` es lo que mantiene las 28 tablas del portal
aisladas de `public`. Sin ese parámetro, Prisma las crea encima de la
base de pacientes.

## Correo en Loops

Crear un transactional llamado **exactamente** `afiliados_codigo_acceso`
con dos variables:

- `codigo` — el código de 6 dígitos
- `nombre` — nombre de quien entra

Se resuelve por nombre (no por id), así que no hace falta una variable
de entorno con el id: basta con que el nombre coincida.

## Puesta en marcha

1. En Supabase: `create schema if not exists refferq;`
2. `npx prisma db push` con el `DATABASE_URL` apuntando a ese schema —
   crea las 28 tablas.
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

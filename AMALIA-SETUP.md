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

Solo tres:

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | **La pone Vercel sola** al crear la base (Storage → Neon) |
| `JWT_SECRET` | Mínimo 32 caracteres. `openssl rand -base64 32` |
| `LOOPS_API_KEY` | API key de Loops — **sin esto nadie puede entrar** |

Todo lo demás va quemado en `src/lib/config.ts`, porque no son secretos
y no cambian entre despliegues.

## Por qué el portal tiene su PROPIA base de datos

Al principio se intentó montarlo dentro de la base de Supabase de Amalia
(en un schema aparte). Se descartó por dos razones:

1. **No conectaba.** El host de Supabase de Amalia es solo IPv6 y las
   funciones de Vercel solo salen por IPv4. El pooler de Supabase, que
   sería la salida, no tiene registrado ese proyecto.
2. **Seguridad.** Compartir base significaba que una vulnerabilidad en
   este portal (código de terceros) tuviera una conexión hacia donde
   viven las historias clínicas. Con base aparte no hay permisos que
   limitar: sencillamente no hay ruta.

El precio es que las dos partes se hablan por HTTPS en vez de compartir
tablas. Son solo dos llamadas, ambas con la misma `X-API-Key`.

## Correo en Loops

Crear un transactional llamado **exactamente** `afiliados_codigo_acceso`
con dos variables:

- `codigo` — el código de 6 dígitos
- `nombre` — nombre de quien entra

Se resuelve por nombre (no por id), así que no hace falta una variable
de entorno con el id: basta con que el nombre coincida.

## Conexión con el resto de Amalia

**Validación de códigos.** Cuando una paciente escribe un código de
afiliada en el paywall, el marketing pregunta acá:

```
GET https://afiliados.somosamalia.com/api/track/validate?code=XXXX
X-API-Key: <la API key del portal>

→ { "valid": true|false }
```

**Conversiones.** Cuando esa referida llega a su segundo pago aprobado,
amalia-app reporta la venta:

```
POST https://afiliados.somosamalia.com/api/track/conversion
X-API-Key: <la API key del portal>

{ "referralCode": "...", "customerEmail": "...",
  "amount": 100000, "currency": "COP", "orderId": "..." }
```

Ojo: `amount` va en **pesos**, no en centavos. Esa API key se genera en
el portal (Admin → API keys) y va como `AFILIADOS_API_KEY` en los Vercel
de amalia-app y del marketing.

## Puesta en marcha (resumen)

1. Vercel → Storage → Neon. `DATABASE_URL` queda puesta sola.
2. Agregar `JWT_SECRET` y `LOOPS_API_KEY`.
3. `npm run db:push` (o desde el build) para crear las tablas.
4. DNS: `CNAME afiliados → cname.vercel-dns.com`
5. Registrarse en `/register` — queda como afiliada, porque el portal
   bloquea a propósito el auto-registro como admin. Para subirse:
   ```sql
   update "User" set role = 'ADMIN' where email = 'TU_CORREO';
   ```
6. Generar la API key y la regla de comisión.

# Amalia Afiliados — fork de Refferq

Fork de [Refferq](https://github.com/Refferq/Refferq) (MIT) para el
programa de afiliados de Amalia. Portal: `afiliados.somosamalia.com`.

## Cambios sobre upstream
- `src/lib/email.ts`: sin `RESEND_API_KEY` los correos se OMITEN con
  gracia (el portal funciona; credenciales y avisos van por WhatsApp).
  Para activarlos: cuenta gratis de Resend + la env var.

## Deploy (Vercel)
1. Proyecto nuevo en Vercel apuntando a este repo.
2. Env vars:
   - `DATABASE_URL` = connection string de Supabase con `?schema=refferq`
     (usa el **Session pooler** de Supabase, puerto 5432, y agrega
     `&sslmode=require`). El schema `refferq` se crea con:
     `create schema if not exists refferq;`
   - `JWT_SECRET` = `openssl rand -hex 32`
   - `NEXT_PUBLIC_APP_URL` = `https://afiliados.somosamalia.com`
   - `ADMIN_EMAILS` = `jj@somosamalia.com`
3. `npx prisma migrate deploy` corre en el build (ver package.json).
4. Dominio: CNAME `afiliados` → `cname.vercel-dns.com`.

## Integración con el funnel de Amalia
Nuestro webhook de Wompi reporta el primer pago aprobado a
`POST /api/track/conversion` con header `X-API-Key` (se genera en el
admin del portal → Integrations) y body
`{referralCode, customerEmail, amount, currency: "COP", orderId}`.
La comisión se configura en el admin (Commission Rules).

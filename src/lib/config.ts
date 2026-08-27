/**
 * Constantes de despliegue del portal.
 *
 * Van QUEMADAS, no en variables de entorno: no son secretos, no cambian
 * entre despliegues y una variable de más es una variable que se puede
 * olvidar o escribir mal. Mismo criterio que usamos en los triggers de
 * Postgres de amalia-app, donde la URL del webhook también va quemada.
 *
 * En variables de entorno queda SOLO lo que es secreto o propio de la
 * instancia: DATABASE_URL (la pone Vercel al crear la base), JWT_SECRET
 * y LOOPS_API_KEY.
 */

/** Dominio público del portal. La env var solo sirve para desarrollo
 *  local o para un preview de Vercel; en producción no hace falta. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://afiliados.somosamalia.com";

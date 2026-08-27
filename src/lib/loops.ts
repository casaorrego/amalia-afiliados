/**
 * Loops — correos transaccionales del portal de afiliadas.
 *
 * Reemplaza a Resend, que era lo que traía Refugio de fábrica: Amalia ya
 * manda todo su correo por Loops (mismo remitente, mismo dominio
 * verificado, una sola factura), y el correo del login es justo lo que
 * Loops hace bien — una plantilla con una variable.
 *
 * El correo lo diseñas TÚ en el editor visual de Loops; acá solo se
 * dispara el transactional con sus variables. Se resuelve por NOMBRE y
 * no por id para no tener que meter una variable de entorno por correo:
 * basta con que el transactional en Loops se llame igual.
 *
 * Config (Vercel env):
 *   LOOPS_API_KEY — API key de Loops. Sin ella no se manda nada y el
 *                   login por código NO funciona (es su único canal).
 *
 * Espejo de amalia-app/src/lib/loops.ts — si cambia el contrato de
 * Loops, cambiarlo en los dos.
 */

const LOOPS_ENDPOINT = "https://app.loops.so/api/v1/transactional";
const LOOPS_LIST_ENDPOINT = "https://app.loops.so/api/v1/transactional-emails";

export interface LoopsResult {
  ok: boolean;
  error?: string;
}

// Nombre del transactional en Loops. Tiene que coincidir EXACTO con el
// que crees en el dashboard. Variables que espera: {codigo}, {nombre}.
export const OTP_EMAIL_NAME = "afiliados_codigo_acceso";

// Bienvenida al crear una afiliada desde el admin. Variables:
// {nombre}, {codigo}, {link}, {entrar}.
export const BIENVENIDA_EMAIL_NAME = "afiliados_bienvenida";

// ── Resolución por nombre ─────────────────────────────────────────
// Loops solo acepta transactionalId al enviar, pero el listado devuelve
// {id, name}. Se cachea en memoria: la content API tiene un tope de
// 60 req/60s, mucho más apretado que el del envío.
const NAME_CACHE_TTL_MS = 10 * 60 * 1000;
let nameCache: Map<string, string> | null = null;
let nameCacheAt = 0;

async function loadTransactionalIndex(
  apiKey: string
): Promise<Map<string, string> | null> {
  const index = new Map<string, string>();
  let cursor: string | null = null;
  try {
    for (let page = 0; page < 20; page++) {
      const url = new URL(LOOPS_LIST_ENDPOINT);
      url.searchParams.set("perPage", "50");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[loops] listado falló ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const json = (await res.json()) as {
        data?: Array<{ id: string; name: string }>;
        pagination?: { nextCursor?: string | null };
      };
      for (const row of json.data ?? []) {
        if (row?.name && row?.id) index.set(row.name.trim(), row.id);
      }
      cursor = json.pagination?.nextCursor ?? null;
      if (!cursor) break;
    }
  } catch (err) {
    console.error("[loops] listado crasheó", err);
    return null;
  }
  return index;
}

export async function resolveTransactionalId(
  name: string
): Promise<string | null> {
  const apiKey = process.env.LOOPS_API_KEY;
  if (!apiKey) return null;
  const fresh = nameCache && Date.now() - nameCacheAt < NAME_CACHE_TTL_MS;
  if (!fresh) {
    const loaded = await loadTransactionalIndex(apiKey);
    // Si el listado falla, se conserva el caché viejo: mejor un id
    // posiblemente rancio que no mandar el código de acceso.
    if (loaded) {
      nameCache = loaded;
      nameCacheAt = Date.now();
    }
  }
  return nameCache?.get(name.trim()) ?? null;
}

export async function sendTransactional(
  transactionalId: string,
  email: string,
  dataVariables: Record<string, string>
): Promise<LoopsResult> {
  const apiKey = process.env.LOOPS_API_KEY;
  if (!apiKey) return { ok: false, error: "LOOPS_API_KEY no configurada" };
  try {
    const res = await fetch(LOOPS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transactionalId, email, dataVariables }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Loops ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function sendTransactionalByName(
  name: string,
  email: string,
  dataVariables: Record<string, string>
): Promise<LoopsResult> {
  const id = await resolveTransactionalId(name);
  if (!id) {
    return { ok: false, error: `transactional "${name}" no encontrado en Loops` };
  }
  return sendTransactional(id, email, dataVariables);
}

/** Bienvenida: le avisa a la afiliada que su cuenta está lista, con su
 *  código y su link. No lleva contraseña porque no hay — entra con el
 *  código de 6 dígitos que le llega al pedir acceso. */
export async function sendBienvenidaEmail(args: {
  email: string;
  nombre: string;
  codigo: string;
  link: string;
  entrar: string;
  manual: string;
}): Promise<LoopsResult> {
  return sendTransactionalByName(BIENVENIDA_EMAIL_NAME, args.email, {
    nombre: args.nombre,
    codigo: args.codigo,
    link: args.link,
    entrar: args.entrar,
    manual: args.manual,
  });
}

/** Código de acceso del portal (login sin contraseña). */
export async function sendOtpEmail(
  email: string,
  codigo: string,
  nombre: string
): Promise<LoopsResult> {
  return sendTransactionalByName(OTP_EMAIL_NAME, email, { codigo, nombre });
}

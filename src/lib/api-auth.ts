import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * Verifica la X-API-Key de los endpoints de tracking.
 *
 * OJO — el upstream trae DOS sistemas de llaves que no se hablan:
 *
 *   1. IntegrationSettings.publicKey (`pk_…`) — sin permisos, guardada
 *      en claro, y **sin ninguna pantalla que la genere**: el endpoint
 *      existe pero nada en el admin lo llama. Era la que verificaban
 *      estos endpoints, o sea que no había forma de conseguir una
 *      llave que funcionara.
 *   2. ApiKey (`rfq_…`) — la que genera Admin → API Keys. Guarda solo
 *      el hash SHA-256, tiene permisos, límite de peticiones,
 *      expiración y se puede revocar.
 *
 * Se usa la segunda: es la que el admin puede crear y rotar, y la que
 * no deja la llave en claro en la base.
 */
export async function verifyApiKey(
  raw: string | null
): Promise<{ ok: boolean; keyId?: string }> {
  if (!raw) return { ok: false };
  const keyHash = crypto.createHash('sha256').update(raw).digest('hex');
  const key = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!key || !key.isActive) return { ok: false };
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return { ok: false };

  // Marca de uso — deja rastro de cuándo se usó por última vez, útil
  // para detectar una llave olvidada o filtrada. Best-effort.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, keyId: key.id };
}

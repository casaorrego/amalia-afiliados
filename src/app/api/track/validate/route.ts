import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/track/validate?code=XXXX  →  { valid: boolean }
 *
 * Lo llama el marketing de Amalia cuando una paciente escribe un código
 * de referida en el paywall, para decidir si le aplica el descuento.
 *
 * El portal vive en su PROPIA base de datos (separada de la de
 * pacientes), así que el marketing no puede consultar esta tabla
 * directamente — pregunta por acá. Antes esto era una vista SQL sobre
 * un schema compartido; se cambió cuando se separaron las bases.
 *
 * Solo dice si el código existe y está activo. No revela de quién es.
 * Protegido con la misma X-API-Key que /api/track/conversion.
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ valid: false, error: 'API key is required' }, { status: 401 });
  }

  const integration = await prisma.integrationSettings.findFirst({
    where: { publicKey: apiKey, isActive: true },
  });
  if (!integration) {
    return NextResponse.json({ valid: false, error: 'Invalid or inactive API key' }, { status: 401 });
  }

  const code = (req.nextUrl.searchParams.get('code') || '').trim();
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(code)) {
    return NextResponse.json({ valid: false });
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { referralCode: code },
    include: { user: { select: { status: true } } },
  });

  const valid = !!affiliate && affiliate.user.status === 'ACTIVE';
  return NextResponse.json({ valid }, { headers: { 'Cache-Control': 'no-store' } });
}

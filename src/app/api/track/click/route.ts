import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/api-auth';

/**
 * POST /api/track/click  { referralCode }
 *
 * Cuenta una visita que llegó con el ?ref de una afiliada. Lo llama el
 * marketing desde su servidor (la API key nunca toca el navegador).
 *
 * En este esquema los clics cuelgan de una Referral, no de la afiliada.
 * El upstream resolvía eso creando una referida FALSA por cada clic
 * (click-xxx@tracking.internal), lo que le inflaba a la afiliada el
 * contador de "referidas" con basura. Acá se usa UNA sola fila
 * contenedora por afiliada — el perfil la filtra de la lista visible.
 */
export const BUCKET_SUFIJO = '@clics.internal';

export async function POST(req: NextRequest) {
  const auth = await verifyApiKey(
    req.headers.get('X-API-Key') || req.headers.get('x-api-key')
  );
  if (!auth.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { referralCode } = await req.json().catch(() => ({ referralCode: null }));
  const code = String(referralCode || '').trim();
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(code)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const affiliate = await prisma.affiliate.findUnique({ where: { referralCode: code } });
  if (!affiliate) return NextResponse.json({ ok: true, ignored: true });

  const bucketEmail = `${code.toLowerCase()}${BUCKET_SUFIJO}`;
  const bucket =
    (await prisma.referral.findFirst({
      where: { affiliateId: affiliate.id, leadEmail: bucketEmail },
    })) ??
    (await prisma.referral.create({
      data: {
        affiliateId: affiliate.id,
        leadEmail: bucketEmail,
        leadName: 'Clics',
        status: 'PENDING',
        metadata: { bucketDeClics: true },
      },
    }));

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'desconocida';

  await prisma.referralClick.create({
    data: {
      referralId: bucket.id,
      ipAddress: ip,
      userAgent: req.headers.get('user-agent') || undefined,
      referer: req.headers.get('referer') || undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

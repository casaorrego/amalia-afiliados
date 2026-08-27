import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/api-auth';

/**
 * POST /api/track/referral - Track referral clicks
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key is required' },
        { status: 401 }
      );
    }

    // Verify API key
    const auth = await verifyApiKey(apiKey);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { referralCode, customerEmail, customerName } = body;

    if (!referralCode) {
      return NextResponse.json(
        { success: false, error: 'Referral code is required' },
        { status: 400 }
      );
    }

    // Find affiliate by referral code
    const affiliate = await prisma.affiliate.findUnique({
      where: { referralCode },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { success: false, error: 'Invalid referral code' },
        { status: 404 }
      );
    }

    if (affiliate.user.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Affiliate is not active' },
        { status: 403 }
      );
    }

    // Referida PENDIENTE: alguien que llego por su link ya hizo su
    // PRIMER pago, pero la comision todavia no se gana — eso pasa con
    // el segundo (amalia-app decide cuando). Sin este aviso la afiliada
    // veia su panel en cero durante un mes entero despues de haber
    // conseguido a alguien, y lo natural es pensar que el link no
    // sirve y dejar de promocionar.
    //
    // Antes esta ruta era una cascara: validaba el codigo, escribia una
    // linea en el log y devolvia exito sin guardar nada.
    //
    // Idempotente por (afiliada, correo): amalia-app puede llamar en
    // cada pago sin duplicar. Cuando llegue el segundo pago,
    // /track/conversion encuentra esta misma fila y la pasa a APPROVED.
    if (!customerEmail) {
      return NextResponse.json(
        { success: false, error: 'customerEmail is required' },
        { status: 400 }
      );
    }

    const existente = await prisma.referral.findFirst({
      where: { affiliateId: affiliate.id, leadEmail: customerEmail },
    });

    const referral =
      existente ??
      (await prisma.referral.create({
        data: {
          affiliateId: affiliate.id,
          leadEmail: customerEmail,
          leadName: customerName || 'Referida',
          status: 'PENDING',
          metadata: { origen: 'primer_pago' },
        },
      }));

    return NextResponse.json({
      success: true,
      message: existente ? 'Referral already tracked' : 'Pending referral created',
      referral: { id: referral.id, status: referral.status },
    });
  } catch (error) {
    console.error('POST /api/track/referral error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to track referral' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    },
  });
}

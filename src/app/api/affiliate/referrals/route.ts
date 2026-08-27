import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Registrar una referida A MANO está DESACTIVADO (founder 27-ago).
 *
 * La afiliada podía escribir el nombre y correo de cualquier persona y
 * quedaba como referida suya. Eso rompe la atribución: la referida se
 * la puede estar trayendo otra, o puede no existir. Las referidas
 * entran SOLO por el sistema de tracking — alguien abre su link, el
 * ?ref queda guardado, y la conversión la reporta el servidor cuando
 * el pago está aprobado de verdad.
 *
 * Se deja el 405 en vez de borrar la ruta: la de GET (listar) sigue
 * viva en este mismo archivo, y así queda explícito que POST está
 * cerrado a propósito y no es un descuido.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Las referidas se registran solas cuando alguien entra por tu link.',
    },
    { status: 405 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')!;

    // Get user from database

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        affiliate: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    if (user.role !== 'AFFILIATE') {
      return NextResponse.json(
        { error: 'Access denied. Affiliate role required.' },
        { status: 403 }
      );
    }

    if (!user.affiliate) {
      return NextResponse.json(
        { error: 'Affiliate profile not found' },
        { status: 404 }
      );
    }

    const referrals = await prisma.referral.findMany({
      where: { affiliateId: user.affiliate.id },
      orderBy: { createdAt: 'desc' }
    });

    // Map referrals to include estimatedValue from metadata
    const mappedReferrals = referrals.map((ref: any) => {
      const metadata = ref.metadata as any;
      return {
        ...ref,
        estimatedValue: Number(metadata?.estimated_value) || 0,
        company: metadata?.company || '',
      };
    });

    return NextResponse.json({
      success: true,
      referrals: mappedReferrals,
    });
  } catch (error) {
    console.error('Get referrals API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}
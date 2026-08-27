import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyApiKey } from '@/lib/api-auth';

/**
 * POST /api/track/conversion - Track conversions/sales
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

    // Verify API key (Admin → API Keys; ver lib/api-auth)
    const auth = await verifyApiKey(apiKey);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      referralCode,
      customerEmail,
      customerName,
      amount,
      currency,
      orderId,
      metadata,
      url,
      timestamp,
    } = body;

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

    // Check if referral with this email already exists
    let referral;
    if (customerEmail) {
      referral = await prisma.referral.findFirst({
        where: {
          leadEmail: customerEmail,
          affiliateId: affiliate.id,
        },
      });
    }

    // Create referral if doesn't exist
    if (!referral && customerEmail) {
      referral = await prisma.referral.create({
        data: {
          leadEmail: customerEmail,
          leadName: customerName || 'Unknown Customer',
          affiliateId: affiliate.id,
          status: 'APPROVED',
          metadata: metadata || {},
        },
      });
    } else if (referral && referral.status === 'PENDING') {
      // Update referral status to APPROVED
      referral = await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: 'APPROVED',
          metadata: {
            ...(referral.metadata as object),
            ...metadata,
          },
        },
      });
    }

    // Create conversion record
    const amountCents = Math.round((amount || 0) * 100);

    const conversion = await prisma.conversion.create({
      data: {
        affiliateId: affiliate.id,
        referralId: referral?.id || null,
        eventType: 'PURCHASE',
        amountCents,
        currency: currency || 'COP',
        status: 'PENDING',
        eventMetadata: {
          orderId: orderId || null,
          url: url || null,
          timestamp: timestamp || new Date().toISOString(),
          ...metadata,
        },
      },
    });

    // ── Comisión ──────────────────────────────────────────────
    // El upstream dejaba acá un comentario diciendo que "el sistema de
    // reglas" calcularía la comisión, pero ese sistema no existe: la
    // conversión se registraba y el saldo de la afiliada nunca subía.
    //
    // Se aplica la regla marcada como default: FIXED = monto fijo por
    // referida (lo nuestro), PERCENTAGE = % sobre la venta. Queda en
    // PENDING; el admin la aprueba y la paga. Si no hay regla, se
    // registra la venta igual y queda en los logs — perder la venta
    // por una comisión sin configurar sería peor.
    try {
      const regla = await prisma.commissionRule.findFirst({
        where: { isDefault: true, isActive: true },
      });
      if (!regla) {
        console.warn('[conversion] sin regla de comisión por defecto — venta registrada sin comisión');
      } else {
        const comisionCents =
          regla.type === 'FIXED'
            ? Math.round(regla.value * 100)
            : Math.round((amountCents * regla.value) / 100);
        await prisma.commission.create({
          data: {
            conversionId: conversion.id,
            affiliateId: affiliate.id,
            userId: affiliate.user.id,
            amountCents: comisionCents,
            rate: regla.value,
            status: 'PENDING',
          },
        });
        console.log('[conversion] comisión creada:', comisionCents / 100);
      }
    } catch (err) {
      console.error('[conversion] no se pudo crear la comisión:', err);
    }

    console.log('✅ Conversion tracked successfully:', {
      conversionId: conversion.id,
      affiliateId: affiliate.id,
      referralId: referral?.id,
      amount: amountCents / 100,
    });

    return NextResponse.json({
      success: true,
      message: 'Conversion tracked successfully',
      conversion: {
        id: conversion.id,
        amount: amountCents / 100,
        currency: conversion.currency,
      },
      affiliate: {
        name: affiliate.user.name,
        code: affiliate.referralCode,
      },
    });
  } catch (error) {
    console.error('POST /api/track/conversion error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to track conversion' },
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

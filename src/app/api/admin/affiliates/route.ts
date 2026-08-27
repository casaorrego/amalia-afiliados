import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')!;

    // Get user from database

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Fetch all affiliates with their user info and counts
    const affiliates = await prisma.affiliate.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            referrals: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get currency symbol
    const { getCurrencySymbol } = await import('@/lib/currency');
    const currencySymbol = await getCurrencySymbol();

    return NextResponse.json({
      success: true,
      affiliates,
      currencySymbol, // Add currency symbol to response
    });
  } catch (error) {
    console.error('Get affiliates API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch affiliates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')!;

    // Get user from database

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate with Zod
    const { success, data, error: validationError } = await import('@/lib/validations').then(m => m.affiliateCreateSchema.safeParse(body));

    if (!success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationError.issues },
        { status: 400 }
      );
    }

    const { name, email, password, payoutMethod, paypalEmail, sendWelcomeEmail, referralCode } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Generate password if not provided
    const crypto = await import('crypto');
    const userPassword = password || `AF${crypto.randomBytes(12).toString('base64url')}`;

    // Hash password with bcrypt
    const hashedPassword = await (await import('bcryptjs')).hash(userPassword, 12);

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        role: 'AFFILIATE',
        status: 'ACTIVE',
        password: hashedPassword
      }
    });

    // Código legible: el nombre a secas si está libre. Si el admin
    // escribió uno a mano (el @ de una influencer, por ejemplo), manda ese.
    const { generarCodigoAfiliada, normalizarCodigoManual } = await import('@/lib/affiliate-code');
    const codigo =
      (referralCode ? await normalizarCodigoManual(referralCode) : null) ??
      (await generarCodigoAfiliada(name));

    // Create affiliate profile
    const affiliate = await prisma.affiliate.create({
      data: {
        userId: newUser.id,
        referralCode: codigo,
        balanceCents: 0,
        // Se guarda lo que el admin llenó en el formulario. Antes esto
        // era `{}` fijo: el método de pago se descartaba en silencio y
        // la afiliada abría sus ajustes con todo vacío.
        // Las llaves tienen que ser las MISMAS que lee
        // /affiliate/settings (paymentMethod, paymentEmail).
        payoutDetails: {
          paymentMethod: payoutMethod || 'Nequi',
          paymentEmail: paypalEmail || email,
        }
      }
    });

    // Bienvenida. El portal es solo por invitacion, asi que si esto no
    // sale la afiliada nunca se entera de que tiene cuenta. Antes no se
    // mandaba NADA — la casilla del formulario era decorativa.
    // Best-effort: un fallo de correo no debe tumbar la creacion.
    if (sendWelcomeEmail !== false) {
      const { sendBienvenidaEmail } = await import('@/lib/loops');
      const { APP_URL, MANUAL_URL, linkDeReferido } = await import('@/lib/config');
      const r = await sendBienvenidaEmail({
        email,
        nombre: (name || '').trim().split(/\s+/)[0] || '',
        codigo: affiliate.referralCode,
        link: linkDeReferido(affiliate.referralCode),
        entrar: `${APP_URL}/login`,
        manual: MANUAL_URL,
      });
      if (!r.ok) console.error('[afiliadas] bienvenida no salio:', r.error);
    }

    return NextResponse.json({
      success: true,
      message: 'Affiliate created successfully',
      affiliate: {
        id: affiliate.id,
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        referralCode: affiliate.referralCode,
        balanceCents: affiliate.balanceCents,
        createdAt: affiliate.createdAt
      },
      // Note: Password is sent to admin once and should be communicated
      // securely to the affiliate. It is not stored in logs.
      temporaryPassword: userPassword
    });
  } catch (error) {
    console.error('Create affiliate API error:', error);
    return NextResponse.json(
      { error: 'Failed to create affiliate' },
      { status: 500 }
    );
  }
}
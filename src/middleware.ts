import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET!
);

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Define protected routes
    const isAdminRoute = pathname.startsWith('/api/admin') || pathname.startsWith('/admin');
    const isAffiliateRoute = pathname.startsWith('/api/affiliate') || pathname.startsWith('/affiliate');
    // /api/auth/me: sirve para CUALQUIER usuario autenticado (no pide un
    // rol concreto), pero SÍ necesita pasar por acá — lee la identidad de
    // la cabecera que este middleware inyecta. Estaba en el matcher pero
    // se salía por este return, así que llegaba sin identidad, respondía
    // 401, y useAuth mandaba a /login: entrabas y te sacaba de una.
    const isMeRoute = pathname === '/api/auth/me';

    if (!isAdminRoute && !isAffiliateRoute && !isMeRoute) {
        return NextResponse.next();
    }

    // 2. Get token from cookies
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
        // If it's an API route, return 401
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }
        // If it's a page route, redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
        // 3. Verify JWT
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const userRole = payload.role as string;

        // 4. Role-based access control
        if (isAdminRoute && userRole !== 'ADMIN') {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                    { error: 'Forbidden: Admin access required' },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }

        if (isAffiliateRoute && userRole !== 'AFFILIATE' && userRole !== 'ADMIN') {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                    { error: 'Forbidden: Affiliate access required' },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // 5. Pasarle la identidad a la ruta.
        //
        // OJO: tiene que ir en las cabeceras de la PETICIÓN, no en las de
        // la respuesta. `response.headers.set(...)` se las manda al
        // NAVEGADOR — la ruta nunca las ve, así que las 41 rutas que
        // hacen request.headers.get('x-user-id') recibían null y
        // respondían 401. El panel entero quedaba inservible.
        //
        // Sobrescribir (no añadir) también cierra el hueco de que alguien
        // mande su propia cabecera x-user-id desde afuera para hacerse
        // pasar por otro: acá se pisa siempre con lo que dice el JWT.
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-user-id', payload.userId as string);
        requestHeaders.set('x-user-role', userRole);

        return NextResponse.next({ request: { headers: requestHeaders } });
    } catch (error) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 401 }
            );
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: [
        '/admin/:path*',
        '/affiliate/:path*',
        '/api/admin/:path*',
        '/api/affiliate/:path*',
        '/api/auth/me',
    ],
};

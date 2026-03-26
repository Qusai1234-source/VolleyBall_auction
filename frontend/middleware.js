import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
    const response = NextResponse.next()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                get(name) {
                    return request.cookies.get(name)?.value
                },
                set(name, value, options) {
                    response.cookies.set({ name, value, ...options })
                },
                remove(name, options) {
                    response.cookies.set({ name, value: '', ...options })
                },
            },
        }
    )

    // ✅ FAST — no external call
    const { data: { session } } = await supabase.auth.getSession()

    const { pathname } = request.nextUrl

    const isAdminRoute = pathname.startsWith('/admin')
    const isLoginPage = pathname === '/admin/login'

    // 🚫 Not logged in → redirect to login
    if (isAdminRoute && !isLoginPage && !session) {
        return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // 🔁 Already logged in → avoid login page
    if (isLoginPage && session) {
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    return response
}

export const config = {
    matcher: ['/admin/:path*'],
}

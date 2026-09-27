import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl
  const { pathname } = url
  const host = (request.headers.get('host') || '').split(':')[0]

  // Subdomínio → catálogo público da loja.
  // Dormant até configurar NEXT_PUBLIC_ROOT_DOMAIN (ex.: "minhaloja.com") com DNS wildcard.
  // Assim, sualoja.minhaloja.com passa a servir /loja/sualoja automaticamente.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (rootDomain && host.endsWith(`.${rootDomain}`) && host !== `www.${rootDomain}`) {
    const sub = host.slice(0, -(rootDomain.length + 1))
    if (sub && sub !== 'www') {
      const rewritten = url.clone()
      rewritten.pathname = `/loja/${sub}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(rewritten)
    }
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gaff's front door. Once the marketplace is public (ADR-0015), someone who isn't signed in
 * starts at the homes to rent; a signed-in letter still starts at their lettings. Only the
 * sign-in cookie's presence is read here; the pages check the session itself.
 */
export function proxy(request: NextRequest) {
  if (process.env.MARKETPLACE_PUBLIC !== '1') return NextResponse.next();
  const signedIn =
    request.cookies.has('better-auth.session_token') ||
    request.cookies.has('__Secure-better-auth.session_token');
  if (signedIn) return NextResponse.next();
  return NextResponse.redirect(new URL('/to-rent', request.url));
}

export const config = { matcher: '/' };

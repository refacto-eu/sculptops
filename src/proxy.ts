import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // Bypass all auth checks when SKIP_AUTH is enabled (dev mode)
  if (process.env.SKIP_AUTH === "true") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isDashboard = pathname.startsWith("/dashboard");

  if (!isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

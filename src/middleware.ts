// Per-route security headers. The token lives in the URL of /a/* and /api/files;
// a Referrer-Policy of no-referrer prevents that token from leaking through a
// Referer header on any outbound request from those pages. X-Content-Type-Options
// blocks MIME sniffing on the file route, where content-type comes from the
// upload's extension.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/a/") || req.nextUrl.pathname.startsWith("/api/files/")) {
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("X-Content-Type-Options", "nosniff");
  }
  return res;
}

export const config = {
  matcher: ["/a/:path*", "/api/files/:path*"],
};

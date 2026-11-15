import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";

type Guard = (req: NextRequest, event: NextFetchEvent) => Promise<Response> | Response;

// With lazy NextAuth config, `auth(handler)` resolves to the wrapped handler asynchronously.
const guard = auth((req) => {
  if (!req.auth) {
    const { pathname, search } = req.nextUrl;
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
}) as unknown as Promise<Guard>;

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  return (await guard)(req, event);
}

export const config = {
  matcher: ["/dashboard/:path*", "/setup", "/admin/:path*", "/invite/:path*"],
};

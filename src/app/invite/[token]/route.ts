import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { InviteError } from "@/lib/performers/errors";
import { acceptInvite } from "@/lib/performers/invites";

export const dynamic = "force-dynamic";

// A route handler (not a page) because accepting an invite must set a cookie,
// which Server Components cannot do.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const origin = req.nextUrl.origin;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    const url = new URL("/login", origin);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  try {
    const { performerId } = await acceptInvite(getDb(), token, userId);
    const res = NextResponse.redirect(new URL("/dashboard/requests", origin));
    res.cookies.set("sr_performer", performerId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    if (e instanceof InviteError) return NextResponse.redirect(new URL("/invite/invalid", origin));
    throw e;
  }
}

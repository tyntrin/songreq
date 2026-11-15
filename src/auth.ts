import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Line from "next-auth/providers/line";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { isDevLoginEnabled, normalizeDevEmail } from "@/lib/auth/dev-login";

declare module "next-auth" {
  interface Session {
    user: { id: string } & import("next-auth").DefaultSession["user"];
  }
}

export function buildConfig(): NextAuthConfig {
  const env = process.env;
  const providers: NextAuthConfig["providers"] = [];
  if (env.AUTH_LINE_ID && env.AUTH_LINE_SECRET) {
    providers.push(Line({ clientId: env.AUTH_LINE_ID, clientSecret: env.AUTH_LINE_SECRET }));
  }
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    providers.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
  }
  if (isDevLoginEnabled(env)) {
    providers.push(
      Credentials({
        id: "dev",
        name: "Dev login",
        credentials: { email: { label: "Email", type: "email" } },
        async authorize(credentials) {
          if (!isDevLoginEnabled(process.env)) return null;
          const email = normalizeDevEmail(credentials?.email);
          if (!email) return null;
          const db = getDb();
          const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (existing) return { id: existing.id, email: existing.email, name: existing.name };
          const [created] = await db
            .insert(users)
            .values({ email, name: email.split("@")[0] })
            .returning();
          return { id: created.id, email: created.email, name: created.name };
        },
      }),
    );
  }

  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers,
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    trustHost: true,
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) token.id = user.id;
        return token;
      },
      session({ session, token }) {
        const id = token.id ?? token.sub;
        if (id && session.user) session.user.id = id as string;
        return session;
      },
    },
  };
}

// Lazy config: the DB is not touched until the first request.
export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());

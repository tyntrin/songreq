import { readFile } from "node:fs/promises";
import path from "node:path";
import { CONTENT_TYPES, isSafeUploadName, uploadDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!isSafeUploadName(name)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(uploadDir(), name));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": CONTENT_TYPES[name.split(".").pop()!],
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

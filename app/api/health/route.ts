import { query } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await query<{ now: string }>("select now()");
    return Response.json({ ok: true, db: "connected", time: rows[0].now });
  } catch (error) {
    console.error("Database health check failed:", error);
    return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}

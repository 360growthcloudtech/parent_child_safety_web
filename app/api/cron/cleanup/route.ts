import { performCleanup } from "@/lib/cleanup";

/**
 * Midnight cron cleanup endpoint (12:00 AM).
 * Can be called by Vercel Cron, system crontab, or external scheduler.
 */
export async function GET(request: Request) {
  // Optional auth check if CRON_SECRET is set
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await performCleanup();
    console.log(`[Cron Cleanup] Automated midnight cleanup completed:`, result);
    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("[Cron Cleanup] Automated cleanup failed:", error);
    return Response.json({ ok: false, error: "cleanup failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}

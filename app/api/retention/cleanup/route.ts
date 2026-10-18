import { getSessionEmail } from "@/lib/session";
import { performCleanup } from "@/lib/cleanup";

export async function POST() {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  try {
    const result = await performCleanup(email);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Manual cleanup failed:", error);
    return Response.json({ ok: false, error: "cleanup failed" }, { status: 500 });
  }
}

import { randomInt } from "node:crypto";
import { query } from "@/lib/db";
import { getSessionEmail } from "@/lib/session";

function sixDigits(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Returns the account's stable pairing code, creating it on first use.
 * The same code can connect multiple child devices and does not expire.
 * Pass { "rotate": true } to issue a fresh code (old one stops working).
 */
export async function POST(request: Request) {
  const email = await getSessionEmail();
  if (!email) {
    return Response.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  let rotate = false;
  try {
    const body = await request.json();
    rotate = body?.rotate === true;
  } catch {
    /* no body is fine */
  }

  try {
    if (!rotate) {
      const existing = await query<{ code: string }>(
        `select code from account_codes where email = $1`,
        [email],
      );
      if (existing.rows.length > 0) {
        return Response.json({ ok: true, code: existing.rows[0].code });
      }
    }

    // Create or rotate, retrying on the rare code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = sixDigits();
      try {
        const { rows } = await query<{ code: string }>(
          `insert into account_codes (email, code, created_at)
           values ($1, $2, now())
           on conflict (email) do update set code = excluded.code, created_at = now()
           returning code`,
          [email, code],
        );
        return Response.json({ ok: true, code: rows[0].code });
      } catch (err) {
        const pgCode =
          typeof err === "object" && err !== null && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        if (pgCode === "23505") continue; // code already taken, retry
        throw err;
      }
    }
    return Response.json(
      { ok: false, error: "could not allocate code, try again" },
      { status: 503 },
    );
  } catch (error) {
    console.error("Generating pairing code failed:", error);
    return Response.json(
      { ok: false, error: "generate failed" },
      { status: 500 },
    );
  }
}

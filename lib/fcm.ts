import { createSign } from "node:crypto";

/**
 * Minimal FCM HTTP v1 sender using a Firebase service account.
 *
 * Provide the service account JSON via the FCM_SERVICE_ACCOUNT env var (the
 * whole JSON as a string). Until it is set, sendPush() is a safe no-op so the
 * rest of the app keeps working.
 */
type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function loadServiceAccount(): ServiceAccount | null {
  // Prefer base64 (avoids newline/quoting issues with the private key in .env).
  const b64 = process.env.FCM_SERVICE_ACCOUNT_B64;
  const raw = b64
    ? Buffer.from(b64, "base64").toString("utf8")
    : process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (sa.client_email && sa.private_key && sa.project_id) return sa;
  } catch {
    /* fall through */
  }
  return null;
}

let cachedToken: { value: string; exp: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(sa.private_key));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("no access_token from Google");
  cachedToken = { value: data.access_token, exp: now + 3500 };
  return data.access_token;
}

/**
 * Sends a data message to one device token. Returns false (no-op) when no
 * service account is configured.
 */
export async function sendPush(
  fcmToken: string,
  data: Record<string, string>,
): Promise<boolean> {
  const sa = loadServiceAccount();
  if (!sa || !fcmToken) return false;
  try {
    const accessToken = await getAccessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data,
            android: {
              priority: "high",
              ttl: "60s",
            },
          },
        }),
      },
    );
    if (!res.ok) {
      console.error("FCM send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("FCM send error:", error);
    return false;
  }
}

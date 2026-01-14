import crypto from "crypto";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

/**
 * Verifies that a request came from Slack by checking the signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!SLACK_SIGNING_SECRET) {
    console.error("SLACK_SIGNING_SECRET is not set");
    return false;
  }

  if (!signature || !timestamp) {
    console.error("Missing signature or timestamp headers");
    return false;
  }

  // Check if the timestamp is within 5 minutes (prevent replay attacks)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) {
    console.error("Request timestamp is too old");
    return false;
  }

  // Create the signature base string
  const sigBaseString = `v0:${timestamp}:${body}`;

  // Generate our own signature
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBaseString, "utf8")
      .digest("hex");

  // Compare signatures using timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

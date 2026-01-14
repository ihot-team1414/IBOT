import crypto from "crypto";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3001/api/slack/events";

if (!SLACK_SIGNING_SECRET) {
  console.error("❌ SLACK_SIGNING_SECRET environment variable is required");
  process.exit(1);
}

function generateSlackSignature(body: string, timestamp: string): string {
  const sigBaseString = `v0:${timestamp}:${body}`;
  const signature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBaseString, "utf8")
      .digest("hex");
  return signature;
}

async function testUrlVerification() {
  console.log("=== Testing URL Verification Challenge ===\n");

  const body = JSON.stringify({
    type: "url_verification",
    challenge: "test-challenge-12345",
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSlackSignature(body, timestamp);

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": signature,
      "x-slack-request-timestamp": timestamp,
    },
    body,
  });

  const result = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(result, null, 2));
  console.log(
    "✅ URL verification:",
    result.challenge === "test-challenge-12345" ? "PASSED" : "FAILED"
  );
  console.log();
}

async function testAppMention() {
  console.log("=== Testing App Mention Event ===\n");

  const eventTs = `${Date.now() / 1000}`;
  const body = JSON.stringify({
    type: "event_callback",
    event_id: "Ev123456",
    event: {
      type: "app_mention",
      user: "U123456",
      text: "<@U_BOT_ID> What is FRC?",
      ts: eventTs,
      channel: "C123456",
      event_ts: eventTs,
    },
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSlackSignature(body, timestamp);

  console.log("Sending app_mention event...");
  console.log("Request body:", body);
  console.log();

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": signature,
      "x-slack-request-timestamp": timestamp,
    },
    body,
  });

  const result = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(result, null, 2));
  console.log(
    "✅ App mention acknowledged:",
    response.status === 200 && result.ok ? "PASSED" : "FAILED"
  );
  console.log();
  console.log(
    "Note: The actual AI response will be processed in the background."
  );
  console.log(
    "Check the server logs to see the agent processing and any Slack API calls."
  );
}

async function testInvalidSignature() {
  console.log("=== Testing Invalid Signature (should be rejected) ===\n");

  const body = JSON.stringify({
    type: "url_verification",
    challenge: "test-challenge",
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": "v0=invalid_signature",
      "x-slack-request-timestamp": timestamp,
    },
    body,
  });

  const result = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(result, null, 2));
  console.log(
    "✅ Invalid signature rejected:",
    response.status === 401 ? "PASSED" : "FAILED"
  );
  console.log();
}

async function main() {
  console.log("🧪 Slack Webhook Test Suite\n");
  console.log("Make sure the dev server is running on http://localhost:3000\n");
  console.log("-------------------------------------------\n");

  try {
    await testUrlVerification();
    await testInvalidSignature();
    await testAppMention();
  } catch (error) {
    if ((error as Error).message?.includes("ECONNREFUSED")) {
      console.error(
        "❌ Could not connect to server. Make sure to run: bun run dev"
      );
    } else {
      console.error("❌ Test failed:", error);
    }
  }
}

main();

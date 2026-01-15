import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// Create HTTP client for server-side usage (not reactive, just HTTP calls)
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  console.warn("NEXT_PUBLIC_CONVEX_URL not set - memory features will be disabled");
}

const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export { convex, api };

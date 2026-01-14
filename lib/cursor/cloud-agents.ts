export const CURSOR_CLOUD_AGENTS_API_BASE_URL = "https://api.cursor.com" as const;
export const DEFAULT_TARGET_REPOSITORY =
  "https://github.com/ihot-team1414/FRC1414-Code-2026" as const;

export type CursorCloudAgentStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "FAILED"
  | "STOPPED"
  // Future-proof: Cursor may add statuses
  | (string & {});

export interface CursorCloudAgentSource {
  repository: string;
  ref?: string;
}

export interface CursorCloudAgentTarget {
  branchName?: string;
  url?: string;
  prUrl?: string;
  autoCreatePr?: boolean;
  openAsCursorGithubApp?: boolean;
  skipReviewerRequest?: boolean;
}

export interface CursorCloudAgent {
  id: string;
  name?: string;
  status: CursorCloudAgentStatus;
  source: CursorCloudAgentSource;
  target?: CursorCloudAgentTarget;
  summary?: string;
  createdAt?: string;
}

export interface CursorCloudAgentListResponse {
  agents: CursorCloudAgent[];
  nextCursor?: string;
}

export interface CursorCloudAgentConversationMessage {
  id: string;
  type: "user_message" | "assistant_message" | (string & {});
  text: string;
}

export interface CursorCloudAgentConversationResponse {
  id: string;
  messages: CursorCloudAgentConversationMessage[];
}

export interface CursorCloudAgentMeResponse {
  apiKeyName: string;
  createdAt: string;
  userEmail: string;
}

function getCursorApiKey(): string {
  const key =
    process.env.CURSOR_API_KEY ??
    process.env.CURSOR_CLOUD_AGENTS_API_KEY ??
    process.env.CURSOR_CLOUD_API_KEY;
  if (!key) {
    throw new Error(
      "Missing Cursor API key. Set CURSOR_API_KEY (or CURSOR_CLOUD_AGENTS_API_KEY)."
    );
  }
  return key;
}

function getBasicAuthHeader(): string {
  const apiKey = getCursorApiKey();
  // Basic auth with apiKey as username and empty password
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function cursorRequest<TResponse>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<TResponse> {
  const res = await fetch(`${CURSOR_CLOUD_AGENTS_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: getBasicAuthHeader(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const details =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(
      `Cursor Cloud Agents API error (${res.status} ${res.statusText}) on ${method} ${path}: ${details}`
    );
  }

  return payload as TResponse;
}

export async function listCursorCloudAgents(params?: {
  limit?: number;
  cursor?: string;
}): Promise<CursorCloudAgentListResponse> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return cursorRequest<CursorCloudAgentListResponse>("GET", `/v0/agents${suffix}`);
}

export async function getCursorCloudAgent(id: string): Promise<CursorCloudAgent> {
  return cursorRequest<CursorCloudAgent>("GET", `/v0/agents/${encodeURIComponent(id)}`);
}

export async function getCursorCloudAgentConversation(
  id: string
): Promise<CursorCloudAgentConversationResponse> {
  return cursorRequest<CursorCloudAgentConversationResponse>(
    "GET",
    `/v0/agents/${encodeURIComponent(id)}/conversation`
  );
}

export async function launchCursorCloudAgent(input: {
  promptText: string;
  ref?: string;
  name?: string;
  branchName?: string;
}): Promise<CursorCloudAgent> {
  // Enforced invariants:
  // - Repository always points to FRC1414-Code-2026
  // - Model always "Auto" (omit model field)
  // - Always create a PR
  return cursorRequest<CursorCloudAgent>("POST", "/v0/agents", {
    prompt: { text: input.promptText },
    ...(input.name ? { name: input.name } : {}),
    source: {
      repository: DEFAULT_TARGET_REPOSITORY,
      ...(input.ref ? { ref: input.ref } : {}),
    },
    target: {
      autoCreatePr: true,
      ...(input.branchName ? { branchName: input.branchName } : {}),
    },
  });
}

export async function followupCursorCloudAgent(input: {
  id: string;
  promptText: string;
}): Promise<{ id: string }> {
  return cursorRequest<{ id: string }>(
    "POST",
    `/v0/agents/${encodeURIComponent(input.id)}/followup`,
    { prompt: { text: input.promptText } }
  );
}

export async function stopCursorCloudAgent(id: string): Promise<{ id: string }> {
  return cursorRequest<{ id: string }>(
    "POST",
    `/v0/agents/${encodeURIComponent(id)}/stop`
  );
}

export async function deleteCursorCloudAgent(id: string): Promise<{ id: string }> {
  return cursorRequest<{ id: string }>(
    "DELETE",
    `/v0/agents/${encodeURIComponent(id)}`
  );
}

export async function getCursorApiKeyInfo(): Promise<CursorCloudAgentMeResponse> {
  return cursorRequest<CursorCloudAgentMeResponse>("GET", "/v0/me");
}


import { convex, api } from "@/lib/memory/convex";

export interface StepData {
  type: "tool_call" | "tool_result" | "text";
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  text?: string;
}

/**
 * Log the start of an agent run
 */
export async function logAgentRun(
  runId: string,
  teamId: string,
  prompt: string
): Promise<void> {
  if (!convex) {
    console.warn("[Observability] Convex client not available, skipping log");
    return;
  }

  try {
    await convex.mutation(api.agentLogs.createRun, {
      runId,
      teamId,
      prompt,
    });
  } catch (error) {
    console.error("[Observability] Failed to log agent run:", error);
  }
}

/**
 * Log a single step within an agent run
 */
export async function logAgentStep(
  runId: string,
  stepIndex: number,
  step: StepData
): Promise<void> {
  if (!convex) {
    console.warn("[Observability] Convex client not available, skipping log");
    return;
  }

  try {
    await convex.mutation(api.agentLogs.addStep, {
      runId,
      stepIndex,
      type: step.type,
      toolName: step.toolName,
      toolArgs: step.toolArgs ? JSON.stringify(step.toolArgs) : undefined,
      toolResult: step.toolResult ? JSON.stringify(step.toolResult) : undefined,
      text: step.text,
    });
  } catch (error) {
    console.error("[Observability] Failed to log agent step:", error);
  }
}

/**
 * Mark an agent run as completed
 */
export async function completeAgentRun(
  runId: string,
  response: string,
  stepCount: number,
  durationMs: number
): Promise<void> {
  if (!convex) {
    console.warn("[Observability] Convex client not available, skipping log");
    return;
  }

  try {
    await convex.mutation(api.agentLogs.completeRun, {
      runId,
      response,
      stepCount,
      durationMs,
    });
  } catch (error) {
    console.error("[Observability] Failed to complete agent run:", error);
  }
}

/**
 * Mark an agent run as failed
 */
export async function failAgentRun(
  runId: string,
  errorMessage: string
): Promise<void> {
  if (!convex) {
    console.warn("[Observability] Convex client not available, skipping log");
    return;
  }

  try {
    await convex.mutation(api.agentLogs.failRun, {
      runId,
      errorMessage,
    });
  } catch (error) {
    console.error("[Observability] Failed to log agent run failure:", error);
  }
}

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpinnerGapIcon, WarningOctagonIcon, CheckCircleIcon, WrenchIcon, ChatIcon, BrainIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

type AgentRun = {
  _id: string;
  runId: string;
  teamId: string;
  prompt: string;
  response?: string;
  status: "running" | "completed" | "error";
  errorMessage?: string;
  stepCount: number;
  durationMs?: number;
  createdAt: number;
  completedAt?: number;
  // Metadata fields
  userId?: string;
  userName?: string;
  channelId?: string;
  channelName?: string;
  threadTs?: string;
  isThread?: boolean;
  imageCount?: number;
};

type AgentStep = {
  _id: string;
  runId: string;
  stepIndex: number;
  type: "tool_call" | "tool_result" | "text";
  toolName?: string;
  toolCallId?: string;
  toolArgs?: string;
  toolResult?: string;
  text?: string;
  createdAt: number;
};

// Grouped step types for display
type GroupedToolCall = {
  type: "tool";
  toolName: string;
  toolCallId?: string;
  args?: string;
  result?: string;
  stepIndex: number;
};

type TextStep = {
  type: "text";
  text: string;
  stepIndex: number;
  isFinalResponse: boolean;
};

type GroupedStep = GroupedToolCall | TextStep;

type RunWithSteps = AgentRun & {
  steps: AgentStep[];
};

function StatusBadge({ status }: { status: "running" | "completed" | "error" }) {

  const labels: Record<typeof status, React.ReactNode> = {
    running: <SpinnerGapIcon size={16} className="animate-spin text-muted-foreground" />,
    completed: <CheckCircleIcon size={16} className="text-green-700" />,
    error: <WarningOctagonIcon size={16} className="text-red-700" />,
  };

  return <span className={cn("text-xs font-medium")}>{labels[status]}</span>;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    }
  );
}

function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function formatJson(jsonString: string | undefined): string {
  if (!jsonString) return "";
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonString;
  }
}

function ToolCallCard({ step }: { step: GroupedToolCall }) {
  const formattedArgs = formatJson(step.args);
  const formattedResult = formatJson(step.result);
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Tool call header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
        <WrenchIcon size={16} className="text-muted-foreground" />
        <span className="font-medium font-mono text-sm">{step.toolName}</span>
      </div>
      
      {/* Arguments section */}
      {formattedArgs && (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Arguments</span>
          </div>
          <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded overflow-auto max-h-64 font-mono">
            {formattedArgs}
          </pre>
        </div>
      )}
      
      {/* Result section */}
      {formattedResult && (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Result</span>
          </div>
          <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded overflow-auto max-h-64 font-mono">
            {formattedResult}
          </pre>
        </div>
      )}
      
      {/* Show message if no result yet */}
      {!formattedResult && (
        <div className="px-3 py-2 border-t border-border">
          <span className="text-xs text-muted-foreground italic">Awaiting result...</span>
        </div>
      )}
    </div>
  );
}

function TextStepCard({ step }: { step: TextStep }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
        {step.isFinalResponse ? (
          <ChatIcon size={16} className="text-muted-foreground" />
        ) : (
          <BrainIcon size={16} className="text-muted-foreground" />
        )}
        <span className="font-medium text-sm">
          {step.isFinalResponse ? "Response" : "Reasoning"}
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm whitespace-pre-wrap">
          {step.text}
        </p>
      </div>
    </div>
  );
}

function GroupedStepCard({ step }: { step: GroupedStep }) {
  if (step.type === "tool") {
    return <ToolCallCard step={step} />;
  }
  return <TextStepCard step={step} />;
}

// Animated skeleton component
function Skeleton({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn("bg-muted rounded", className)}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function StepSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="px-3 py-2 border-t border-border space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-16 w-full rounded" />
      </div>
    </div>
  );
}

function RunDetailSkeleton() {
  return (
    <motion.div 
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Metadata grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-8" />
        </div>
      </div>

      {/* Steps skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <div className="space-y-3">
          <StepSkeleton />
          <StepSkeleton />
          <StepSkeleton />
        </div>
      </div>
    </motion.div>
  );
}

// Group steps: pair tool_calls with their tool_results, identify final response
function groupSteps(steps: AgentStep[]): GroupedStep[] {
  const grouped: GroupedStep[] = [];
  const toolCallMap = new Map<string, GroupedToolCall>();
  
  // First pass: create tool call entries and map by toolCallId
  for (const step of steps) {
    if (step.type === "tool_call") {
      const toolStep: GroupedToolCall = {
        type: "tool",
        toolName: step.toolName || "unknown",
        toolCallId: step.toolCallId,
        args: step.toolArgs,
        stepIndex: step.stepIndex,
      };
      
      if (step.toolCallId) {
        toolCallMap.set(step.toolCallId, toolStep);
      }
      grouped.push(toolStep);
    } else if (step.type === "tool_result") {
      // Find matching tool call by toolCallId
      if (step.toolCallId && toolCallMap.has(step.toolCallId)) {
        const toolStep = toolCallMap.get(step.toolCallId)!;
        toolStep.result = step.toolResult;
      } else {
        // Fallback: create standalone result (shouldn't happen normally)
        grouped.push({
          type: "tool",
          toolName: step.toolName || "unknown",
          toolCallId: step.toolCallId,
          result: step.toolResult,
          stepIndex: step.stepIndex,
        });
      }
    } else if (step.type === "text" && step.text) {
      grouped.push({
        type: "text",
        text: step.text,
        stepIndex: step.stepIndex,
        isFinalResponse: false, // Will be set below
      });
    }
  }
  
  // Mark the last text step as the final response
  for (let i = grouped.length - 1; i >= 0; i--) {
    if (grouped[i].type === "text") {
      (grouped[i] as TextStep).isFinalResponse = true;
      break;
    }
  }
  
  return grouped;
}

function RunDetail({ runId }: { runId: string }) {
  const run = useQuery(api.agentLogs.getRun, { runId }) as RunWithSteps | null | undefined;

  if (run === undefined) {
    return <RunDetailSkeleton />;
  }

  if (run === null) {
    return <div className="p-4 text-muted-foreground">Run not found</div>;
  }

  const groupedSteps = groupSteps(run.steps);

  return (
    <motion.div 
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground text-xs uppercase font-medium tracking-wide">Duration</span>
          <p className="font-medium">{formatDuration(run.durationMs)}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs uppercase font-medium tracking-wide">Steps</span>
          <p className="font-medium">{groupedSteps.length}</p>
        </div>
        {/* {run.imageCount && run.imageCount > 0 && (
          <div>
            <span className="text-muted-foreground text-xs uppercase font-medium tracking-wide">Images</span>
            <p className="font-medium">{run.imageCount}</p>
          </div>
        )} */}
      </div>
      {run.errorMessage && (
        <div>
          <h4 className="text-xs text-destructive uppercase font-medium tracking-wide mb-1">Error</h4>
          <p className="text-sm text-destructive">{run.errorMessage}</p>
        </div>
      )}

      <div>
        <h4 className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-2">
          Execution Trace
        </h4>
        <div className="space-y-3">
          {groupedSteps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.05 }}
            >
              <GroupedStepCard step={step} />
            </motion.div>
          ))}
          {groupedSteps.length === 0 && (
            <p className="text-sm text-muted-foreground">No steps recorded</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function RunListItem({ run, isExpanded, onToggle }: { 
  run: AgentRun; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card 
      size="sm" 
      className="cursor-pointer transition-colors hover:bg-muted/50 rounded-xl"
      onClick={onToggle}
    >
      <CardHeader className="max-w-full">
        <div className="flex flex-col justify-start items-start gap-2 w-full">
            <div className="flex items-center justify-between gap-2 max-w-full w-full">
              <CardTitle className="text-base font-medium truncate flex-1 min-w-0">
                {truncateText(run.prompt, 70)}
              </CardTitle>
              <StatusBadge status={run.status}  />
            </div>

              <div className="flex items-center justify-between gap-2 flex-wrap text-muted-foreground w-full">
                {run.userName && run.channelName && <span>{run.userName} in #{run.channelName}</span>}
                
                <span className="text-muted-foreground text-xs">{formatTimestamp(run.createdAt)}</span>
              </div>
                

          
        </div>
      </CardHeader>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <CardContent>
              <RunDetail runId={run.runId} />
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function RunList() {
  const runs = useQuery(api.agentLogs.listRuns, { limit: 50 }) as AgentRun[] | undefined;
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (runs === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading runs...</div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-1">No agent runs yet</h3>
          <p className="text-muted-foreground">
            Agent runs will appear here once the bot processes messages.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <RunListItem
          key={run._id}
          run={run}
          isExpanded={expandedRunId === run.runId}
          onToggle={() => setExpandedRunId(
            expandedRunId === run.runId ? null : run.runId
          )}
        />
      ))}
    </div>
  );
}

export default function ObservabilityPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 sm:max-w-2xl">
        <div className="mb-8">
          <h1 className="text-4xl font-medium tracking-tight mb-2">IBOT Runs</h1>
          <p className="text-muted-foreground">
            Monitor and debug agent runs, tool calls, and responses.
          </p>
        </div>

        <RunList />
      </div>
    </div>
  );
}

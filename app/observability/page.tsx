"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpinnerGapIcon, WarningOctagonIcon, CheckCircleIcon } from "@phosphor-icons/react";
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
  toolArgs?: string;
  toolResult?: string;
  text?: string;
  createdAt: number;
};

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

function StepCard({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false);

  const getStepIcon = () => {
    switch (step.type) {
      case "tool_call":
        return "🔧";
      case "tool_result":
        return "📤";
      case "text":
        return "💬";
    }
  };

  const getStepTitle = () => {
    switch (step.type) {
      case "tool_call":
        return `${step.toolName}`;
      case "tool_result":
        return `${step.toolName} Result`;
      case "text":
        return "Text Output";
    }
  };

  const getContentLabel = () => {
    switch (step.type) {
      case "tool_call":
        return "Arguments:";
      case "tool_result":
        return "Result:";
      case "text":
        return null;
    }
  };

  const getContent = () => {
    switch (step.type) {
      case "tool_call":
        return formatJson(step.toolArgs);
      case "tool_result":
        return formatJson(step.toolResult);
      case "text":
        return step.text;
    }
  };

  const content = getContent();
  const contentLabel = getContentLabel();
  const formattedContent = content ? (
    <div>
      {contentLabel && (
        <span className="text-xs text-muted-foreground font-medium">{contentLabel}</span>
      )}
      <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded overflow-auto max-h-96 font-mono mt-1">
        {expanded ? content : truncateText(content, 500)}
      </pre>
    </div>
  ) : null;

  const needsExpansion = content && content.length > 500;

  return (
    <div className="border-l-2 border-muted pl-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span>{getStepIcon()}</span>
        <span className="font-medium text-sm">{getStepTitle()}</span>
        <span className="text-xs text-muted-foreground">Step {step.stepIndex}</span>
      </div>
      {formattedContent}
      {needsExpansion && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setExpanded(!expanded)}
          className="mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const run = useQuery(api.agentLogs.getRun, { runId }) as RunWithSteps | null | undefined;

  if (run === undefined) {
    return <div className="p-4 text-muted-foreground">Loading...</div>;
  }

  if (run === null) {
    return <div className="p-4 text-muted-foreground">Run not found</div>;
  }

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-md">
      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {run.userName && (
          <div>
            <span className="text-muted-foreground text-xs">User</span>
            <p className="font-medium">{run.userName}</p>
            {run.userId && <p className="text-xs text-muted-foreground">{run.userId}</p>}
          </div>
        )}
        {run.channelName && (
          <div>
            <span className="text-muted-foreground text-xs">Channel</span>
            <p className="font-medium">#{run.channelName}</p>
            {run.isThread && <p className="text-xs text-muted-foreground">In thread</p>}
          </div>
        )}
        <div>
          <span className="text-muted-foreground text-xs">Duration</span>
          <p className="font-medium">{formatDuration(run.durationMs)}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Steps</span>
          <p className="font-medium">{run.stepCount}</p>
        </div>
        {run.imageCount && run.imageCount > 0 && (
          <div>
            <span className="text-muted-foreground text-xs">Images</span>
            <p className="font-medium">{run.imageCount}</p>
          </div>
        )}
      </div>

      <div>
        <h4 className="font-medium text-sm text-muted-foreground mb-1">Full Prompt</h4>
        <p className="text-sm">{run.prompt}</p>
      </div>

      {run.response && (
        <div>
          <h4 className="font-medium text-sm text-muted-foreground mb-1">Response</h4>
          <p className="text-sm whitespace-pre-wrap">{run.response}</p>
        </div>
      )}

      {run.errorMessage && (
        <div>
          <h4 className="font-medium text-sm text-destructive mb-1">Error</h4>
          <p className="text-sm text-destructive">{run.errorMessage}</p>
        </div>
      )}

      <div>
        <h4 className="font-medium text-sm text-muted-foreground mb-2">
          Steps ({run.steps.length})
        </h4>
        <div className="space-y-2">
          {run.steps.map((step) => (
            <StepCard key={step._id} step={step} />
          ))}
          {run.steps.length === 0 && (
            <p className="text-sm text-muted-foreground">No steps recorded</p>
          )}
        </div>
      </div>
    </div>
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
      <CardHeader className="">
        <div className="flex flex-col justify-start items-start gap-2">

            <CardTitle className="text-base font-medium truncate flex items-center justify-between gap-2 w-full">
              {truncateText(run.prompt, 80)}
              <div className="flex min-w-10 items-start justify-end gap-2">
            <StatusBadge status={run.status} />
          </div>
            </CardTitle>

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

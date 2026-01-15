"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
  const variants: Record<typeof status, "default" | "secondary" | "destructive"> = {
    running: "secondary",
    completed: "default",
    error: "destructive",
  };

  const labels: Record<typeof status, string> = {
    running: "Running",
    completed: "Completed",
    error: "Error",
  };

  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
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
        return `Tool Call: ${step.toolName}`;
      case "tool_result":
        return `Tool Result: ${step.toolName}`;
      case "text":
        return "Text Output";
    }
  };

  const getContent = () => {
    switch (step.type) {
      case "tool_call":
        return step.toolArgs;
      case "tool_result":
        return step.toolResult;
      case "text":
        return step.text;
    }
  };

  const content = getContent();
  const formattedContent = content ? (
    <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded overflow-auto max-h-96">
      {expanded ? content : truncateText(content, 200)}
    </pre>
  ) : null;

  const needsExpansion = content && content.length > 200;

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
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
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
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium truncate">
              {truncateText(run.prompt, 80)}
            </CardTitle>
            <CardDescription className="mt-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span>{formatTimestamp(run.createdAt)}</span>
                <span className="text-muted-foreground">|</span>
                <span>Team: {run.teamId}</span>
                <span className="text-muted-foreground">|</span>
                <span>{run.stepCount} steps</span>
                <span className="text-muted-foreground">|</span>
                <span>{formatDuration(run.durationMs)}</span>
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <Button variant="outline" size="sm" onClick={onToggle}>
              {isExpanded ? "Collapse" : "Expand"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <RunDetail runId={run.runId} />
        </CardContent>
      )}
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
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Agent Observability</h1>
          <p className="text-muted-foreground">
            Monitor and debug agent runs, tool calls, and responses.
          </p>
        </div>

        <RunList />
      </div>
    </div>
  );
}

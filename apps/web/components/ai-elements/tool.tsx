"use client";

import { cn } from "@lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { Badge } from "@ui/components/badge";
import { ScrollArea } from "@ui/components/scroll-area";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Loader2,
  Sparkles,
} from "lucide-react";

type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

export function Tool({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Collapsible>) {
  return (
    <Collapsible
      className={cn(
        "rounded-lg border border-border/60 bg-muted/40 text-sm",
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible>
  );
}

interface ToolHeaderProps
  extends React.ComponentPropsWithoutRef<typeof CollapsibleTrigger> {
  type: string;
  state: ToolState;
}

export function ToolHeader({
  className,
  type,
  state,
  children,
  ...props
}: ToolHeaderProps) {
  const { icon: Icon, label, badgeVariant } = getStateMeta(state);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
        "font-medium text-foreground",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        <Icon className={cn("size-4", state === "input-streaming" && "animate-spin")}
        />
        <span>{formatToolType(type)}</span>
      </span>
      <span className="flex items-center gap-2">
        <Badge variant={badgeVariant} className="text-[10px] uppercase tracking-wide">
          {label}
        </Badge>
        <ChevronDown className="size-4 transition-transform data-[state=open]:rotate-180" />
      </span>
      {children}
    </CollapsibleTrigger>
  );
}

export function ToolContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        "overflow-hidden border-t border-border/50 bg-background/60",
        className,
      )}
      {...props}
    >
      <ScrollArea className="max-h-80">
        <div className="px-3 py-3 space-y-3 text-sm text-muted-foreground">
          {children}
        </div>
      </ScrollArea>
    </CollapsibleContent>
  );
}

export function ToolInput({
  input,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { input: unknown }) {
  if (input == null) return null;
  return (
    <div className={cn("space-y-1", className)} {...props}>
      <p className="text-xs uppercase text-muted-foreground/80">Input</p>
      <pre className="whitespace-pre-wrap rounded-md bg-muted/80 px-3 py-2 text-xs text-foreground">
        {formatJSON(input)}
      </pre>
    </div>
  );
}

interface ToolOutputProps extends React.HTMLAttributes<HTMLDivElement> {
  output?: React.ReactNode;
  errorText?: string | null;
}

export function ToolOutput({
  output,
  errorText,
  className,
  ...props
}: ToolOutputProps) {
  if (!output && !errorText) return null;
  return (
    <div className={cn("space-y-1", className)} {...props}>
      <p className="text-xs uppercase text-muted-foreground/80">Output</p>
      {errorText ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorText}
        </div>
      ) : (
        <div className="rounded-md border border-border/50 bg-muted/80 px-3 py-2 text-xs text-foreground">
          {output}
        </div>
      )}
    </div>
  );
}

function getStateMeta(state: ToolState) {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return { icon: Loader2, label: "Running", badgeVariant: "secondary" as const };
    case "output-available":
      return { icon: CheckCircle2, label: "Completed", badgeVariant: "default" as const };
    case "output-error":
      return { icon: CircleAlert, label: "Error", badgeVariant: "destructive" as const };
    default:
      return { icon: Sparkles, label: state, badgeVariant: "secondary" as const };
  }
}

function formatToolType(type: string): string {
  return type
    .replace(/^tool-/, "")
    .replace(/^mcp__/, "")
    .split("__")
    .filter(Boolean)
    .map((segment) => segment.replace(/_/g, " "))
    .join(" • ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatJSON(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}


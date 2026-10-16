import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function hasAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export const CLAUDE_MODEL = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const ANALYSIS_MODEL = () => process.env.ANALYSIS_MODEL || "claude-opus-5-5";

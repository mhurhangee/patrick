/**
 * @eigenpal/docx-editor-agents/react
 *
 * React entry. Hooks, components, and types that need React as a peer
 * dependency. Pair with `/server` (or `/ai-sdk/server`) for the API route
 * that drives the LLM.
 *
 * @example
 * ```tsx
 * import { useDocxAgentTools } from '@eigenpal/docx-editor-agents/react';
 *
 * const { tools, executeToolCall, getContext } = useDocxAgentTools({
 *   editorRef,
 *   author: 'Assistant',
 * });
 * ```
 *
 * @packageDocumentation
 * @public
 */

export { useDocxAgentTools } from './useDocxAgentTools';
export type {
  UseDocxAgentToolsOptions,
  UseDocxAgentToolsReturn,
  AgentContextSnapshot,
} from './useDocxAgentTools';

export type { AgentToolDefinition, AgentToolResult } from './tools';
export { getToolDisplayName } from './tools';
export type { EditorRefLike } from './bridge';

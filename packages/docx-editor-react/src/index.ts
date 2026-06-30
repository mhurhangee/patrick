/**
 * @eigenpal/docx-editor-react
 *
 * Root entry for the React editor: the `DocxEditor` component + its imperative
 * `DocxEditorRef`. The advanced plugin surface stays public through an explicit
 * subpath:
 * - `@eigenpal/docx-editor-react/plugin-api`
 *
 * Framework-agnostic document utilities (document factories, etc.) live in
 * `@eigenpal/docx-editor-core`. Agent/MCP surfaces live in
 * `@eigenpal/docx-editor-agents`.
 *
 * @packageDocumentation
 * @public
 */

export { DocxEditor, type DocxEditorRef } from './components/editor/docx-editor';

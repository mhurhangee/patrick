import { defineConfig } from 'tsup';

// Tsup builds the three entries Patrick consumes: the headless `server`
// (DocxReviewer + tool schemas), the `react` hook (useDocxAgentTools), and the
// `ai-sdk/server` adapter (getAiSdkTools). `bridge.ts` is bundled into `react`
// (not its own entry); the old root/mcp/ai-sdk-react entries were pruned.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    react: 'src/react.ts',
    'ai-sdk/server': 'src/ai-sdk/server.ts',
  },
  format: ['cjs', 'esm'],
  dts: { resolve: true },
  tsconfig: 'tsconfig.tsup.json',
  splitting: true,
  sourcemap: false,
  clean: true,
  treeshake: {
    preset: 'smallest',
  },
  minify: true,
  noExternal: ['@eigenpal/docx-editor-core'],
  external: ['prosemirror-model', 'prosemirror-state', 'prosemirror-view', 'react', 'ai'],
});

/**
 * Shared constants and run-type guards used across the renderParagraph
 * sub-modules (runs, line, and the orchestrator).
 */

import type {
  Run,
  TextRun,
  TabRun,
  ImageRun,
  LineBreakRun,
  FieldRun,
} from '../../layout-engine/types';

/**
 * CSS class names for paragraph rendering
 */
export const PARAGRAPH_CLASS_NAMES = {
  fragment: 'layout-paragraph',
  line: 'layout-line',
  run: 'layout-run',
  text: 'layout-run-text',
  tab: 'layout-run-tab',
  image: 'layout-run-image',
  lineBreak: 'layout-run-linebreak',
};

export function isTextRun(run: Run): run is TextRun {
  return run.kind === 'text';
}

export function isTabRun(run: Run): run is TabRun {
  return run.kind === 'tab';
}

export function isImageRun(run: Run): run is ImageRun {
  return run.kind === 'image';
}

export function isLineBreakRun(run: Run): run is LineBreakRun {
  return run.kind === 'lineBreak';
}

export function isFieldRun(run: Run): run is FieldRun {
  return run.kind === 'field';
}

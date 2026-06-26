/**
 * ProseMirror Commands
 *
 * Commands for formatting text and paragraphs.
 * @packageDocumentation
 * @public
 */

// Text formatting
export {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleSuperscript,
  toggleSubscript,
  setTextColor,
  clearTextColor,
  setHighlight,
  clearHighlight,
  setFontSize,
  clearFontSize,
  setFontFamily,
  clearFontFamily,
  setUnderlineStyle,
  clearFormatting,
  isMarkActive,
  getMarkAttr,
  createSetMarkCommand,
  createRemoveMarkCommand,
  // Hyperlink commands
  isHyperlinkActive,
  getHyperlinkAttrs,
  getSelectedText,
  findHyperlinkRangeAt,
  setHyperlink,
  removeHyperlink,
  insertHyperlink,
} from './formatting';

// Paragraph formatting
export {
  setAlignment,
  alignLeft,
  alignCenter,
  alignRight,
  alignJustify,
  setLineSpacing,
  singleSpacing,
  oneAndHalfSpacing,
  doubleSpacing,
  increaseIndent,
  decreaseIndent,
  setIndentLeft,
  setIndentRight,
  setIndentFirstLine,
  addTabStop,
  removeTabStop,
  toggleBulletList,
  toggleNumberedList,
  increaseListLevel,
  decreaseListLevel,
  removeList,
  setSpaceBefore,
  setSpaceAfter,
  getParagraphAlignment,
  getParagraphBidi,
  isInList,
  getListInfo,
  applyStyle,
  clearStyle,
  getStyleId,
  setRtl,
  setLtr,
} from './paragraph';
export type { ResolvedStyleAttrs } from './paragraph';

// Table operations
export {
  isInTable,
  getTableContext,
  insertTable,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  deleteTable,
  selectTable,
  selectRow,
  selectColumn,
  mergeCells,
  splitCell,
  setTableBorders,
  removeTableBorders,
  setAllTableBorders,
  setOutsideTableBorders,
  setInsideTableBorders,
  setCellBorder,
  setCellVerticalAlign,
  setCellMargins,
  setCellTextDirection,
  toggleNoWrap,
  setRowHeight,
  toggleHeaderRow,
  distributeColumns,
  autoFitContents,
  setTableProperties,
  applyTableStyle,
  setCellFillColor,
  setTableBorderColor,
  setTableBorderWidth,
} from './table';
export type { TableContextInfo, BorderPreset } from './table';

// Page break
export { insertPageBreak } from './pageBreak';

// Section breaks
export { insertSectionBreakNextPage, insertSectionBreakContinuous } from './sectionBreak';

// Image commands
export {
  setImageWrapType,
  insertImageNode,
  insertImageFromFile,
  INSERT_IMAGE_MAX_WIDTH_PX,
} from './image';
export type { AnchorWrapType, ImageLayoutTarget, SetImageWrapTypeOptions } from './image';

// Table of Contents
export { generateTOC } from './paragraph';

// Comments and Track Changes
export {
  addCommentMark,
  removeCommentMark,
  acceptChange,
  rejectChange,
  acceptChangeById,
  rejectChangeById,
  acceptAllChanges,
  rejectAllChanges,
  findNextChange,
  findPreviousChange,
} from './comments';

// Table split
export { getSplitCellDialogConfig, splitActiveTableCell } from './tableSplit';
export type { SplitCellDialogConfig } from './tableSplit';

// Watermark
export { setWatermark, getWatermarkFromState } from './watermark';

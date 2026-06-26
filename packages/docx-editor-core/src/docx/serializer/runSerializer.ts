/**
 * Run Serializer - Serialize runs to OOXML XML
 *
 * Converts Run objects back to <w:r> XML format for DOCX files.
 * Handles all formatting properties and content types.
 *
 * OOXML Reference:
 * - Run: w:r
 * - Run properties: w:rPr
 * - Text content: w:t
 */

import type {
  Run,
  RunContent,
  TextContent,
  TabContent,
  BreakContent,
  SymbolContent,
  NoteReferenceContent,
  FieldCharContent,
  InstrTextContent,
  SoftHyphenContent,
  NoBreakHyphenContent,
  TextFormatting,
  ColorValue,
  ShadingProperties,
  RunPropertyChange,
} from '../../types/document';
import { escapeXml, intAttr } from './xmlUtils';
import { serializeDrawingContent, serializeShapeContent } from './runSerializer/drawing';

export { resetAutoIdCounter } from './runSerializer/drawing';

/** Valid OOXML highlight color names (ECMA-376 §17.18.40) */
const VALID_HIGHLIGHT_COLORS = new Set([
  'black',
  'blue',
  'cyan',
  'darkBlue',
  'darkCyan',
  'darkGray',
  'darkGreen',
  'darkMagenta',
  'darkRed',
  'darkYellow',
  'green',
  'lightGray',
  'magenta',
  'red',
  'white',
  'yellow',
]);

// ============================================================================
// COLOR SERIALIZATION
// ============================================================================

/**
 * Serialize a color element (w:color)
 */
function serializeColorElement(color: ColorValue | undefined): string {
  if (!color) return '';

  const attrs: string[] = [];

  if (color.auto) {
    attrs.push('w:val="auto"');
  } else if (color.rgb) {
    attrs.push(`w:val="${color.rgb}"`);
  }

  if (color.themeColor) {
    attrs.push(`w:themeColor="${color.themeColor}"`);
  }

  if (color.themeTint) {
    attrs.push(`w:themeTint="${color.themeTint}"`);
  }

  if (color.themeShade) {
    attrs.push(`w:themeShade="${color.themeShade}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:color ${attrs.join(' ')}/>`;
}

// ============================================================================
// SHADING SERIALIZATION
// ============================================================================

/**
 * Serialize shading properties (w:shd)
 */
function serializeShading(shading: ShadingProperties | undefined): string {
  if (!shading) return '';

  const attrs: string[] = [];

  // Pattern/val
  if (shading.pattern) {
    attrs.push(`w:val="${shading.pattern}"`);
  } else {
    attrs.push('w:val="clear"');
  }

  // Color (pattern color)
  if (shading.color?.rgb) {
    attrs.push(`w:color="${shading.color.rgb}"`);
  } else if (shading.color?.auto) {
    attrs.push('w:color="auto"');
  }

  // Fill (background color)
  if (shading.fill?.rgb) {
    attrs.push(`w:fill="${shading.fill.rgb}"`);
  } else if (shading.fill?.auto) {
    attrs.push('w:fill="auto"');
  }

  // Theme fill
  if (shading.fill?.themeColor) {
    attrs.push(`w:themeFill="${shading.fill.themeColor}"`);
  }

  if (shading.fill?.themeTint) {
    attrs.push(`w:themeFillTint="${shading.fill.themeTint}"`);
  }

  if (shading.fill?.themeShade) {
    attrs.push(`w:themeFillShade="${shading.fill.themeShade}"`);
  }

  if (attrs.length === 0) return '';

  return `<w:shd ${attrs.join(' ')}/>`;
}

// ============================================================================
// TEXT FORMATTING SERIALIZATION
// ============================================================================

/**
 * Serialize text formatting properties to w:rPr XML
 */
export function serializeTextFormatting(formatting: TextFormatting | undefined): string {
  if (!formatting) return '';

  const parts: string[] = [];

  // Style reference (must be first)
  if (formatting.styleId) {
    parts.push(`<w:rStyle w:val="${escapeXml(formatting.styleId)}"/>`);
  }

  // Font family (w:rFonts)
  if (formatting.fontFamily) {
    const fontAttrs: string[] = [];
    if (formatting.fontFamily.ascii) {
      fontAttrs.push(`w:ascii="${escapeXml(formatting.fontFamily.ascii)}"`);
    }
    if (formatting.fontFamily.hAnsi) {
      fontAttrs.push(`w:hAnsi="${escapeXml(formatting.fontFamily.hAnsi)}"`);
    }
    if (formatting.fontFamily.eastAsia) {
      fontAttrs.push(`w:eastAsia="${escapeXml(formatting.fontFamily.eastAsia)}"`);
    }
    if (formatting.fontFamily.cs) {
      fontAttrs.push(`w:cs="${escapeXml(formatting.fontFamily.cs)}"`);
    }
    if (formatting.fontFamily.asciiTheme) {
      fontAttrs.push(`w:asciiTheme="${formatting.fontFamily.asciiTheme}"`);
    }
    if (formatting.fontFamily.hAnsiTheme) {
      fontAttrs.push(`w:hAnsiTheme="${formatting.fontFamily.hAnsiTheme}"`);
    }
    if (formatting.fontFamily.eastAsiaTheme) {
      fontAttrs.push(`w:eastAsiaTheme="${formatting.fontFamily.eastAsiaTheme}"`);
    }
    if (formatting.fontFamily.csTheme) {
      fontAttrs.push(`w:csTheme="${formatting.fontFamily.csTheme}"`);
    }
    if (fontAttrs.length > 0) {
      parts.push(`<w:rFonts ${fontAttrs.join(' ')}/>`);
    }
  }

  // Bold
  if (formatting.bold === true) {
    parts.push('<w:b/>');
  } else if (formatting.bold === false) {
    parts.push('<w:b w:val="0"/>');
  }

  if (formatting.boldCs === true) {
    parts.push('<w:bCs/>');
  } else if (formatting.boldCs === false) {
    parts.push('<w:bCs w:val="0"/>');
  }

  // Italic
  if (formatting.italic === true) {
    parts.push('<w:i/>');
  } else if (formatting.italic === false) {
    parts.push('<w:i w:val="0"/>');
  }

  if (formatting.italicCs === true) {
    parts.push('<w:iCs/>');
  } else if (formatting.italicCs === false) {
    parts.push('<w:iCs w:val="0"/>');
  }

  // Caps. These character-formatting toggles use the same explicit-false
  // pattern as bold/italic above: an explicit `w:val="0"` cancels a value
  // inherited from the style, so emitting nothing for `false` would silently
  // re-inherit it on round-trip.
  if (formatting.allCaps === true) {
    parts.push('<w:caps/>');
  } else if (formatting.allCaps === false) {
    parts.push('<w:caps w:val="0"/>');
  }

  if (formatting.smallCaps === true) {
    parts.push('<w:smallCaps/>');
  } else if (formatting.smallCaps === false) {
    parts.push('<w:smallCaps w:val="0"/>');
  }

  // Strike
  if (formatting.strike === true) {
    parts.push('<w:strike/>');
  } else if (formatting.strike === false) {
    parts.push('<w:strike w:val="0"/>');
  }

  if (formatting.doubleStrike === true) {
    parts.push('<w:dstrike/>');
  } else if (formatting.doubleStrike === false) {
    parts.push('<w:dstrike w:val="0"/>');
  }

  // Outline
  if (formatting.outline === true) {
    parts.push('<w:outline/>');
  } else if (formatting.outline === false) {
    parts.push('<w:outline w:val="0"/>');
  }

  // Shadow
  if (formatting.shadow === true) {
    parts.push('<w:shadow/>');
  } else if (formatting.shadow === false) {
    parts.push('<w:shadow w:val="0"/>');
  }

  // Emboss
  if (formatting.emboss === true) {
    parts.push('<w:emboss/>');
  } else if (formatting.emboss === false) {
    parts.push('<w:emboss w:val="0"/>');
  }

  // Imprint
  if (formatting.imprint === true) {
    parts.push('<w:imprint/>');
  } else if (formatting.imprint === false) {
    parts.push('<w:imprint w:val="0"/>');
  }

  // Hidden
  if (formatting.hidden === true) {
    parts.push('<w:vanish/>');
  } else if (formatting.hidden === false) {
    parts.push('<w:vanish w:val="0"/>');
  }

  // Color
  const colorXml = serializeColorElement(formatting.color);
  if (colorXml) {
    parts.push(colorXml);
  }

  // Spacing
  if (formatting.spacing !== undefined) {
    parts.push(`<w:spacing w:val="${intAttr(formatting.spacing)}"/>`);
  }

  // Scale (w:w)
  if (formatting.scale !== undefined) {
    parts.push(`<w:w w:val="${intAttr(formatting.scale)}"/>`);
  }

  // Kerning
  if (formatting.kerning !== undefined) {
    parts.push(`<w:kern w:val="${intAttr(formatting.kerning)}"/>`);
  }

  // Position
  if (formatting.position !== undefined) {
    parts.push(`<w:position w:val="${intAttr(formatting.position)}"/>`);
  }

  // Font size
  if (formatting.fontSize !== undefined) {
    parts.push(`<w:sz w:val="${intAttr(formatting.fontSize)}"/>`);
  }

  if (formatting.fontSizeCs !== undefined) {
    parts.push(`<w:szCs w:val="${intAttr(formatting.fontSizeCs)}"/>`);
  }

  // Highlight — emit valid OOXML named colors via w:highlight,
  // fall back to w:shd for custom hex colors
  if (formatting.highlight && formatting.highlight !== 'none') {
    if (VALID_HIGHLIGHT_COLORS.has(formatting.highlight)) {
      parts.push(`<w:highlight w:val="${formatting.highlight}"/>`);
    } else if (!formatting.shading) {
      // Custom color not in OOXML predefined set — use w:shd as fallback.
      // Only emit if value looks like a valid hex color.
      const hex = formatting.highlight.replace(/^#/, '');
      if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex}"/>`);
      }
    }
  }

  // Underline
  if (formatting.underline) {
    const uAttrs: string[] = [`w:val="${formatting.underline.style}"`];
    if (formatting.underline.color) {
      if (formatting.underline.color.rgb) {
        uAttrs.push(`w:color="${formatting.underline.color.rgb}"`);
      }
      if (formatting.underline.color.themeColor) {
        uAttrs.push(`w:themeColor="${formatting.underline.color.themeColor}"`);
      }
      if (formatting.underline.color.themeTint) {
        uAttrs.push(`w:themeTint="${formatting.underline.color.themeTint}"`);
      }
      if (formatting.underline.color.themeShade) {
        uAttrs.push(`w:themeShade="${formatting.underline.color.themeShade}"`);
      }
    }
    parts.push(`<w:u ${uAttrs.join(' ')}/>`);
  }

  // Effect
  if (formatting.effect && formatting.effect !== 'none') {
    parts.push(`<w:effect w:val="${formatting.effect}"/>`);
  }

  // Emphasis mark
  if (formatting.emphasisMark && formatting.emphasisMark !== 'none') {
    parts.push(`<w:em w:val="${formatting.emphasisMark}"/>`);
  }

  // Shading
  const shadingXml = serializeShading(formatting.shading);
  if (shadingXml) {
    parts.push(shadingXml);
  }

  // Vertical alignment
  if (formatting.vertAlign && formatting.vertAlign !== 'baseline') {
    parts.push(`<w:vertAlign w:val="${formatting.vertAlign}"/>`);
  }

  // RTL and CS — same CT_OnOff explicit-false handling as the toggles above.
  if (formatting.rtl === true) {
    parts.push('<w:rtl/>');
  } else if (formatting.rtl === false) {
    parts.push('<w:rtl w:val="0"/>');
  }

  if (formatting.cs === true) {
    parts.push('<w:cs/>');
  } else if (formatting.cs === false) {
    parts.push('<w:cs w:val="0"/>');
  }

  if (parts.length === 0) return '';

  return `<w:rPr>${parts.join('')}</w:rPr>`;
}

function extractRPrInner(rPrXml: string): string {
  if (!rPrXml.startsWith('<w:rPr>') || !rPrXml.endsWith('</w:rPr>')) {
    return '';
  }
  return rPrXml.slice('<w:rPr>'.length, -'</w:rPr>'.length);
}

function serializeRunPropertyChange(change: RunPropertyChange): string {
  // NOTE: `w:rsid` is NOT an attribute of `CT_TrackChange` (wml.xsd:803),
  // and `CT_RPrChange` (wml.xsd:1820) does not add it. Some legacy code
  // stored it on `PropertyChangeInfo`; strict OOXML readers reject the
  // unknown attribute. Always omit on emit. Matches the
  // paragraphSerializer / tableSerializer fix earlier on this branch.
  const normalizedId = Number.isInteger(change.info.id) && change.info.id >= 0 ? change.info.id : 0;
  const authorCandidate = typeof change.info.author === 'string' ? change.info.author.trim() : '';
  const normalizedAuthor = authorCandidate.length > 0 ? authorCandidate : 'Unknown';
  const normalizedDate = typeof change.info.date === 'string' ? change.info.date.trim() : undefined;
  const attrs = [`w:id="${normalizedId}"`, `w:author="${escapeXml(normalizedAuthor)}"`];

  if (normalizedDate) {
    attrs.push(`w:date="${escapeXml(normalizedDate)}"`);
  }

  const previousRPrXml = serializeTextFormatting(change.previousFormatting) || '<w:rPr/>';
  return `<w:rPrChange ${attrs.join(' ')}>${previousRPrXml}</w:rPrChange>`;
}

function serializeRunProperties(
  formatting: TextFormatting | undefined,
  propertyChanges: RunPropertyChange[] | undefined
): string {
  const currentRPrXml = serializeTextFormatting(formatting);
  const currentInner = currentRPrXml ? extractRPrInner(currentRPrXml) : '';
  const propertyChangeXml = (propertyChanges ?? []).map(serializeRunPropertyChange).join('');
  const combined = `${currentInner}${propertyChangeXml}`;

  if (!combined) {
    return '';
  }

  return `<w:rPr>${combined}</w:rPr>`;
}

// ============================================================================
// RUN CONTENT SERIALIZATION
// ============================================================================

/**
 * Serialize text content (w:t)
 */
function serializeTextContent(content: TextContent): string {
  const needsPreserve =
    content.preserveSpace ||
    content.text.startsWith(' ') ||
    content.text.endsWith(' ') ||
    content.text.includes('  ');

  const spaceAttr = needsPreserve ? ' xml:space="preserve"' : '';

  return `<w:t${spaceAttr}>${escapeXml(content.text)}</w:t>`;
}

/**
 * Serialize tab content (w:tab)
 */
function serializeTabContent(_content: TabContent): string {
  return '<w:tab/>';
}

/**
 * Serialize break content (w:br)
 */
function serializeBreakContent(content: BreakContent): string {
  const attrs: string[] = [];

  if (content.breakType === 'page') {
    attrs.push('w:type="page"');
  } else if (content.breakType === 'column') {
    attrs.push('w:type="column"');
  } else if (content.breakType === 'textWrapping') {
    attrs.push('w:type="textWrapping"');
    if (content.clear && content.clear !== 'none') {
      attrs.push(`w:clear="${content.clear}"`);
    }
  }

  if (attrs.length === 0) {
    return '<w:br/>';
  }

  return `<w:br ${attrs.join(' ')}/>`;
}

/**
 * Serialize symbol content (w:sym)
 */
function serializeSymbolContent(content: SymbolContent): string {
  return `<w:sym w:font="${escapeXml(content.font)}" w:char="${escapeXml(content.char)}"/>`;
}

/**
 * Serialize footnote/endnote reference
 */
function serializeNoteReference(content: NoteReferenceContent): string {
  if (content.type === 'footnoteRef') {
    return `<w:footnoteReference w:id="${content.id}"/>`;
  } else {
    return `<w:endnoteReference w:id="${content.id}"/>`;
  }
}

/**
 * Serialize field character (w:fldChar)
 */
function serializeFieldChar(content: FieldCharContent): string {
  const attrs: string[] = [`w:fldCharType="${content.charType}"`];

  if (content.fldLock) {
    attrs.push('w:fldLock="true"');
  }

  if (content.dirty) {
    attrs.push('w:dirty="true"');
  }

  return `<w:fldChar ${attrs.join(' ')}/>`;
}

/**
 * Serialize field instruction text (w:instrText)
 */
function serializeInstrText(content: InstrTextContent): string {
  const needsPreserve =
    content.text.startsWith(' ') || content.text.endsWith(' ') || content.text.includes('  ');

  const spaceAttr = needsPreserve ? ' xml:space="preserve"' : '';

  return `<w:instrText${spaceAttr}>${escapeXml(content.text)}</w:instrText>`;
}

/**
 * Serialize soft hyphen (w:softHyphen)
 */
function serializeSoftHyphen(_content: SoftHyphenContent): string {
  return '<w:softHyphen/>';
}

/**
 * Serialize non-breaking hyphen (w:noBreakHyphen)
 */
function serializeNoBreakHyphen(_content: NoBreakHyphenContent): string {
  return '<w:noBreakHyphen/>';
}

// DRAWING / IMAGE / SHAPE SERIALIZATION lives in ./runSerializer/drawing.ts.
// serializeDrawingContent and serializeShapeContent are imported above and
// dispatched from serializeRunContent.

/**
 * Serialize a single run content item
 */
function serializeRunContent(content: RunContent): string {
  switch (content.type) {
    case 'text':
      return serializeTextContent(content);
    case 'tab':
      return serializeTabContent(content);
    case 'break':
      return serializeBreakContent(content);
    case 'symbol':
      return serializeSymbolContent(content);
    case 'footnoteRef':
    case 'endnoteRef':
      return serializeNoteReference(content);
    case 'footnoteRefMark':
      return '<w:footnoteRef/>';
    case 'endnoteRefMark':
      return '<w:endnoteRef/>';
    case 'separator':
      return '<w:separator/>';
    case 'continuationSeparator':
      return '<w:continuationSeparator/>';
    case 'fieldChar':
      return serializeFieldChar(content);
    case 'instrText':
      return serializeInstrText(content);
    case 'softHyphen':
      return serializeSoftHyphen(content);
    case 'noBreakHyphen':
      return serializeNoBreakHyphen(content);
    case 'drawing':
      return serializeDrawingContent(content);
    case 'shape':
      return serializeShapeContent(content);
    default:
      return '';
  }
}

// ============================================================================
// MAIN SERIALIZATION
// ============================================================================

/**
 * Serialize a run to OOXML XML (w:r)
 *
 * @param run - The run to serialize
 * @returns XML string for the run
 */
export function serializeRun(run: Run): string {
  const parts: string[] = [];

  // Add run properties if present
  const rPrXml = serializeRunProperties(run.formatting, run.propertyChanges);
  if (rPrXml) {
    parts.push(rPrXml);
  }

  // Add run content
  for (const content of run.content) {
    const contentXml = serializeRunContent(content);
    if (contentXml) {
      parts.push(contentXml);
    }
  }

  return `<w:r>${parts.join('')}</w:r>`;
}

/**
 * Serialize multiple runs to OOXML XML
 *
 * @param runs - The runs to serialize
 * @returns XML string for all runs
 */
export function serializeRuns(runs: Run[]): string {
  return runs.map(serializeRun).join('');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a run has any content
 */
export function hasRunContent(run: Run): boolean {
  return run.content.length > 0;
}

/**
 * Check if a run has formatting
 */
export function hasRunFormatting(run: Run): boolean {
  return run.formatting !== undefined && Object.keys(run.formatting).length > 0;
}

/**
 * Get plain text from a run (for comparison/debugging)
 */
export function getRunPlainText(run: Run): string {
  return run.content
    .filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('');
}

/**
 * Create an empty run
 */
export function createEmptyRun(): Run {
  return {
    type: 'run',
    content: [],
  };
}

/**
 * Create a text run
 */
export function createTextRun(text: string, formatting?: TextFormatting): Run {
  return {
    type: 'run',
    formatting,
    content: [{ type: 'text', text }],
  };
}

/**
 * Create a break run
 */
export function createBreakRun(
  breakType?: 'page' | 'column' | 'textWrapping',
  formatting?: TextFormatting
): Run {
  return {
    type: 'run',
    formatting,
    content: [{ type: 'break', breakType }],
  };
}

/**
 * Create a tab run
 */
export function createTabRun(formatting?: TextFormatting): Run {
  return {
    type: 'run',
    formatting,
    content: [{ type: 'tab' }],
  };
}

export default serializeRun;

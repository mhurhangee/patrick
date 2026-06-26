/**
 * DOCX Repacker - Repack modified document into valid DOCX
 *
 * Takes a Document with modified content and creates a new DOCX file
 * by updating document.xml while preserving all other files from
 * the original ZIP archive.
 *
 * This ensures round-trip fidelity:
 * - styles.xml, theme1.xml, fontTable.xml remain untouched
 * - Media files preserved
 * - Relationships preserved
 * - Only document.xml is updated with new content
 *
 * OOXML Package Structure:
 * - [Content_Types].xml - Content type declarations
 * - _rels/.rels - Package relationships
 * - word/document.xml - Main document (modified)
 * - word/styles.xml - Styles (preserved)
 * - word/theme/theme1.xml - Theme (preserved)
 * - word/numbering.xml - Numbering (preserved)
 * - word/fontTable.xml - Font table (preserved)
 * - word/settings.xml - Settings (preserved)
 * - word/header*.xml - Headers (preserved)
 * - word/footer*.xml - Footers (preserved)
 * - word/footnotes.xml - Footnotes (preserved)
 * - word/endnotes.xml - Endnotes (preserved)
 * - word/media/* - Media files (preserved)
 * - word/_rels/document.xml.rels - Document relationships (preserved)
 * - docProps/* - Document properties (preserved)
 *
 * Orchestrators (repackDocx, selective updates, validation, create-empty)
 * live here. Per-domain helpers — part enumeration, new-image registration,
 * new-hyperlink registration, header/footer & comment packaging, and the
 * empty-DOCX template — live under ./rezip/.
 * @packageDocumentation
 * @public
 */

import JSZip from 'jszip';
import type { Document } from '../types/document';
import { serializeDocument } from './serializer/documentSerializer';
import { type RawDocxContent } from './unzip';
import { escapeXml } from './serializer/xmlUtils';

import { collectParts, findMaxRId } from './rezip/parts';
import {
  processNewImages,
  processNewWatermarkImages,
  getContentTypeForExtension,
} from './rezip/images';
import { processNewHyperlinks } from './rezip/hyperlinks';
import {
  ensureHeaderFooterParts,
  ensureNumberingPart,
  serializeCommentsToZip,
  serializeHeadersFootersToZip,
  serializeFootnotesToZip,
  serializeEndnotesToZip,
} from './rezip/packaging';
import { createEmptyDocx } from './rezip/createEmpty';

// Public re-exports (preserve historical import surface).
export { findMaxRId } from './rezip/parts';
export {
  COMMENTS_CONTENT_TYPE,
  COMMENTS_EXTENDED_CONTENT_TYPE,
  COMMENTS_IDS_CONTENT_TYPE,
  COMMENTS_EXTENSIBLE_CONTENT_TYPE,
  collectHeaderFooterUpdates,
} from './rezip/packaging';
export { createEmptyDocx } from './rezip/createEmpty';

// ============================================================================
// MAIN REPACKER
// ============================================================================

/**
 * Options for repacking DOCX
 */
export interface RepackOptions {
  /** Compression level (0-9, default: 6) */
  compressionLevel?: number;
  /** Whether to update modification date in docProps/core.xml */
  updateModifiedDate?: boolean;
  /** Custom modifier name for lastModifiedBy */
  modifiedBy?: string;
}

/**
 * Repack a Document into a valid DOCX file
 *
 * @param doc - Document with modified content
 * @param options - Optional repack options
 * @returns Promise resolving to DOCX as ArrayBuffer
 * @throws Error if document has no original buffer for round-trip
 */
export async function repackDocx(doc: Document, options: RepackOptions = {}): Promise<ArrayBuffer> {
  // Validate we have an original buffer to base on
  if (!doc.originalBuffer) {
    throw new Error(
      'Cannot repack document: no original buffer for round-trip. ' +
        'Use createDocx() for new documents.'
    );
  }

  const { compressionLevel = 6, updateModifiedDate = true, modifiedBy } = options;
  const exportDocument = doc;

  // Load the original ZIP
  const originalZip = await JSZip.loadAsync(doc.originalBuffer);

  // Create a new ZIP with all original files
  const newZip = new JSZip();

  // Copy all files from original ZIP
  for (const [path, file] of Object.entries(originalZip.files)) {
    // Skip directories
    if (file.dir) {
      newZip.folder(path.replace(/\/$/, ''));
      continue;
    }

    // Get original file content
    const content = await file.async('arraybuffer');

    // Add to new ZIP (we'll update specific files below)
    newZip.file(path, content, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  // Process newly inserted images and hyperlinks across body + headers + footers.
  // Mutates rIds in-place so serializers emit correct references.
  const parts = collectParts(exportDocument);
  await processNewImages(parts, newZip, compressionLevel);
  await processNewWatermarkImages(exportDocument, newZip, compressionLevel);
  await processNewHyperlinks(parts, newZip, compressionLevel);

  // Serialize and update document.xml (after image/hyperlink rIds have been rewritten)
  const documentXml = serializeDocument(exportDocument);
  newZip.file('word/document.xml', documentXml, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  // Serialize and update modified headers/footers
  serializeHeadersFootersToZip(exportDocument, newZip, compressionLevel);

  await ensureHeaderFooterParts(exportDocument, newZip, compressionLevel);

  // Synthesize word/numbering.xml for documents that reference list numIds but
  // have no original numbering part to preserve (e.g. createDocx()).
  await ensureNumberingPart(exportDocument, newZip, compressionLevel);

  // Serialize comments
  await serializeCommentsToZip(exportDocument, newZip, compressionLevel);

  // Serialize footnotes/endnotes (note-body edits + tracked changes)
  serializeFootnotesToZip(exportDocument, newZip, compressionLevel);
  serializeEndnotesToZip(exportDocument, newZip, compressionLevel);

  // Optionally update modification date in docProps/core.xml
  if (updateModifiedDate) {
    const corePropsPath = 'docProps/core.xml';
    const corePropsFile = originalZip.file(corePropsPath);

    if (corePropsFile) {
      const originalCoreProps = await corePropsFile.async('text');
      const updatedCoreProps = updateCoreProperties(originalCoreProps, {
        updateModifiedDate,
        modifiedBy,
      });

      newZip.file(corePropsPath, updatedCoreProps, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });
    }
  }

  // Generate the new DOCX file
  const arrayBuffer = await newZip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  return arrayBuffer;
}

/**
 * Repack a Document using raw content for more control
 *
 * @param doc - Document with modified content
 * @param rawContent - Original raw content from unzipDocx
 * @param options - Optional repack options
 * @returns Promise resolving to DOCX as ArrayBuffer
 */
export async function repackDocxFromRaw(
  doc: Document,
  rawContent: RawDocxContent,
  options: RepackOptions = {}
): Promise<ArrayBuffer> {
  const { compressionLevel = 6, updateModifiedDate = true, modifiedBy } = options;
  const exportDocument = doc;

  // Create a new ZIP with all original files
  const newZip = new JSZip();

  // Copy all files from original ZIP
  for (const [path, file] of Object.entries(rawContent.originalZip.files)) {
    // Skip directories
    if (file.dir) {
      newZip.folder(path.replace(/\/$/, ''));
      continue;
    }

    // Get original file content
    const content = await file.async('arraybuffer');

    // Add to new ZIP
    newZip.file(path, content, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  // Process newly inserted images and hyperlinks across body + headers + footers.
  const parts = collectParts(exportDocument);
  await processNewImages(parts, newZip, compressionLevel);
  await processNewWatermarkImages(exportDocument, newZip, compressionLevel);
  await processNewHyperlinks(parts, newZip, compressionLevel);

  const documentXml = serializeDocument(exportDocument);
  newZip.file('word/document.xml', documentXml, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  // Serialize and update modified headers/footers
  serializeHeadersFootersToZip(exportDocument, newZip, compressionLevel);

  await ensureHeaderFooterParts(exportDocument, newZip, compressionLevel);

  // Synthesize word/numbering.xml for documents that reference list numIds but
  // have no original numbering part to preserve (e.g. createDocx()).
  await ensureNumberingPart(exportDocument, newZip, compressionLevel);

  // Serialize comments
  await serializeCommentsToZip(exportDocument, newZip, compressionLevel);

  // Serialize footnotes/endnotes (note-body edits + tracked changes)
  serializeFootnotesToZip(exportDocument, newZip, compressionLevel);
  serializeEndnotesToZip(exportDocument, newZip, compressionLevel);

  // Optionally update core properties
  if (updateModifiedDate && rawContent.corePropsXml) {
    const updatedCoreProps = updateCoreProperties(rawContent.corePropsXml, {
      updateModifiedDate,
      modifiedBy,
    });

    newZip.file('docProps/core.xml', updatedCoreProps, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  // Generate the new DOCX file
  const arrayBuffer = await newZip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  return arrayBuffer;
}

// ============================================================================
// SELECTIVE UPDATES
// ============================================================================

/**
 * Update only document.xml in a DOCX buffer (minimal changes)
 *
 * @param originalBuffer - Original DOCX as ArrayBuffer
 * @param newDocumentXml - New document.xml content
 * @param options - Optional repack options
 * @returns Promise resolving to DOCX as ArrayBuffer
 */
export async function updateDocumentXml(
  originalBuffer: ArrayBuffer,
  newDocumentXml: string,
  options: RepackOptions = {}
): Promise<ArrayBuffer> {
  const { compressionLevel = 6 } = options;

  // Load original ZIP
  const zip = await JSZip.loadAsync(originalBuffer);

  // Update document.xml
  zip.file('word/document.xml', newDocumentXml, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  // Generate new DOCX
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });
}

/**
 * Update a specific XML file in a DOCX buffer
 *
 * @param originalBuffer - Original DOCX as ArrayBuffer
 * @param path - Path within the ZIP (e.g., "word/styles.xml")
 * @param content - New XML content
 * @param options - Optional repack options
 * @returns Promise resolving to DOCX as ArrayBuffer
 */
export async function updateXmlFile(
  originalBuffer: ArrayBuffer,
  path: string,
  content: string,
  options: RepackOptions = {}
): Promise<ArrayBuffer> {
  const { compressionLevel = 6 } = options;

  const zip = await JSZip.loadAsync(originalBuffer);

  zip.file(path, content, {
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });
}

/**
 * Update multiple files in a DOCX buffer
 *
 * @param originalBuffer - Original DOCX as ArrayBuffer
 * @param updates - Map of path -> content for files to update
 * @param options - Optional repack options
 * @returns Promise resolving to DOCX as ArrayBuffer
 */
export async function updateMultipleFiles(
  originalBuffer: ArrayBuffer,
  updates: Map<string, string | ArrayBuffer>,
  options: RepackOptions = {}
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(originalBuffer);
  return applyUpdatesToZip(zip, updates, options);
}

/**
 * Apply file updates to an already-loaded JSZip instance and generate the output.
 * Use this when the zip is already loaded to avoid a redundant decompression pass.
 */
export async function applyUpdatesToZip(
  zip: JSZip,
  updates: Map<string, string | ArrayBuffer>,
  options: RepackOptions = {}
): Promise<ArrayBuffer> {
  const { compressionLevel = 6 } = options;

  for (const [path, content] of updates) {
    zip.file(path, content, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });
}

// ============================================================================
// RELATIONSHIP MANAGEMENT
// ============================================================================

/**
 * Add a new relationship to document.xml.rels
 *
 * @param originalBuffer - Original DOCX as ArrayBuffer
 * @param relationship - New relationship to add
 * @returns Promise resolving to { buffer: ArrayBuffer, rId: string }
 */
export async function addRelationship(
  originalBuffer: ArrayBuffer,
  relationship: {
    type: string;
    target: string;
    targetMode?: 'External' | 'Internal';
  }
): Promise<{ buffer: ArrayBuffer; rId: string }> {
  const zip = await JSZip.loadAsync(originalBuffer);

  // Read existing relationships
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);

  if (!relsFile) {
    throw new Error('document.xml.rels not found in DOCX');
  }

  const relsXml = await relsFile.async('text');

  // Generate new rId
  const newRId = `rId${findMaxRId(relsXml) + 1}`;

  // Build new relationship element
  const targetModeAttr = relationship.targetMode === 'External' ? ' TargetMode="External"' : '';

  const newRelElement = `<Relationship Id="${newRId}" Type="${relationship.type}" Target="${escapeXml(relationship.target)}"${targetModeAttr}/>`;

  // Insert before closing tag
  const updatedRelsXml = relsXml.replace('</Relationships>', `${newRelElement}</Relationships>`);

  // Update the ZIP
  zip.file(relsPath, updatedRelsXml);

  const buffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { buffer, rId: newRId };
}

/**
 * Add a media file to the DOCX
 *
 * @param originalBuffer - Original DOCX as ArrayBuffer
 * @param filename - Filename for the media (e.g., "image1.png")
 * @param data - Binary data for the media file
 * @param mimeType - MIME type (e.g., "image/png")
 * @returns Promise resolving to { buffer: ArrayBuffer, rId: string, path: string }
 */
export async function addMedia(
  originalBuffer: ArrayBuffer,
  filename: string,
  data: ArrayBuffer,
  mimeType: string
): Promise<{ buffer: ArrayBuffer; rId: string; path: string }> {
  const zip = await JSZip.loadAsync(originalBuffer);

  // Determine media path
  const mediaPath = `word/media/${filename}`;

  // Add media file
  zip.file(mediaPath, data);

  // Add relationship
  const relResult = await addRelationship(await zip.generateAsync({ type: 'arraybuffer' }), {
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    target: `media/${filename}`,
  });

  // Update content types if needed
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const contentTypesXml = await contentTypesFile.async('text');
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    // Check if extension is already registered
    const hasExtension = contentTypesXml.includes(`Extension="${extension}"`);

    if (!hasExtension && extension) {
      // Add content type for this extension
      const contentType = getContentTypeForExtension(extension, mimeType);
      const extensionElement = `<Default Extension="${extension}" ContentType="${contentType}"/>`;

      // Insert after other defaults
      const updatedContentTypes = contentTypesXml.replace(
        '</Types>',
        `${extensionElement}</Types>`
      );

      const finalZip = await JSZip.loadAsync(relResult.buffer);
      finalZip.file('[Content_Types].xml', updatedContentTypes);

      return {
        buffer: await finalZip.generateAsync({
          type: 'arraybuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        }),
        rId: relResult.rId,
        path: mediaPath,
      };
    }
  }

  return {
    buffer: relResult.buffer,
    rId: relResult.rId,
    path: mediaPath,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Update core properties XML with new modification date
 */
export function updateCoreProperties(
  corePropsXml: string,
  options: { updateModifiedDate?: boolean; modifiedBy?: string }
): string {
  let result = corePropsXml;

  if (options.updateModifiedDate) {
    const now = new Date().toISOString();

    // Update dcterms:modified
    if (result.includes('<dcterms:modified')) {
      result = result.replace(
        // `[^<>]*` (not `[^>]*`) for the attribute span: disallowing `<` stops
        // the match from gobbling later `<dcterms:modified` text on malformed
        // core.xml, which is what made this backtrack polynomially.
        /<dcterms:modified[^<>]*>[^<]*<\/dcterms:modified>/,
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`
      );
    } else {
      // Add modified date if not present
      result = result.replace(
        '</cp:coreProperties>',
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
      );
    }
  }

  if (options.modifiedBy) {
    // Update cp:lastModifiedBy
    if (result.includes('<cp:lastModifiedBy')) {
      result = result.replace(
        /<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/,
        `<cp:lastModifiedBy>${escapeXml(options.modifiedBy)}</cp:lastModifiedBy>`
      );
    } else {
      // Add lastModifiedBy if not present
      result = result.replace(
        '</cp:coreProperties>',
        `<cp:lastModifiedBy>${escapeXml(options.modifiedBy)}</cp:lastModifiedBy></cp:coreProperties>`
      );
    }
  }

  return result;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that a buffer is a valid DOCX file
 *
 * @param buffer - Buffer to validate
 * @returns Promise resolving to validation result
 */
export async function validateDocx(buffer: ArrayBuffer): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const zip = await JSZip.loadAsync(buffer);

    // Check for required files
    const requiredFiles = ['[Content_Types].xml', 'word/document.xml'];

    for (const file of requiredFiles) {
      if (!zip.file(file)) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    // Check for recommended files
    const recommendedFiles = ['_rels/.rels', 'word/_rels/document.xml.rels', 'word/styles.xml'];

    for (const file of recommendedFiles) {
      if (!zip.file(file)) {
        warnings.push(`Missing recommended file: ${file}`);
      }
    }

    // Validate document.xml is valid XML
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      const docXml = await docFile.async('text');

      // Basic XML validation
      if (!docXml.includes('<?xml')) {
        warnings.push('document.xml missing XML declaration');
      }

      if (!docXml.includes('<w:document')) {
        errors.push('document.xml missing w:document element');
      }

      if (!docXml.includes('<w:body>')) {
        errors.push('document.xml missing w:body element');
      }
    }

    // Validate Content_Types.xml
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      const ctXml = await ctFile.async('text');

      if (
        !ctXml.includes('word/document.xml') &&
        !ctXml.includes(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
        )
      ) {
        warnings.push('Content_Types.xml may be missing document.xml type declaration');
      }
    }
  } catch (error) {
    errors.push(
      `Failed to read as ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if buffer looks like a DOCX file (quick check)
 *
 * @param buffer - Buffer to check
 * @returns true if buffer starts with ZIP signature
 */
export function isDocxBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;

  const view = new Uint8Array(buffer);

  // ZIP file signature: PK (0x50, 0x4B)
  return view[0] === 0x50 && view[1] === 0x4b;
}

// ============================================================================
// CREATE NEW DOCX
// ============================================================================

/**
 * Create a new DOCX from a Document (without requiring original buffer)
 *
 * @param doc - Document to serialize
 * @returns Promise resolving to DOCX as ArrayBuffer
 */
export async function createDocx(doc: Document): Promise<ArrayBuffer> {
  // Start with an empty DOCX
  const emptyBuffer = await createEmptyDocx();

  // Add document as original buffer
  const docWithBuffer: Document = {
    ...doc,
    originalBuffer: emptyBuffer,
  };

  // Repack with the document content
  return repackDocx(docWithBuffer);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default repackDocx;

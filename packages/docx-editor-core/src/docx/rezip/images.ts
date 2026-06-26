/**
 * New Image Registration
 *
 * On save, scan all parts (body + headers + footers) for images whose `src`
 * is still a data URL — these were inserted in the editor and have no rels
 * entry yet — then write the binary data into `word/media/`, register the
 * relationship, update `[Content_Types].xml` for new extensions, and assign
 * the resulting rId back onto the image so the serializer emits the right
 * `r:embed` reference.
 */

import type JSZip from 'jszip';
import type { BlockContent, Image } from '../../types/content';
import type { Document } from '../../types/document';
import { RELATIONSHIP_TYPES } from '../relsParser';
import { findMaxRId, readRelsOrStub, headerFooterFilename, type Part } from './parts';

/**
 * Get content type for a file extension. Falls back to the provided MIME type
 * when the extension is unknown.
 */
export function getContentTypeForExtension(extension: string, mimeType: string): string {
  // Use provided mime type or fall back to common types
  if (mimeType) return mimeType;

  const contentTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    wmf: 'image/x-wmf',
    emf: 'image/x-emf',
  };

  return contentTypes[extension] || 'application/octet-stream';
}

/**
 * Collect all images with data-URL src from the document content.
 * These are newly inserted images that need to be added to the ZIP.
 */
function collectNewImages(blocks: BlockContent[]): Image[] {
  const images: Image[] = [];

  const collectFromRun = (run: { content: { type: string; image?: Image }[] }): void => {
    for (const c of run.content) {
      if (c.type === 'drawing' && c.image?.src?.startsWith('data:')) {
        images.push(c.image);
      }
    }
  };

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      for (const item of block.content) {
        if (item.type === 'run') {
          collectFromRun(item);
        } else if (
          // A picture inserted/deleted under track changes lives inside an
          // ins/del/move wrapper — descend so its media part still gets written.
          item.type === 'insertion' ||
          item.type === 'deletion' ||
          item.type === 'moveFrom' ||
          item.type === 'moveTo'
        ) {
          for (const sub of item.content) {
            if (sub.type === 'run') collectFromRun(sub);
          }
        }
      }
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          images.push(...collectNewImages(cell.content));
        }
      }
    }
  }

  return images;
}

/** Map MIME type to file extension (inverse of getContentTypeForExtension) */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * Decode a data URL to binary ArrayBuffer and file extension.
 */
function decodeDataUrl(dataUrl: string): { data: ArrayBuffer; extension: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { data: bytes.buffer, extension: MIME_TO_EXT[match[1]] || 'png' };
}

/**
 * Register new image extensions in [Content_Types].xml (idempotent).
 */
async function registerImageExtensions(
  zip: JSZip,
  extensions: Set<string>,
  compressionLevel: number
): Promise<void> {
  if (extensions.size === 0) return;
  const ctFile = zip.file('[Content_Types].xml');
  if (!ctFile) return;

  let ctXml = await ctFile.async('text');
  let changed = false;
  for (const ext of extensions) {
    if (!ctXml.includes(`Extension="${ext}"`)) {
      const contentType = getContentTypeForExtension(ext, '');
      ctXml = ctXml.replace(
        '</Types>',
        `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`
      );
      changed = true;
    }
  }
  if (changed) {
    zip.file('[Content_Types].xml', ctXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }
}

/**
 * Find the highest image number currently used in `word/media/`. Media filenames
 * are a shared package-wide namespace, so a single counter is used across parts.
 */
function findMaxImageNum(zip: JSZip): number {
  let max = 0;
  zip.forEach((relativePath) => {
    const m = relativePath.match(/^word\/media\/image(\d+)\./);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > max) max = num;
    }
  });
  return max;
}

/**
 * Process newly inserted images across all parts (body, headers, footers):
 * add binary data to ZIP, create per-part relationships, update content types,
 * and rewrite rIds so the serializer outputs correct references.
 *
 * Mutates each image's rId in-place.
 */
export async function processNewImages(
  parts: Part[],
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  let maxImageNum = findMaxImageNum(zip);
  const extensionsAdded = new Set<string>();

  for (const { relsPath, blocks } of parts) {
    const images = collectNewImages(blocks);
    if (images.length === 0) continue;

    const relsXml = await readRelsOrStub(zip, relsPath);
    let maxId = findMaxRId(relsXml);
    const relEntries: string[] = [];

    for (const image of images) {
      const { data, extension } = decodeDataUrl(image.src!);

      maxImageNum++;
      maxId++;
      const mediaFilename = `image${maxImageNum}.${extension}`;
      const newRId = `rId${maxId}`;

      zip.file(`word/media/${mediaFilename}`, data, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });

      relEntries.push(
        `<Relationship Id="${newRId}" Type="${RELATIONSHIP_TYPES.image}" Target="media/${mediaFilename}"/>`
      );

      extensionsAdded.add(extension);
      image.rId = newRId;
    }

    const updatedRelsXml = relsXml.replace(
      '</Relationships>',
      relEntries.join('') + '</Relationships>'
    );
    zip.file(relsPath, updatedRelsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  await registerImageExtensions(zip, extensionsAdded, compressionLevel);
}

/** Normalize a rels Target to its `media/<file>` form for comparison. */
function normalizeMediaTarget(target: string): string {
  return target.replace(/^\.?\/?(?:word\/)?/, '');
}

/** Find an existing relationship id in a rels XML whose Target points at `mediaTarget`. */
function findRelIdByMediaTarget(relsXml: string, mediaTarget: string): string | null {
  const want = normalizeMediaTarget(mediaTarget);
  const re = /<Relationship\b[^>]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) !== null) {
    const el = m[0];
    const target = /Target="([^"]*)"/.exec(el)?.[1];
    if (target && normalizeMediaTarget(target) === want) {
      return /Id="([^"]*)"/.exec(el)?.[1] ?? null;
    }
  }
  return null;
}

/**
 * Register picture-watermark images and bind each header's watermark to a
 * relationship that resolves in **that header's** rels.
 *
 * A watermark is applied to several header parts (default/first/even), but a
 * `<v:imagedata r:id>` is a header-part-local reference: the same rId is not
 * valid across parts. So this runs per header and:
 *
 * - leaves a watermark alone when its `relId` already resolves in that header's
 *   rels (parsed-from-file headers, and idempotent re-saves);
 * - otherwise resolves the image bytes (an in-editor `data:` URL written once
 *   per save, or an existing `mediaPath` from the original file) and binds the
 *   watermark to a relationship in that header's rels — reusing an existing rel
 *   to the same media when one is present, else adding a fresh one.
 *
 * Mutates each picture watermark's `relId` in place so the serializer emits a
 * valid `<v:imagedata r:id="...">`.
 */
export async function processNewWatermarkImages(
  doc: Document,
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  const headers = doc.package.headers;
  const rels = doc.package.relationships;
  if (!headers || !rels) return;

  const extensionsAdded = new Set<string>();
  // dataUrl -> media filename, so an image shared across headers is written once.
  const writtenMedia = new Map<string, string>();
  let maxImageNum = findMaxImageNum(zip);

  /** Resolve (and write, if new) the media file this watermark references. */
  function resolveMediaFilename(wm: { mediaPath?: string; dataUrl?: string }): string | null {
    // Existing media already in the package (parsed from the original file).
    if (wm.mediaPath) {
      const fn = wm.mediaPath.split('/').pop();
      if (fn) return fn;
    }
    // New image inserted in the editor — write the binary once, dedup by data URL.
    if (wm.dataUrl && wm.dataUrl.startsWith('data:')) {
      const cached = writtenMedia.get(wm.dataUrl);
      if (cached) return cached;
      const { data, extension } = decodeDataUrl(wm.dataUrl);
      maxImageNum++;
      const fn = `image${maxImageNum}.${extension}`;
      zip.file(`word/media/${fn}`, data, {
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
      });
      extensionsAdded.add(extension);
      writtenMedia.set(wm.dataUrl, fn);
      return fn;
    }
    return null;
  }

  for (const [rId, hf] of headers.entries()) {
    const wm = hf.watermark;
    if (!wm || wm.kind !== 'picture') continue;

    const headerRel = rels.get(rId);
    if (!headerRel?.target) continue;
    const filename = headerFooterFilename(headerRel.target).replace(/^word\//, '');
    const relsPath = `word/_rels/${filename}.rels`;
    const relsXml = await readRelsOrStub(zip, relsPath);

    // Keep the existing relId when it already resolves in this header's rels.
    if (wm.relId && new RegExp(`Id="${wm.relId}"`).test(relsXml)) continue;

    const mediaFilename = resolveMediaFilename(wm);
    if (!mediaFilename) continue;
    const target = `media/${mediaFilename}`;

    const existingRId = findRelIdByMediaTarget(relsXml, target);
    if (existingRId) {
      wm.relId = existingRId;
      continue;
    }

    const newRId = `rId${findMaxRId(relsXml) + 1}`;
    const updatedRelsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${newRId}" Type="${RELATIONSHIP_TYPES.image}" ` +
        `Target="${target}"/></Relationships>`
    );
    zip.file(relsPath, updatedRelsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
    wm.relId = newRId;
  }

  await registerImageExtensions(zip, extensionsAdded, compressionLevel);
}

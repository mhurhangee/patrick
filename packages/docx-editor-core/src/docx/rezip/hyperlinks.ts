/**
 * Hyperlink relationship registration.
 *
 * On save, scan every part (body, headers, footers, footnotes, endnotes) for
 * external hyperlinks and ensure each emitted rId resolves to a matching
 * relationship in the owning part's rels file:
 *   - newly created links (href, no rId) get a fresh relationship,
 *   - links whose href changed are rebound to a matching or new relationship,
 *   - links whose rId no longer resolves and have no href are dropped.
 *
 * Internal-target relationships (TargetMode != "External") are preserved while
 * the link's href still matches them, so they are never silently rewritten into
 * external URLs; an edited href rebinds to an external relationship.
 */

import type JSZip from 'jszip';
import type { BlockContent, Hyperlink } from '../../types/content';
import { RELATIONSHIP_TYPES } from '../relsParser';
import { escapeXml } from '../serializer/xmlUtils';
import { findMaxRId, readRelsOrStub, type Part } from './parts';

/**
 * Collect all external hyperlinks (href and/or rId, but not bookmark anchors)
 * from block content. Anchor links resolve in-document and need no relationship.
 */
function collectExternalHyperlinks(blocks: BlockContent[]): Hyperlink[] {
  const hyperlinks: Hyperlink[] = [];

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      for (const item of block.content) {
        if (item.type === 'hyperlink' && (item.href || item.rId) && !item.anchor) {
          hyperlinks.push(item);
        }
      }
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          hyperlinks.push(...collectExternalHyperlinks(cell.content));
        }
      }
    } else if (block.type === 'blockSdt') {
      hyperlinks.push(...collectExternalHyperlinks(block.content));
    }
  }

  return hyperlinks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The `<Relationship .../>` element whose `Id` equals `rId`, if present. */
function relationshipElementForId(relsXml: string, rId: string): string | undefined {
  const match = relsXml.match(
    new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapeRegExp(rId)}")[^>]*/?>`)
  );
  return match?.[0];
}

/** True if the relationship is an external hyperlink (vs. an internal target). */
function relationshipIsExternalHyperlink(relationshipXml: string | undefined): boolean {
  return (
    !!relationshipXml &&
    relationshipXml.includes(`Type="${RELATIONSHIP_TYPES.hyperlink}"`) &&
    relationshipXml.includes('TargetMode="External"')
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * True if the relationship's Target resolves to `href`. Compares the decoded
 * Target to the decoded href so a producer's escaping choice (e.g. a raw `'`
 * that escapeXml would render as `&apos;`) does not cause a spurious mismatch.
 */
function relationshipTargetMatches(relationshipXml: string | undefined, href: string): boolean {
  const target = relationshipXml?.match(/\bTarget="([^"]*)"/)?.[1];
  return target != null && decodeXmlEntities(target) === href;
}

/** True if the relationship is an external hyperlink that targets `href`. */
function relationshipTargetsHref(relationshipXml: string | undefined, href: string): boolean {
  return (
    relationshipIsExternalHyperlink(relationshipXml) &&
    relationshipTargetMatches(relationshipXml, href)
  );
}

/** Find an existing external hyperlink relationship that already targets `href`. */
function findExistingHyperlinkRelationshipId(relsXml: string, href: string): string | undefined {
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    if (relationshipTargetsHref(match[0], href)) {
      return match[0].match(/\bId="([^"]+)"/)?.[1];
    }
  }
  return undefined;
}

/**
 * Process external hyperlinks across all parts (body, headers, footers,
 * footnotes, endnotes): assign/rebind rIds and add relationship entries to the
 * owning part's rels file. Mutates each hyperlink's rId in-place.
 */
export async function processNewHyperlinks(
  parts: Part[],
  zip: JSZip,
  compressionLevel: number
): Promise<void> {
  for (const { relsPath, blocks } of parts) {
    const hyperlinks = collectExternalHyperlinks(blocks);
    if (hyperlinks.length === 0) continue;

    const relsXml = await readRelsOrStub(zip, relsPath);
    let maxId = findMaxRId(relsXml);
    const relEntries: string[] = [];

    for (const hyperlink of hyperlinks) {
      const href = hyperlink.href;
      const currentRelationship = hyperlink.rId
        ? relationshipElementForId(relsXml, hyperlink.rId)
        : undefined;

      // No href: keep a resolving rId as-is, drop a stale one.
      if (!href) {
        if (!currentRelationship) {
          hyperlink.rId = undefined;
        }
        continue;
      }

      // Already bound to a relationship that targets this href — nothing to do.
      if (relationshipTargetsHref(currentRelationship, href)) {
        continue;
      }

      // An existing internal-target relationship (not External) is preserved as
      // long as the href still matches it — never silently rewrite an internal
      // link into an external URL. If the href was edited away from the internal
      // target, fall through and rebind to an external relationship.
      if (
        currentRelationship &&
        !relationshipIsExternalHyperlink(currentRelationship) &&
        relationshipTargetMatches(currentRelationship, href)
      ) {
        continue;
      }

      const existingRId = findExistingHyperlinkRelationshipId(relsXml, href);
      if (existingRId) {
        hyperlink.rId = existingRId;
        continue;
      }

      maxId++;
      const newRId = `rId${maxId}`;

      relEntries.push(
        `<Relationship Id="${newRId}" Type="${RELATIONSHIP_TYPES.hyperlink}" Target="${escapeXml(href)}" TargetMode="External"/>`
      );

      hyperlink.rId = newRId;
    }

    if (relEntries.length === 0) continue;

    const updatedRelsXml = relsXml.replace(
      '</Relationships>',
      relEntries.join('') + '</Relationships>'
    );
    zip.file(relsPath, updatedRelsXml, {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }
}

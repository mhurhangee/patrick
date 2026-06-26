/**
 * Image resize / drag-move PM commits. Builds a paragraph with an inline image
 * and exercises the resize, float-move, and inline-move commits via a mutable
 * view stub. The float/inline fork and the inline delete+insert math are the
 * shared logic these tests pin down.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { singletonManager } from '../schema';
import {
  isFloatingImage,
  commitImageResize,
  commitImageFloatMove,
  commitImageInlineMove,
} from '../imageCommit';

const schema = singletonManager.getSchema();

function image(attrs: Record<string, unknown> = {}) {
  return schema.nodes.image.create({
    src: 'data:,',
    rId: 'rId1',
    width: 100,
    height: 80,
    ...attrs,
  });
}

/** doc = [ paragraph( image, "hello world" ) ]. Image sits at pos 1. */
function makeView(imgAttrs: Record<string, unknown> = {}) {
  const para = schema.nodes.paragraph.create(null, [image(imgAttrs), schema.text('hello world')]);
  const doc = schema.nodes.doc.create(null, [para]);
  const view = {
    state: EditorState.create({ schema, doc }),
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view as unknown as EditorView & { state: EditorState };
}

const IMG_POS = 1;

function imageNode(view: EditorView & { state: EditorState }) {
  return view.state.doc.nodeAt(IMG_POS)!;
}

describe('isFloatingImage', () => {
  test('true for displayMode float and square/tight/through wrap', () => {
    expect(isFloatingImage(image({ displayMode: 'float' }))).toBe(true);
    expect(isFloatingImage(image({ wrapType: 'square' }))).toBe(true);
    expect(isFloatingImage(image({ wrapType: 'tight' }))).toBe(true);
    expect(isFloatingImage(image({ wrapType: 'through' }))).toBe(true);
  });

  test('false for inline', () => {
    expect(isFloatingImage(image({ wrapType: 'inline', displayMode: 'inline' }))).toBe(false);
  });
});

describe('commitImageResize', () => {
  test('updates width/height and returns the position', () => {
    const view = makeView();
    const sel = commitImageResize(view, IMG_POS, 200, 150);
    expect(sel).toBe(IMG_POS);
    expect(imageNode(view).attrs.width).toBe(200);
    expect(imageNode(view).attrs.height).toBe(150);
  });

  test('returns null when the position is not an image', () => {
    const view = makeView();
    expect(commitImageResize(view, 5, 200, 150)).toBeNull();
  });
});

describe('commitImageFloatMove', () => {
  test('writes margin-relative EMU offsets into position and returns the pos', () => {
    const view = makeView({ displayMode: 'float' });
    const sel = commitImageFloatMove(view, IMG_POS, 914400, 457200);
    expect(sel).toBe(IMG_POS);
    expect(imageNode(view).attrs.position).toEqual({
      horizontal: { posOffset: 914400, relativeTo: 'margin' },
      vertical: { posOffset: 457200, relativeTo: 'margin' },
    });
  });
});

describe('commitImageInlineMove', () => {
  test('no-op (null) when dropping onto the image slot', () => {
    const view = makeView();
    expect(commitImageInlineMove(view, IMG_POS, IMG_POS)).toBeNull();
    expect(commitImageInlineMove(view, IMG_POS, IMG_POS + 1)).toBeNull();
  });

  test('moves the image forward into the text and returns the new pos', () => {
    const view = makeView();
    // Drop after "hello" — pos 7 (para start 0, image 1, "hello" 2..6, space 7).
    const sel = commitImageInlineMove(view, IMG_POS, 7);
    expect(sel).not.toBeNull();
    // The image node should now sit at the returned position.
    expect(view.state.doc.nodeAt(sel!)?.type.name).toBe('image');
    // And there should still be exactly one image in the doc.
    let imageCount = 0;
    view.state.doc.descendants((n) => {
      if (n.type.name === 'image') imageCount++;
    });
    expect(imageCount).toBe(1);
  });

  test('returns null when the position is not an image', () => {
    const view = makeView();
    expect(commitImageInlineMove(view, 5, 8)).toBeNull();
  });
});

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll } from 'bun:test';

// Register happy-dom for this file and unregister after, matching the rest of
// the suite. A load-time register that never unregisters leaks the global
// registration across files and collides with other files' setup.
beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import type { DocumentAgent } from '@eigenpal/docx-editor-core/agent';
import type { DocxInput } from '@eigenpal/docx-editor-core/utils';
import { useFileIO } from './lifecycle/use-file-io';
import { useKeyboardShortcuts } from './interactions/use-keyboard-shortcuts';
import type { PagedEditorRef } from '../editor/paged-editor';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

afterEach(() => {
  cleanup();
});

function makeDocxFile(name = 'sample.docx') {
  return new File([new Uint8Array([1, 2, 3])], name, { type: DOCX_MIME });
}

function FileIOHarness({
  loadBuffer,
}: {
  loadBuffer: (buffer: DocxInput) => Promise<void>;
}) {
  const agentRef = useRef<DocumentAgent | null>(null);
  const pagedEditorRef = useRef<PagedEditorRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionPropsDirtyRef = useRef(false);
  const fileIO = useFileIO({
    agentRef,
    pagedEditorRef,
    containerRef,
    comments: [],
    onPrint: undefined,
    loadBuffer,
    getActiveEditorView: () => null,
    focusActiveEditor: () => {},
    sectionPropsDirtyRef,
  });

  return (
    <>
      <div ref={containerRef} />
      <input
        aria-label="docx input"
        ref={fileIO.docxInputRef}
        type="file"
        accept=".docx"
        onChange={fileIO.handleDocxFileChange}
      />
    </>
  );
}

function KeyboardHarness({
  showFileOpen,
  onOpenDocument,
}: {
  showFileOpen: boolean;
  onOpenDocument?: () => void;
}) {
  const pagedEditorRef = useRef<PagedEditorRef | null>(null);
  useKeyboardShortcuts({
    pagedEditorRef,
    disableFindReplaceShortcuts: false,
    showFileOpen,
    onOpenDocument,
    findReplace: {
      openFind: mock(() => {}),
      openReplace: mock(() => {}),
    } as never,
    openHyperlinkCreate: mock(() => {}),
    openHyperlinkEdit: mock(() => {}),
  });

  return null;
}

function dispatchCtrlO() {
  const event = new KeyboardEvent('keydown', {
    key: 'o',
    ctrlKey: true,
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe('File > Open', () => {
  test('loads the picked file through the built-in path', async () => {
    const file = makeDocxFile('built-in.docx');
    const loadBuffer = mock(async (_buffer: DocxInput) => {});

    const { getByLabelText } = render(<FileIOHarness loadBuffer={loadBuffer} />);
    fireEvent.change(getByLabelText('docx input'), { target: { files: [file] } });

    await waitFor(() => expect(loadBuffer).toHaveBeenCalledTimes(1));
    const buffer = loadBuffer.mock.calls[0][0] as ArrayBuffer;
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3]);
  });

  test('showFileOpen=false leaves Ctrl+O unhandled', () => {
    const onOpenDocument = mock(() => {});

    render(<KeyboardHarness showFileOpen={false} onOpenDocument={onOpenDocument} />);

    const event = dispatchCtrlO();
    expect(onOpenDocument).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

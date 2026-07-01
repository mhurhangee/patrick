import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import type { Document } from '@eigenpal/docx-editor-core/types/document';
import { usePageSetupControls } from './use-page-setup-controls';

function makeDoc(): Document {
  return {
    package: { document: { finalSectionProperties: { pageWidth: 12240 } } },
  } as unknown as Document;
}

function setup(readOnly: boolean) {
  const changes: Document[] = [];
  const { result } = renderHook(() => {
    const sectionPropsDirtyRef = useRef(false);
    const api = usePageSetupControls({
      document: makeDoc(),
      readOnly,
      handleDocumentChange: (d) => changes.push(d),
      sectionPropsDirtyRef,
    });
    return { api, sectionPropsDirtyRef };
  });
  return { result, changes };
}

describe('usePageSetupControls', () => {
  test('applying page setup marks section props dirty (so the save forces a full repack)', () => {
    const { result, changes } = setup(false);

    result.current.api.handlePageSetupApply({ pageWidth: 15840 });

    // The dirty flag is what useFileIO reads to force a full repack — without it
    // the selective save silently drops the sectPr change.
    expect(result.current.sectionPropsDirtyRef.current).toBe(true);
    expect(changes).toHaveLength(1);
    expect(changes[0].package.document.finalSectionProperties?.pageWidth).toBe(15840);
  });

  test('a read-only apply is a no-op and never dirties the flag', () => {
    const { result, changes } = setup(true);

    result.current.api.handlePageSetupApply({ pageWidth: 15840 });

    expect(result.current.sectionPropsDirtyRef.current).toBe(false);
    expect(changes).toHaveLength(0);
  });
});

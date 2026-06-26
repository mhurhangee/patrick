/**
 * Block SDT Extension — block-level content control node (Structured Document Tag)
 *
 * Represents OOXML block-level SDTs (`CT_SdtBlock`, a `w:sdt` wrapping
 * paragraphs/tables) as an editable block node whose children remain normal
 * editable blocks. The wrapper preserves the content control's identity
 * (tag/alias/id) and its raw `w:sdtPr`/`w:sdtEndPr` for lossless round-trip,
 * while `content: 'block+'` keeps the inner paragraphs and tables fully
 * editable.
 *
 * Mirrors the inline {@link SdtExtension}; the difference is block vs inline
 * grouping and a block content model. `isolating` keeps the boundary intact
 * under editing (backspace/delete at the edges won't silently merge a
 * paragraph out of the control), and `defining` preserves the wrapper when
 * content is replaced.
 */

import { createNodeExtension } from '../create';

export const BlockSdtExtension = createNodeExtension({
  name: 'blockSdt',
  schemaNodeName: 'blockSdt',
  nodeSpec: {
    group: 'block',
    content: '(paragraph | horizontalRule | pageBreak | table | textBox | blockSdt)+',
    isolating: true,
    defining: true,
    attrs: {
      /** SDT type: richText, plainText, date, dropDownList, comboBox, checkbox, etc. */
      sdtType: { default: 'richText' },
      /** Unique numeric id (`w:id`). Stored as number|null. */
      id: { default: null },
      /** Alias (friendly name) */
      alias: { default: null },
      /** Tag (developer identifier) */
      tag: { default: null },
      /** Lock setting */
      lock: { default: null },
      /** Placeholder building-block name */
      placeholder: { default: null },
      /** Whether showing placeholder */
      showingPlaceholder: { default: false },
      /** Date format for date controls */
      dateFormat: { default: null },
      /** Dropdown/combobox list items as JSON string */
      listItems: { default: null },
      /** Checkbox checked state */
      checked: { default: null },
      /** XML data binding (`w:dataBinding`) as JSON string */
      dataBinding: { default: null },
      /**
       * Captured `<w:sdtPr>` XML (verbatim) for lossless round-trip. Not
       * rendered; carried through so the serializer can replay it.
       */
      rawPropertiesXml: { default: null },
      /** Captured `<w:sdtEndPr>` XML (verbatim), if present. */
      rawEndPropertiesXml: { default: null },
    },
    parseDOM: [
      {
        tag: 'div.docx-block-sdt',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          const idRaw = el.dataset.id;
          const idNum = idRaw != null && idRaw !== '' ? parseInt(idRaw, 10) : NaN;
          return {
            sdtType: el.dataset.sdtType || 'richText',
            id: Number.isNaN(idNum) ? null : idNum,
            alias: el.dataset.alias || null,
            tag: el.dataset.tag || null,
            lock: el.dataset.lock || null,
            placeholder: el.dataset.placeholder || null,
            showingPlaceholder: el.dataset.showingPlaceholder === 'true',
            dateFormat: el.dataset.dateFormat || null,
            listItems: el.dataset.listItems || null,
            checked:
              el.dataset.checked === 'true' ? true : el.dataset.checked === 'false' ? false : null,
            rawPropertiesXml: el.dataset.rawPropertiesXml || null,
            rawEndPropertiesXml: el.dataset.rawEndPropertiesXml || null,
          };
        },
      },
    ],
    toDOM(node) {
      const attrs = node.attrs as Record<string, unknown>;
      const dataAttrs: Record<string, string> = {
        class: `docx-block-sdt docx-block-sdt-${attrs.sdtType}`,
        'data-sdt-type': String(attrs.sdtType),
      };

      if (attrs.id != null) dataAttrs['data-id'] = String(attrs.id);
      if (attrs.alias) dataAttrs['data-alias'] = String(attrs.alias);
      if (attrs.tag) dataAttrs['data-tag'] = String(attrs.tag);
      if (attrs.lock) dataAttrs['data-lock'] = String(attrs.lock);
      if (attrs.placeholder) dataAttrs['data-placeholder'] = String(attrs.placeholder);
      if (attrs.showingPlaceholder) dataAttrs['data-showing-placeholder'] = 'true';
      if (attrs.dateFormat) dataAttrs['data-date-format'] = String(attrs.dateFormat);
      if (attrs.listItems) dataAttrs['data-list-items'] = String(attrs.listItems);
      if (attrs.checked != null) dataAttrs['data-checked'] = String(attrs.checked);
      if (attrs.rawPropertiesXml)
        dataAttrs['data-raw-properties-xml'] = String(attrs.rawPropertiesXml);
      if (attrs.rawEndPropertiesXml)
        dataAttrs['data-raw-end-properties-xml'] = String(attrs.rawEndPropertiesXml);

      return ['div', dataAttrs, 0];
    },
  },
});

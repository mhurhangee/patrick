/**
 * SDT Extension — inline content control node (Structured Document Tag)
 *
 * Represents OOXML inline SDTs as an inline node wrapping text content.
 * Supports: richText, plainText, date, dropdown, comboBox, checkbox.
 */

import { createNodeExtension } from '../create';

export const SdtExtension = createNodeExtension({
  name: 'sdt',
  schemaNodeName: 'sdt',
  nodeSpec: {
    inline: true,
    group: 'inline',
    content: 'inline*',
    attrs: {
      /** SDT type: richText, plainText, date, dropdown, comboBox, checkbox, etc. */
      sdtType: { default: 'richText' },
      /** Unique numeric id (`w:id`). Stored as number|null. */
      id: { default: null },
      /** Alias (friendly name) */
      alias: { default: null },
      /** Tag (developer identifier) */
      tag: { default: null },
      /** Lock setting */
      lock: { default: null },
      /** Placeholder text */
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
        tag: 'span.docx-sdt',
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
            dataBinding: el.dataset.dataBinding || null,
            rawPropertiesXml: el.dataset.rawPropertiesXml || null,
            rawEndPropertiesXml: el.dataset.rawEndPropertiesXml || null,
          };
        },
      },
    ],
    toDOM(node) {
      const attrs = node.attrs as Record<string, unknown>;
      const dataAttrs: Record<string, string> = {
        class: `docx-sdt docx-sdt-${attrs.sdtType}`,
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
      if (attrs.dataBinding) dataAttrs['data-data-binding'] = String(attrs.dataBinding);
      if (attrs.rawPropertiesXml)
        dataAttrs['data-raw-properties-xml'] = String(attrs.rawPropertiesXml);
      if (attrs.rawEndPropertiesXml)
        dataAttrs['data-raw-end-properties-xml'] = String(attrs.rawEndPropertiesXml);

      // Checkbox renders with a checkbox-like indicator
      if (attrs.sdtType === 'checkbox') {
        dataAttrs.style =
          'border: 1px solid #ccc; border-radius: 3px; padding: 0 2px; display: inline;';
      } else {
        dataAttrs.style = 'border-bottom: 1px dashed #999; padding: 0 1px; display: inline;';
      }

      return ['span', dataAttrs, 0];
    },
  },
});

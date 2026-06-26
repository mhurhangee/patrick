import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  PARAGRAPH_FLASH_CLASS_NAME,
  findParagraphFragmentsByParaId,
  flashParagraphFragmentsByParaId,
} from '../paragraphFlash';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

describe('paragraph flash helpers', () => {
  test('finds rendered paragraph fragments by stable data-para-id', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="layout-paragraph" data-para-id="1A2B3C4D"></div>
      <div class="layout-paragraph" data-para-id="1A2B3C4D"></div>
      <div class="layout-paragraph" data-para-id="DEADBEEF"></div>
    `;

    expect(findParagraphFragmentsByParaId(root, '1A2B3C4D')).toHaveLength(2);
  });

  test('applies flash class and CSS variables to matching fragments', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="layout-paragraph" data-para-id="1A2B3C4D"></div>`;

    expect(
      flashParagraphFragmentsByParaId(root, '1A2B3C4D', {
        color: 'rgba(255, 200, 0, 0.5)',
        durationMs: 25,
      })
    ).toBe(true);

    const paragraph = root.querySelector<HTMLElement>('.layout-paragraph')!;
    expect(paragraph.classList.contains(PARAGRAPH_FLASH_CLASS_NAME)).toBe(true);
    expect(paragraph.style.getPropertyValue('--docx-paragraph-flash-color')).toBe(
      'rgba(255, 200, 0, 0.5)'
    );
    expect(paragraph.style.getPropertyValue('--docx-paragraph-flash-duration')).toBe('25ms');
  });
});

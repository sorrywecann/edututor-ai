import { describe, it, expect } from 'vitest';
import { cleanMarkdown } from './cleanMarkdown';

describe('cleanMarkdown', () => {
  it('returns falsy input unchanged', () => {
    expect(cleanMarkdown('')).toBe('');
    expect(cleanMarkdown(null as unknown as string)).toBe(null);
    expect(cleanMarkdown(undefined as unknown as string)).toBe(undefined);
  });

  it('strips bold wrappers while keeping inner text', () => {
    expect(cleanMarkdown('toto je **dôležité** slovo')).toBe('toto je dôležité slovo');
    expect(cleanMarkdown('__bold__ tiež')).toBe('bold tiež');
  });

  it('does NOT strip single-asterisk italic (math/identifier safety)', () => {
    expect(cleanMarkdown('2 * x * y')).toBe('2 * x * y');
    expect(cleanMarkdown('snake_case_name')).toBe('snake_case_name');
  });

  it('strips inline code backticks', () => {
    expect(cleanMarkdown('volaj `foo()` v Pythone')).toBe('volaj foo() v Pythone');
  });

  it('strips heading hashes on their own line', () => {
    expect(cleanMarkdown('## Heading\ntext')).toBe('Heading\ntext');
    expect(cleanMarkdown('### Triple')).toBe('Triple');
  });

  it('converts bullet markers to • but preserves indentation', () => {
    expect(cleanMarkdown('- item one\n- item two')).toBe('• item one\n• item two');
    expect(cleanMarkdown('  * nested')).toBe('  • nested');
  });

  it('strips horizontal rule lines', () => {
    expect(cleanMarkdown('above\n---\nbelow')).toBe('above\n\nbelow');
  });

  it('strips Markdown links but keeps citation markers', () => {
    expect(cleanMarkdown('see [docs](https://example.com)')).toBe('see docs');
    expect(cleanMarkdown('source [Zdroj 1] for details')).toBe('source [Zdroj 1] for details');
  });

  it('collapses 3+ consecutive newlines to 2', () => {
    expect(cleanMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('handles realistic Slovak tutor response with mixed markdown', () => {
    const input = `## Odpoveď

**Polymorfizmus** v Pythone znamená že rôzne triedy môžu mať \`metódy\` s rovnakým názvom.

- Príklad: \`Dog.speak()\` a \`Cat.speak()\`
- Volaj rovnaký interface

Viac v [docs](https://docs.python.org).`;
    const out = cleanMarkdown(input);
    expect(out).toContain('Odpoveď');
    expect(out).toContain('Polymorfizmus');
    expect(out).toContain('• Príklad: Dog.speak()');
    expect(out).not.toContain('**');
    expect(out).not.toContain('`');
    expect(out).not.toContain('](');
    expect(out).not.toMatch(/^##/m);
  });
});

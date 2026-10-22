import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import Amount from '../ui/Amount';
import {formatMoney} from './money';

describe('financial amounts before effects and animation', () => {
  it.each([2222, -425.5, 0])('renders the actual initial amount %s', value => {
    const html = renderToStaticMarkup(<Amount value={value} animate />);
    expect(html).toContain('>' + formatMoney(value) + '</span>');
    expect(html).toContain('aria-label="' + formatMoney(value) + '"');
  });
});

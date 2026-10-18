import {chromium} from 'playwright';
import {readFileSync, writeFileSync} from 'node:fs';
// Native SVG sources; no remote assets or image-generation dependency.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      }
    : {})
});
try {
  const page = await browser.newPage();
  for (const [source, size, name] of [
    ['icon-premium.svg', 192, 'icon-premium-192.png'],
    ['icon-premium.svg', 512, 'icon-premium-512.png'],
    ['icon-premium-maskable.svg', 512, 'icon-premium-maskable-512.png'],
    ['icon-premium-maskable.svg', 180, 'apple-touch-icon-premium.png']
  ]) {
    const svg = readFileSync(new URL('../public/' + source, import.meta.url), 'utf8');
    const data = await page.evaluate(
      async ({svg, size}) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      {svg, size}
    );
    writeFileSync(new URL('../public/' + name, import.meta.url), Buffer.from(data, 'base64'));
    console.log(name + ' ' + size + '×' + size);
  }
} finally {
  await browser.close();
}

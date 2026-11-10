import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';

globalThis.document = { createElement: (tag) => (tag === 'canvas' ? createCanvas(1, 1) : {}) };
const { renderOffice, renderCharacters } = await import('/tmp/preview.mjs');
const { createInitialState } = await import('../server/seed.mjs');

const state = createInitialState();
const officeCanvas = createCanvas(100, 100);
renderOffice(officeCanvas, state);
fs.writeFileSync('/home/user/energynextit/preview-office.png', officeCanvas.toBuffer('image/png'));

const charCanvas = createCanvas(100, 100);
renderCharacters(charCanvas);
fs.writeFileSync('/home/user/energynextit/preview-characters.png', charCanvas.toBuffer('image/png'));
console.log('wrote previews');

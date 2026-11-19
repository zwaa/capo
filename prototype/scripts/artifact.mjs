// Turn the single-file Vite build into a page body for publishing as an
// Artifact (the host supplies <!doctype>, <html>, <head> and <body>).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const pick = (re) => [...head.matchAll(re)].map((m) => m[0]).join('\n');
const title = pick(/<title>[\s\S]*?<\/title>/g);
const metas = pick(/<meta name="claude:[^>]*>/g);
const links = pick(/<link[^>]*>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);

writeFileSync('dist/capo.html', [title, metas, links, styles, body.replace(/<script[\s\S]*?<\/script>/g, ''), scripts].join('\n'));
console.log('dist/capo.html', (readFileSync('dist/capo.html').length / 1024).toFixed(1), 'KB');

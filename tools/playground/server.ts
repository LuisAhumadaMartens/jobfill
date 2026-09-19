import { Elysia } from 'elysia';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const FORMS = join(import.meta.dir, 'forms');
const PORT = Number(process.env.PORT ?? 3000);

const DESCRIPTIONS: Record<string, string> = {
  'greenhouse.html': 'Classic ATS markup: <label for>, required asterisks, selects for the EEO block.',
  'lever.html': 'No labels at all, just placeholders and radio fieldsets.',
  'workday.html': 'Div-based labels, data-automation-id, and a custom combobox with a listbox.',
  'careers-page.html': 'A company careers page that embeds the application in an iframe.',
  'react-board.html': 'Controlled selects that revert a value the page did not notice, plus a combobox whose menu renders in a portal. This is the shape that breaks naive autofill.'
};

function page(body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
     <title>JobFill playground</title>
     <style>
       body{font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:660px;margin:60px auto;padding:0 20px;color:#14151a}
       h1{font-size:22px;margin-bottom:4px} p.lede{color:#6b7280;margin-top:0}
       ul{list-style:none;padding:0} li{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:10px}
       a{color:#4f46e5;font-weight:600;text-decoration:none} a:hover{text-decoration:underline}
       small{color:#6b7280;display:block;margin-top:3px}
       @media(prefers-color-scheme:dark){body{background:#101116;color:#f3f4f6}li{border-color:#2b2d36}}
     </style></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

const app = new Elysia()
  .get('/', async () => {
    const files = (await readdir(FORMS)).filter((name) => name.endsWith('.html')).sort();
    const items = files.map((name) => `
      <li>
        <a href="/forms/${name}">${name.replace('.html', '')}</a>
        <small>${DESCRIPTIONS[name] ?? 'Fixture form.'}</small>
      </li>`).join('');

    return page(`
      <h1>JobFill playground</h1>
      <p class="lede">Fake application forms to test the extension against. Nothing here submits anywhere.</p>
      <ul>${items}</ul>
      <p><small>Load the extension from <code>dist/</code> at chrome://extensions, then open a form.</small></p>`);
  })
  .get('/forms/:name', ({ params, set }) => {

    if (!/^[a-z0-9-]+\.html$/i.test(params.name)) {
      set.status = 400;
      return 'bad form name';
    }
    return Bun.file(join(FORMS, params.name));
  })
  .post('/submit', () => ({ ok: true, note: 'Nothing was stored. This is a fixture.' }))
  .listen(PORT);

console.log(`playground → http://localhost:${app.server?.port ?? PORT}`);

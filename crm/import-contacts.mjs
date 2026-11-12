// Imports a customer list from a CSV file. Reports first; loads only with --yes.
// Dry run:  node --env-file=.env crm/import-contacts.mjs [file.csv]
// Load:     the same line with --yes at the end

import { readFileSync } from 'node:fs';
import { cleanEmail, cleanPhone, upsertContact } from './hubspot.mjs';

const args = process.argv.slice(2);
const load = args.includes('--yes');
const file = args.find((a) => !a.startsWith('--')) || 'crm/sample-data/copper-canyon-contacts.csv';

// Split one CSV line into its columns, respecting quotes.
function splitLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

// 1. Read the raw file. It is never changed.
const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
const header = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
const rows = lines.slice(1).map((line, i) => {
  const cells = splitLine(line);
  const raw = Object.fromEntries(header.map((h, c) => [h, cells[c] ?? '']));
  return { line: i + 2, raw };
});

// 2. Clean every row.
const phoneStyles = new Set();
for (const row of rows) {
  phoneStyles.add(row.raw.phone.replace(/\d/g, '9'));
  row.clean = {
    email: cleanEmail(row.raw.email),
    firstname: row.raw.first_name.trim(),
    lastname: row.raw.last_name.trim(),
    phone: cleanPhone(row.raw.phone),
    company: row.raw.company.trim(),
  };
}

// 3. Set aside rows with no usable email, each with its reason.
const looksLikeEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const rejects = [];
const usable = [];
for (const row of rows) {
  if (!row.clean.email) rejects.push({ row, reason: 'no email' });
  else if (!looksLikeEmail(row.clean.email)) rejects.push({ row, reason: `email is not valid: "${row.raw.email.trim()}"` });
  else usable.push(row);
}

// 4. One row per email. When an email repeats, the last row in the file wins.
const byEmail = new Map();
let repeats = 0;
for (const row of usable) {
  if (byEmail.has(row.clean.email)) repeats++;
  byEmail.set(row.clean.email, row);
}
const toLoad = [...byEmail.values()];

// 5. The report.
console.log(`File: ${file}`);
console.log(`Rows in the file:                 ${rows.length}`);
console.log(`Set aside, cannot be loaded:      ${rejects.length}`);
for (const { row, reason } of rejects) {
  console.log(`   line ${row.line}: ${row.clean.firstname} ${row.clean.lastname}, ${reason}`);
}
console.log(`Repeats of an email already seen: ${repeats}`);
console.log(`Contacts to load:                 ${toLoad.length}`);
console.log(`Check: ${toLoad.length} + ${repeats} + ${rejects.length} = ${toLoad.length + repeats + rejects.length} (should be ${rows.length})`);
console.log(`Phone numbers were written ${phoneStyles.size} different ways. All are now +1 and ten digits.`);
console.log('Column not loaded: source. HubSpot has no matching field for it yet.');

if (!load) {
  console.log('\nDry run only. Nothing was changed. Add --yes to load.');
  process.exit(0);
}

// 6. Load: look first, then create or update, one contact at a time.
console.log('\nLoading...');
const counts = { created: 0, updated: 0, failed: 0 };
const failures = [];
for (const row of toLoad) {
  const contact = Object.fromEntries(Object.entries(row.clean).filter(([, value]) => value));
  const result = await upsertContact(contact);
  if (result === 'created' || result === 'updated') counts[result]++;
  else { counts.failed++; failures.push(`   line ${row.line}: ${row.clean.email}, ${result}`); }
  process.stdout.write('.');
}
console.log('\n');
console.log(`Created: ${counts.created}`);
console.log(`Updated: ${counts.updated}`);
console.log(`Failed:  ${counts.failed}`);
for (const f of failures) console.log(f);
console.log(`Check: ${counts.created} + ${counts.updated} + ${counts.failed} = ${counts.created + counts.updated + counts.failed} (should be ${toLoad.length})`);

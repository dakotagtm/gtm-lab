// Removes practice contacts only: emails at the reserved test domains.
// It can never match a real customer, because nobody real has an example.com address.
// Preview:  node --env-file=.env crm/delete-practice-contacts.mjs [extra emails to include]
// Do it:    the same line with --yes at the end

import { API, send, readBody, cleanEmail } from './hubspot.mjs';

const PRACTICE_DOMAINS = ['example.com', 'example.org', 'example.net'];

const args = process.argv.slice(2);
const really = args.includes('--yes');
const extras = args.filter((a) => !a.startsWith('--')).map(cleanEmail);

// 1. Read every contact.
const contacts = [];
let after = '';
do {
  const page = await send(`${API}?limit=100&properties=email,firstname,lastname${after}`);
  const body = await readBody(page);
  if (!page.ok) {
    console.log('HubSpot said:', body.message);
    process.exit(1);
  }
  contacts.push(...body.results);
  after = body.paging?.next ? `&after=${body.paging.next.after}` : '';
} while (after);

// 2. Sort them: practice contacts to remove, everything else left alone.
const isPractice = (email) => PRACTICE_DOMAINS.some((d) => email.endsWith('@' + d)) || extras.includes(email);
const remove = [];
const keep = [];
for (const contact of contacts) {
  const email = cleanEmail(contact.properties.email);
  (isPractice(email) ? remove : keep).push({ id: contact.id, email, name: `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() });
}

console.log(`Contacts in HubSpot: ${contacts.length}`);
console.log(`Practice contacts to remove: ${remove.length}`);
console.log(`Left alone, they do not match the rule: ${keep.length}`);
for (const c of keep) console.log(`   ${c.name} | ${c.email || 'no email'}`);

if (!really) {
  console.log('\nPreview only. Nothing was changed. Add --yes to remove them.');
  process.exit(0);
}

// 3. Remove them one at a time.
let removed = 0;
let failed = 0;
for (const c of remove) {
  const response = await send(`${API}/${c.id}`, { method: 'DELETE' });
  if (removed === 0 && failed === 0) console.log('\nFirst delete status:', response.status);
  if (response.ok) removed++;
  else failed++;
  process.stdout.write('.');
}
console.log(`\n\nRemoved: ${removed}. Failed: ${failed}. Left alone: ${keep.length}.`);

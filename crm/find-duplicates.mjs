// Lists contacts that are likely the same person. It changes nothing.
// A pair is listed when the phone matches or the full name matches.
// Run from the repo root:  node --env-file=.env crm/find-duplicates.mjs

import { API, send, readBody, cleanPhone, cleanName } from './hubspot.mjs';

// 1. Read every contact, one page at a time.
const contacts = [];
let after = '';
do {
  const page = await send(`${API}?limit=100&properties=email,firstname,lastname,phone,company${after}`);
  console.log('Read status:', page.status);
  const body = await readBody(page);
  if (!page.ok) {
    console.log('HubSpot said:', body.message);
    process.exit(1);
  }
  contacts.push(...body.results);
  after = body.paging?.next ? `&after=${body.paging.next.after}` : '';
} while (after);

// 2. Clean what we compare.
const people = contacts.map((contact) => ({
  id: contact.id,
  email: contact.properties.email || '(no email)',
  name: [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || '(no name)',
  phone: cleanPhone(contact.properties.phone),
  company: contact.properties.company || 'no company',
  nameKey: cleanName(contact.properties.firstname, contact.properties.lastname),
}));

// 3. Compare every pair and collect the evidence.
const pairs = [];
for (let i = 0; i < people.length; i++) {
  for (let j = i + 1; j < people.length; j++) {
    const a = people[i];
    const b = people[j];
    const evidence = [];
    if (a.phone && a.phone === b.phone) evidence.push('same phone');
    if (a.nameKey && a.nameKey === b.nameKey) evidence.push('same name');
    if (evidence.length) pairs.push({ a, b, evidence });
  }
}

// 4. Strongest evidence first, then print the review list.
pairs.sort((x, y) => y.evidence.length - x.evidence.length);

const line = (p) => `   ${p.name} | ${p.email} | ${p.phone || 'no phone'} | ${p.company} | id ${p.id}`;
let number = 0;
for (const pair of pairs) {
  number++;
  console.log(`\n${number}. LIKELY DOUBLE: ${pair.evidence.join(' and ')}`);
  console.log(line(pair.a));
  console.log(line(pair.b));
}

console.log(`\nContacts read: ${people.length}. Pairs to review: ${pairs.length}. Nothing was changed.`);

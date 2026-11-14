// Links one person to one company, on purpose.
// It then shows any other companies the person is linked to.
// Add --only to remove those other links and make this their main company.
//   ./link dana.ruiz@example.com "Ocotillo Springs Resort"
//   ./link dana.ruiz@example.com "Ocotillo Springs Resort" --only

import { API, CRM, LINKS, send, readBody, cleanEmail } from './hubspot.mjs';

const typed = process.argv.slice(2);
const only = typed.includes('--only');
const [emailTyped, companyTyped] = typed.filter((word) => word !== '--only');
if (!emailTyped || !companyTyped) {
  console.log('Type an email and a company name. Example: ./link dana.ruiz@example.com "Ocotillo Springs Resort"');
  process.exit(1);
}
const tidy = (value) => (value || '').trim().toLowerCase();

// 1. Find the person by email.
const email = cleanEmail(emailTyped);
const personLookup = await send(`${API}/${encodeURIComponent(email)}?idProperty=email&properties=firstname,lastname,email`);
console.log('Person lookup status:', personLookup.status);
if (personLookup.status !== 200) {
  console.log(`No contact with the email ${email}. Nothing was changed.`);
  process.exit(1);
}
const person = await readBody(personLookup);
const personName = [person.properties.firstname, person.properties.lastname].filter(Boolean).join(' ') || email;

// 2. Find the company by name. Zero or several matches means stop and let a human decide.
const named = [];
const nameOf = new Map();
let after = '';
do {
  const page = await send(`${CRM}/companies?limit=100&properties=name,domain${after}`);
  const body = await readBody(page);
  if (!page.ok) {
    console.log('Company lookup status:', page.status, '| HubSpot said:', body.message);
    process.exit(1);
  }
  for (const company of body.results) {
    nameOf.set(company.id, `${company.properties.name || 'no name'} (${company.properties.domain || 'no website'})`);
    if (tidy(company.properties.name) === tidy(companyTyped)) named.push(company);
  }
  after = body.paging?.next ? `&after=${body.paging.next.after}` : '';
} while (after);
console.log('Company lookup status: 200');

if (named.length === 0) {
  console.log(`No company named "${companyTyped}". Add it first with ./company. Nothing was changed.`);
  process.exit(1);
}
if (named.length > 1) {
  console.log(`More than one company is named "${companyTyped}":`);
  for (const company of named) console.log(`  ${nameOf.get(company.id)}, id ${company.id}`);
  console.log('Nothing was changed. Clean up the doubles first.');
  process.exit(1);
}
const company = named[0];

// 3. Make the link. Sending it twice is harmless: the link either exists or it does not.
const linked = await send(`${LINKS}/contacts/${person.id}/associations/default/companies/${company.id}`, { method: 'PUT' });
console.log(`Link status: ${linked.status}. ${personName} is linked to ${nameOf.get(company.id)}.`);
if (!linked.ok) {
  console.log('HubSpot said:', (await readBody(linked)).message);
  process.exit(1);
}

// 4. Read every company this person is linked to, and show the ones you did not name.
async function readLinks() {
  const response = await send(`${LINKS}/contacts/${person.id}/associations/companies`);
  const body = await readBody(response);
  return (body.results || []).map((link) => ({
    id: String(link.toObjectId),
    main: (link.associationTypes || []).some((type) => type.typeId === 1),
  }));
}
const others = (await readLinks()).filter((link) => link.id !== String(company.id));
for (const other of others) {
  console.log(`Also linked to: ${nameOf.get(other.id) || 'a company'}, id ${other.id}${other.main ? ' (currently the main company)' : ''}.`);
}

// 5. Only when you said --only: remove the other links, and mark this one as the main company.
if (others.length && !only) {
  console.log('Those links were left alone. Add --only at the end to remove them.');
}
if (only) {
  for (const other of others) {
    const gone = await send(`${LINKS}/contacts/${person.id}/associations/companies/${other.id}`, { method: 'DELETE' });
    console.log(`Unlink status: ${gone.status}. Removed the link to ${nameOf.get(other.id) || other.id}. The company itself was not deleted.`);
  }
  const main = await send(`${LINKS}/contacts/${person.id}/associations/companies/${company.id}`, {
    method: 'PUT',
    body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }]),
  });
  console.log(`Main company status: ${main.status}.`);
}

// 6. Read it back, so the last lines are what HubSpot now holds.
const now = await readLinks();
console.log(`\n${personName} is now linked to ${now.length} ${now.length === 1 ? 'company' : 'companies'}:`);
for (const link of now) console.log(`  ${nameOf.get(link.id) || link.id}${link.main ? ' (main company)' : ''}`);

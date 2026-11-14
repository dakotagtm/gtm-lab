// Finds companies that are on file twice (same name and same website) and removes the newer copies.
// It previews by default. Add --yes to delete.
// It never deletes a copy that has people or deals attached.
//   ./company-doubles
//   ./company-doubles --yes

import { CRM, send, readBody } from './hubspot.mjs';

const act = process.argv.includes('--yes');
const tidy = (value) => (value || '').trim().toLowerCase();

// 1. Read every company, 100 at a time, along with its links to people and deals.
const companies = [];
let after = '';
do {
  const page = await send(`${CRM}/companies?limit=100&properties=name,domain,createdate&associations=contacts,deals${after}`);
  console.log('Read status:', page.status);
  const body = await readBody(page);
  if (!page.ok) {
    console.log('HubSpot said:', body.message);
    process.exit(1);
  }
  for (const company of body.results) {
    companies.push({
      id: company.id,
      name: company.properties.name,
      website: company.properties.domain,
      created: company.properties.createdate,
      people: company.associations?.contacts?.results?.length || 0,
      deals: company.associations?.deals?.results?.length || 0,
    });
  }
  after = body.paging?.next ? `&after=${body.paging.next.after}` : '';
} while (after);
console.log(`Companies read: ${companies.length}`);

// 2. Group the ones that share a name and a website. A company missing either one is left out.
const groups = new Map();
for (const company of companies) {
  if (!tidy(company.name) || !tidy(company.website)) continue;
  const key = `${tidy(company.name)}|${tidy(company.website)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(company);
}

// 3. In each group, keep the oldest. Every newer copy is a candidate for removal.
let doubles = 0;
let removed = 0;
let leftAlone = 0;
for (const copies of groups.values()) {
  if (copies.length < 2) continue;
  doubles++;
  copies.sort((a, b) => new Date(a.created) - new Date(b.created) || Number(a.id) - Number(b.id));
  const [keep, ...newer] = copies;
  console.log(`\n${keep.name} (${keep.website}) is on file ${copies.length} times.`);
  console.log(`  Keeping the oldest: id ${keep.id}, created ${keep.created}.`);

  for (const copy of newer) {
    const label = `id ${copy.id}, created ${copy.created}`;

    // The guard: a copy with people or deals attached is never deleted.
    if (copy.people || copy.deals) {
      console.log(`  Left alone: ${label}. It has ${copy.people} people and ${copy.deals} deals attached.`);
      leftAlone++;
      continue;
    }

    // Preview: say what would happen and change nothing.
    if (!act) {
      console.log(`  Would delete: ${label}. Nothing is attached to it.`);
      removed++;
      continue;
    }

    // The delete itself.
    const gone = await send(`${CRM}/companies/${copy.id}`, { method: 'DELETE' });
    console.log(`  Delete status: ${gone.status}. Deleted: ${copy.name} (${copy.website}), ${label}.`);
    if (gone.ok) removed++;
  }
}

// 4. The count at the end.
console.log(`\nCompanies on file twice: ${doubles}. ${act ? 'Deleted' : 'Would delete'}: ${removed}. Left alone: ${leftAlone}.`);
if (!act && removed) console.log('Nothing was changed. Run it again with --yes to delete.');

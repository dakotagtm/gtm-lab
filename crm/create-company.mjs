// Adds one company to HubSpot, after checking it is not already on file.
// Any match on website or on name is shown to you, and nothing is created.
// If you have looked and it really is a different business, add --new at the end.
//   ./company "Ocotillo Springs Resort" ocotillosprings.example
//   ./company "Ocotillo Springs Resort" another-site.example --new

import { CRM, send, readBody } from './hubspot.mjs';

// The company: the name and the website typed after the command.
const typed = process.argv.slice(2);
const createAnyway = typed.includes('--new');
const [name, website] = typed.filter((word) => word !== '--new');
if (!name || !website) {
  console.log('Type a name and a website. Example: ./company "Ocotillo Springs Resort" ocotillosprings.example');
  process.exit(1);
}

// Clean at the door. Names and websites are compared in lowercase with no stray spaces.
const tidy = (value) => (value || '').trim().toLowerCase();
const domain = tidy(website)
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/\/.*$/, '');

// 1. Look first: read every company on file and compare each one to what was typed.
console.log(`Checking for: ${name.trim()} (${domain})`);
const matches = [];
let after = '';
do {
  const page = await send(`${CRM}/companies?limit=100&properties=name,domain${after}`);
  console.log('Lookup status:', page.status);
  const body = await readBody(page);
  if (!page.ok) {
    console.log('HubSpot said:', body.message);
    process.exit(1);
  }
  for (const company of body.results) {
    const sameWebsite = tidy(company.properties.domain) === domain;
    const sameName = tidy(company.properties.name) === tidy(name);
    if (sameWebsite || sameName) {
      matches.push({ id: company.id, name: company.properties.name, website: company.properties.domain, sameWebsite, sameName });
    }
  }
  after = body.paging?.next ? `&after=${body.paging.next.after}` : '';
} while (after);

// 2. Show every match. A human decides what happens next.
let exact = false;
for (const match of matches) {
  let why = 'same name, different website';
  if (match.sameWebsite) why = 'same website, different name';
  if (match.sameWebsite && match.sameName) {
    why = 'same name and same website';
    exact = true;
  }
  console.log(`On file already (${why}): ${match.name} (${match.website}), id ${match.id}.`);
}

if (exact) {
  console.log('Nothing was created. This company is already on file.');
  process.exit(0);
}
if (matches.length && !createAnyway) {
  console.log('Nothing was created. If this is a different business, run it again with --new at the end.');
  process.exit(0);
}
if (matches.length && createAnyway) console.log('You added --new, so it will be created.');

// 3. No match, or you said to go ahead: create the company.
const response = await send(`${CRM}/companies`, {
  method: 'POST',
  body: JSON.stringify({ properties: { name: name.trim(), domain } }),
});
console.log('Create status:', response.status);
const created = await readBody(response);
if (response.ok) {
  console.log(`Created, id ${created.id}.`);
} else {
  console.log('HubSpot said:', created.message);
  process.exit(1);
}

// Merges two contacts that a person has confirmed are the same. A merge is permanent.
// Preview:  node --env-file=.env crm/merge-contacts.mjs <id to keep> <id to merge in>
// Do it:    the same line with --yes at the end

import { API, send, readBody } from './hubspot.mjs';

const [keepId, mergeId, flag] = process.argv.slice(2);
if (!keepId || !mergeId) {
  console.log('Give two ids: the one to keep, then the one to merge into it.');
  process.exit(1);
}

const FIELDS = 'properties=email,firstname,lastname,phone,hs_additional_emails';

// Show one contact so a person can see exactly what is about to be joined.
async function show(label, id) {
  const response = await send(`${API}/${id}?${FIELDS}`);
  const body = await readBody(response);
  if (!response.ok) {
    console.log(`${label}: could not read id ${id} (status ${response.status}).`);
    process.exit(1);
  }
  const p = body.properties;
  console.log(`${label}: ${p.firstname} ${p.lastname} | ${p.email} | ${p.phone || 'no phone'} | id ${body.id}`);
}

await show('KEEP ', keepId);
await show('MERGE', mergeId);

// Without --yes this is only a preview.
if (flag !== '--yes') {
  console.log('\nPreview only. Nothing was changed. A merge is permanent. Add --yes to do it.');
  process.exit(0);
}

const merged = await send('https://api.hubapi.com/crm/objects/2026-09/contacts/merge', {
  method: 'POST',
  body: JSON.stringify({ primaryObjectId: keepId, objectIdToMerge: mergeId }),
});
console.log('\nMerge status:', merged.status);
const body = await readBody(merged);
if (!merged.ok) {
  console.log('HubSpot said:', body.message);
  process.exit(1);
}

// Read the survivor back to see what it holds now.
const after = await send(`${API}/${body.id}?${FIELDS}`);
const result = (await readBody(after)).properties;
console.log(`Now one record, id ${body.id}.`);
console.log('Main email:', result.email);
console.log('Other emails:', result.hs_additional_emails || '(none)');

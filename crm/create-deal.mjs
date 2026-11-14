// Adds one deal to HubSpot, linked to a person and a company.
// It looks first: a deal with the same name for the same company is shown, and nothing is created.
// It never deletes anything.
//   ./deal dana.ruiz@example.com "Ocotillo Springs Resort" "March Conference" 4200 "contract sent" 12/15/26

import { API, CRM, PIPELINES, send, readBody, readAll, cleanEmail } from './hubspot.mjs';

const [emailTyped, companyTyped, dealTyped, amountTyped, stageTyped, dateTyped] = process.argv.slice(2);
if (!emailTyped || !companyTyped || !dealTyped || !amountTyped || !stageTyped || !dateTyped) {
  console.log('Type six things: email, company, deal name, amount, stage, close date.');
  console.log('Example: ./deal dana.ruiz@example.com "Ocotillo Springs Resort" "March Conference" 4200 "contract sent" 12/15/26');
  process.exit(1);
}
const tidy = (value) => (value || '').trim().toLowerCase();
const stop = (message) => {
  console.log(message);
  console.log('Nothing was created.');
  process.exit(1);
};

// ---- Clean at the door -------------------------------------------------

// Amount: "$4,200" and "4200" both become the number 4200.
const amount = Number(String(amountTyped).replace(/[$,]/g, ''));
if (!Number.isFinite(amount) || amount <= 0) stop(`"${amountTyped}" is not a dollar amount.`);

// Close date: 12/15/26, 12/15/2026 and 2026-12-15 all become the same day.
function cleanDate(value) {
  let parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  let year, month, day;
  if (parts) {
    [, month, day, year] = parts;
    if (year.length === 2) year = '20' + year;
  } else {
    parts = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!parts) return null;
    [, year, month, day] = parts;
  }
  // Noon, so the day does not slip to the one before in US time zones.
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return date.getUTCMonth() === Number(month) - 1 ? date : null;
}
const closeDate = cleanDate(dateTyped.trim());
if (!closeDate) stop(`"${dateTyped}" is not a date I can read. Use 12/15/26 or 2026-12-15.`);
const closeDay = closeDate.toISOString().slice(0, 10);

// Stage: what you see on screen ("contract sent") becomes HubSpot's internal ID ("contractsent").
const pipelines = await send(`${PIPELINES}/deals`);
console.log('Pipeline lookup status:', pipelines.status);
const pipeline = (await readBody(pipelines)).results?.[0];
if (!pipelines.ok || !pipeline) stop('Could not read the deal pipeline.');
const stage = pipeline.stages.find((s) => tidy(s.label) === tidy(stageTyped) || s.id === tidy(stageTyped).replace(/\s+/g, ''));
if (!stage) stop(`No stage called "${stageTyped}". The stages are: ${pipeline.stages.map((s) => s.label).join(', ')}.`);

// ---- Find the person and the company -----------------------------------

const email = cleanEmail(emailTyped);
const personLookup = await send(`${API}/${encodeURIComponent(email)}?idProperty=email&properties=firstname,lastname`);
console.log('Person lookup status:', personLookup.status);
if (personLookup.status !== 200) stop(`No contact with the email ${email}.`);
const person = await readBody(personLookup);
const personName = [person.properties.firstname, person.properties.lastname].filter(Boolean).join(' ') || email;

const companies = await readAll(`${CRM}/companies?properties=name,domain`);
console.log('Company lookup status:', companies.status);
if (!companies.ok) stop(`HubSpot said: ${companies.message}`);
const named = companies.results.filter((c) => tidy(c.properties.name) === tidy(companyTyped));
if (named.length === 0) stop(`No company named "${companyTyped}". Add it first with ./company.`);
if (named.length > 1) stop(`More than one company is named "${companyTyped}". Clean up the doubles first.`);
const company = named[0];

// ---- Look first: is this deal already on file for this company? ---------

const deals = await readAll(`${CRM}/deals?properties=dealname,amount,dealstage,closedate&associations=companies`);
console.log('Deal lookup status:', deals.status);
if (!deals.ok) stop(`HubSpot said: ${deals.message}`);
const already = deals.results.filter((deal) => {
  const sameName = tidy(deal.properties.dealname) === tidy(dealTyped);
  const sameCompany = (deal.associations?.companies?.results || []).some((link) => String(link.id) === String(company.id));
  return sameName && sameCompany;
});
if (already.length) {
  for (const deal of already) {
    console.log(`On file already: ${deal.properties.dealname} for ${company.properties.name}, $${Number(deal.properties.amount || 0).toLocaleString('en-US')}, stage ${deal.properties.dealstage}, id ${deal.id}.`);
  }
  console.log('Nothing was created.');
  process.exit(0);
}

// ---- Create the deal, linked to the person and the company --------------

const response = await send(`${CRM}/deals`, {
  method: 'POST',
  body: JSON.stringify({
    properties: {
      dealname: dealTyped.trim(),
      amount: String(amount),
      dealstage: stage.id,
      pipeline: pipeline.id,
      closedate: closeDate.toISOString(),
    },
    associations: [
      { to: { id: person.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] },
      { to: { id: company.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }] },
    ],
  }),
});
console.log('Create status:', response.status);
const created = await readBody(response);
if (!response.ok) stop(`HubSpot said: ${created.message}`);

console.log(`Created, id ${created.id}.`);
console.log(`${dealTyped.trim()}: $${amount.toLocaleString('en-US')}, ${stage.label}, expected to close ${closeDay}.`);
console.log(`Linked to ${personName} and ${company.properties.name}.`);

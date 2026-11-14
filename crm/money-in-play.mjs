// Answers one owner question: how much money is in play right now?
// It reads only. Nothing is changed.
// "In play" means open: any deal that is not closed won or closed lost.
//   ./pipeline

import { CRM, PIPELINES, send, readBody, readAll } from './hubspot.mjs';

const dollars = (number) => '$' + Math.round(number).toLocaleString('en-US');

// 1. Read the stages, so each deal's stage ID can be turned into a label, a win chance, and open or closed.
const pipelines = await send(`${PIPELINES}/deals`);
console.log('Pipeline lookup status:', pipelines.status);
const pipelineBody = await readBody(pipelines);
if (!pipelines.ok) {
  console.log('HubSpot said:', pipelineBody.message);
  process.exit(1);
}
const stageOf = new Map();
for (const pipeline of pipelineBody.results) {
  for (const stage of pipeline.stages) {
    const chance = Number(stage.metadata?.probability ?? 0);
    const closed = stage.metadata?.isClosed === 'true' || chance === 0 || chance === 1;
    stageOf.set(stage.id, { label: stage.label, chance, closed });
  }
}

// 2. Read every deal, with the company it belongs to.
const deals = await readAll(`${CRM}/deals?properties=dealname,amount,dealstage&associations=companies`);
console.log('Deal lookup status:', deals.status);
if (!deals.ok) {
  console.log('HubSpot said:', deals.message);
  process.exit(1);
}
const companies = await readAll(`${CRM}/companies?properties=name`);
const companyName = new Map(companies.results.map((company) => [String(company.id), company.properties.name || 'no name']));

// 3. Keep the open ones and add them up.
let total = 0;
let weighted = 0;
let closedCount = 0;
const open = [];
for (const deal of deals.results) {
  const stage = stageOf.get(deal.properties.dealstage) || { label: deal.properties.dealstage, chance: 0, closed: false };
  if (stage.closed) {
    closedCount++;
    continue;
  }
  const amount = Number(deal.properties.amount || 0);
  const companyId = deal.associations?.companies?.results?.[0]?.id;
  open.push({ name: deal.properties.dealname, company: companyName.get(String(companyId)) || 'no company', stage, amount });
  total += amount;
  weighted += amount * stage.chance;
}

// 4. Report: each open deal, then the totals.
console.log(`\nOpen deals: ${open.length}`);
for (const deal of open) {
  console.log(`  ${deal.name.padEnd(20)} ${deal.company.padEnd(26)} ${deal.stage.label.padEnd(24)} ${dollars(deal.amount).padStart(8)}   win chance ${Math.round(deal.stage.chance * 100)}%`);
}
console.log(`\nMoney in play: ${dollars(total)}`);
console.log(`Counted at each stage's win chance: ${dollars(weighted)}`);
console.log(`Closed deals, not counted: ${closedCount}`);

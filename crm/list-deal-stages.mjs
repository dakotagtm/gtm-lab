// Lists the stages of every deal pipeline, with the internal ID HubSpot wants when you create a deal.
// It reads only. Nothing is changed.
//   ./stages

import { PIPELINES, send, readBody } from './hubspot.mjs';

// Ask HubSpot for the deal pipelines.
const response = await send(`${PIPELINES}/deals`);
console.log('Status:', response.status);
const body = await readBody(response);
if (!response.ok) {
  console.log('HubSpot said:', body.message);
  process.exit(1);
}

// Print each pipeline, then its stages in the order they appear on the board.
for (const pipeline of body.results) {
  console.log(`\nPipeline: ${pipeline.label}  (id: ${pipeline.id})`);
  const stages = [...pipeline.stages].sort((a, b) => a.displayOrder - b.displayOrder);
  stages.forEach((stage, index) => {
    const chance = Math.round(Number(stage.metadata?.probability ?? 0) * 100);
    console.log(`  ${index + 1}. ${stage.label.padEnd(26)} id: ${String(stage.id).padEnd(26)} win chance: ${chance}%`);
  });
}

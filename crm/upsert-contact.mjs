// Makes sure one contact is on file in HubSpot. Looks first, then creates or updates.
// Run from the repo root:
//   node --env-file=.env crm/upsert-contact.mjs
//   node --env-file=.env crm/upsert-contact.mjs maya@example.com Maya Lopez "(480) 555-0199"

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error('No key found. Put HUBSPOT_ACCESS_TOKEN in .env and run with --env-file=.env');
  process.exit(1);
}

// The person: only what was typed after the command. If nothing was typed, use Derek.
// A detail that was not typed is left out, so it is never overwritten.
const typed = process.argv.slice(2);
const raw = typed.length
  ? { email: typed[0], firstname: typed[1], lastname: typed[2], phone: typed[3] }
  : { email: 'add@example.com', firstname: 'Derek', lastname: 'Smith' };

// Clean the details at the door, before anything looks them up or saves them.
function cleanPhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return value.trim(); // not a US number we recognize: keep it as typed
}

function clean(details) {
  const tidy = {};
  if (details.email) tidy.email = details.email.replace(/\s+/g, '').toLowerCase();
  if (details.firstname) tidy.firstname = details.firstname.trim();
  if (details.lastname) tidy.lastname = details.lastname.trim();
  if (details.phone) tidy.phone = cleanPhone(details.phone);
  return tidy;
}

const contact = clean(raw);

const API = 'https://api.hubapi.com/crm/v3/objects/contacts';
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

// HubSpot usually answers in JSON, but not always.
async function readBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 120) };
  }
}

// Send a request. If the connection fails, wait 10 seconds and try again, up to 3 times.
async function send(url, options) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      console.log(`Could not connect (try ${attempt} of 3).`);
      if (attempt === 3) {
        console.log('Giving up for now. Run it again later. It is safe to repeat.');
        process.exit(1);
      }
      console.log('Waiting 10 seconds, then trying again.');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

// 1. Look first: is this email already on file?
console.log('Looking up:', contact.email);
const lookup = await send(`${API}/${encodeURIComponent(contact.email)}?idProperty=email`, { headers });
console.log('Lookup status:', lookup.status);

if (lookup.status === 200) {
  // On file already: update the details. PATCH sets values, so repeating it is harmless.
  const found = await readBody(lookup);
  const updated = await send(`${API}/${found.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties: contact }),
  });
  console.log('Update status:', updated.status);
  const body = await readBody(updated);
  if (!updated.ok) {
    console.log('HubSpot said:', body.message);
    process.exit(1);
  }
  const name = [body.properties.firstname, body.properties.lastname].filter(Boolean).join(' ');
  console.log(`Updated, id ${found.id}.` + (name ? ` Name on file: ${name}.` : ''));
} else if (lookup.status === 404) {
  // 2. Not on file: create.
  const created = await send(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ properties: contact }),
  });
  console.log('Create status:', created.status);
  const body = await readBody(created);
  if (!created.ok) {
    console.log('HubSpot said:', body.message);
    process.exit(1);
  }
  console.log(`Created, id ${body.id}.`);
} else {
  // Anything else is a real problem: bad key, missing permission, their outage.
  const body = await readBody(lookup);
  console.log('HubSpot said:', body.message);
  process.exit(1);
}

if (contact.phone) console.log('Phone saved as', contact.phone + '.');

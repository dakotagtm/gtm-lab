// Shared helpers for every script that talks to HubSpot.

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error('No key found. Put HUBSPOT_ACCESS_TOKEN in .env and run with --env-file=.env');
  process.exit(1);
}

export const API = 'https://api.hubapi.com/crm/v3/objects/contacts';
export const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

// Send a request. If the connection fails, wait 10 seconds and try again, up to 3 times.
export async function send(url, options = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetch(url, { headers, ...options });
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

// HubSpot usually answers in JSON, but not always.
export async function readBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 120) };
  }
}

// US phone numbers into one format: +1 and ten digits.
export function cleanPhone(value) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return value.trim();
}

// Names compared without regard to capitals or stray spaces.
export function cleanName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim().toLowerCase();
}

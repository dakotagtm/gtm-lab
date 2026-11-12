# crm

Scripts and notes for the CRM layer. HubSpot is the default.

## upsert-contact.mjs

Makes sure one contact is on file without creating a duplicate. It is safe to run twice.

1. Cleans the input: lowercases the email and removes spaces, trims names, puts US phone numbers in +1 format.
2. Looks the contact up by email.
3. Creates the contact if it is new. Updates it if it is already on file.
4. If the connection drops, waits 10 seconds and tries again, up to 3 times.

Run it from the repo root:

```
./upsert maya@example.com Maya Lopez "(480) 555-0199"
```

It needs a HubSpot service key with read and write on contacts, saved in `.env` as `HUBSPOT_ACCESS_TOKEN`. The `.env` file is never committed.

Known limits: it matches on email only, so the same person with a second address becomes a second contact. Phone cleaning understands US numbers only.

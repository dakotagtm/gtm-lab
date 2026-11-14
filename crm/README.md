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

## find-duplicates.mjs

Lists contacts that are likely the same person. It changes nothing.

A pair is listed when the phone matches or the full name matches, and each pair shows its evidence, so a person can decide.

```
./doubles
```

## merge-contacts.mjs

Merges two contacts that a person has confirmed are the same. A merge is permanent, so the script only previews unless you add `--yes`.

```
./merge <id to keep> <id to merge in>
./merge <id to keep> <id to merge in> --yes
```

The survivor keeps its own email as the main one and takes the other as an extra. HubSpot can give the merged record a new id, so look people up by email and do not store ids.

## hubspot.mjs

Shared helpers: the key, the retry on a dropped connection, and the cleaning rules for phones and names.

## import-contacts.mjs

Imports a customer list from a CSV file. It reports first and loads only with `--yes`.

1. Reads the file and never changes it.
2. Cleans every row: email, names, US phone numbers.
3. Sets aside rows with no usable email, each with its reason.
4. Keeps one row per email. When an email repeats, the last row in the file wins.
5. Prints a report whose counts add up to the number of rows.
6. With `--yes`, creates or updates each contact. A second run creates nothing.

```
./import                    # dry run on the sample file
./import path/to/file.csv   # dry run on your own file
./import --yes              # load
```

`sample-data/copper-canyon-contacts.csv` is a practice list of 60 rows for a made-up business. Every name is invented, the emails use reserved test domains and the phone numbers are in the fictional 555-01xx range.

## delete-practice-contacts.mjs

Removes practice contacts only: emails at `example.com`, `example.org` and `example.net`. Those domains are reserved for testing, so the rule cannot match a real customer. There is no option to delete everything. It previews by default.

```
./cleanup                          # preview
./cleanup --yes                    # remove
./cleanup someone@else.com --yes   # also remove a named address
```

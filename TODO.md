# TODO.md — working set

## Phase 2b — Capture: bodies, extraction v2, contacts

### Plain-text bodies

- [x] The body of a plain-text Gmail message (`format=full`, one `text/plain` part) comes out as its decoded text
- [x] The body of a message with only an HTML part comes out as its text with every tag removed
- [x] The body of a `multipart/alternative` message comes out from its `text/plain` part, not its HTML part
- [x] Lines of a quoted reply (`On … wrote:` and the `>` lines after it) are dropped from the body
- [x] A body without a quoted reply keeps every line, including a line that contains `wrote:` mid-sentence
- [x] A signature after a `-- ` delimiter line is dropped from the body
- [x] A body under 20 KB is kept whole; a body over 20 KB is cut to 20 KB
- [x] An attachment part (a part with a filename) never contributes text to the body
- [x] The body of a `multipart/mixed` message whose only text part is HTML (beside an attachment) comes out as that HTML's text
- [x] An HTML body drops the contents of its `<style>` and `<script>` elements and decodes `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` and `&nbsp;`
- [x] An HTML body is trimmed of its quoted reply and signature and capped like a plain-text body
- [x] A body of non-ASCII text is cut so its UTF-8 encoding is at most 20 KB, never mid-character
- [x] A message part without a `body` (as in a metadata-only payload) adds no text to the body instead of throwing
- [x] The Gmail poll reads each message with `format=full` and reports its trimmed body alongside the headers (hand-driven: the metadata test migrated to a full read, not deleted)
  - predicted-contradiction: `apps/extension/src/gmail-poll.test.ts::reports each message with its From, To, Cc, Subject, Date and List-Id headers and its snippet, read as metadata` — asserts: each message is read with `format=metadata` (the fake Gmail answers 400 to any other format) — retired-by: "The Gmail poll reads each message with `format=full`"
- [x] A mail report whose message carries a body is accepted, and one without a body is still accepted
- [x] A body reported for a message is stored and is still there after the backend restarts
- [x] The triage request for a message with a stored body carries the body
- [x] The triage request for a message without a stored body carries the snippet (already pinned: `claude-triage.test.ts` "sends the message's headers, snippet…" and the restart case in `app.test.ts`)
- [x] A database whose reported-message tables were created before bodies existed opens at startup, keeps every stored message, and stores and reloads bodies from then on


### Extraction v2

- [x] A `propose_triage` answer carrying `people`, `organization`, `asks`, `commitments`, `dates` and `threadState` is accepted
- [x] A `propose_triage` answer whose person has a role other than `sender`, `asked`, `mentioned` or `copied` is rejected
- [x] A `propose_triage` answer whose `dates` entry is not ISO 8601 is rejected
- [x] A `propose_triage` answer without the v2 fields is still accepted with the v1 category extract (already pinned by the v1 cases in `triage-proposal.test.ts`)
- [x] Triage proposals are made under prompt version `triage-v2`, which asks for the v2 fields
- [x] A message's extraction is stored under its prompt version and survives a backend restart
- [x] A second extraction of the same message under another prompt version is stored beside the first, not over it

### Contacts and organizations

- [ ] A message's sender becomes a contact with the display name and email from its `From` header
- [ ] Two messages from the same email, on different accounts, link to one contact
- [ ] Two messages from different emails link to two contacts
- [ ] A message's organization is the one its extraction names
- [ ] A message whose extraction names no organization links to the organization of its sender's domain
- [ ] A message from a free-mail domain (`gmail.com`, `outlook.com`, `hotmail.com`, `yahoo.com`, `icloud.com`) links to no domain organization
- [ ] Every person in a message's extraction with an email becomes a contact linked to that message
- [ ] A person in a message's extraction without an email links to no contact
- [ ] One message lists under every contact and organization it links to
- [ ] A message lists under no contact it does not link to
- [ ] Contacts, organizations and message links survive a backend restart
- [ ] A contact marked `vip` in the app reads as `vip`; an unmarked contact does not
- [ ] A contact's lists and note, set in the app, read back as set and survive a restart

### Google Contacts import

- [ ] The extension's Google token is requested with `contacts.readonly` and `contacts.other.readonly`
- [ ] The extension reads its account's contacts (`people/me/connections`, every page) and reports names, emails, organization, starred and labels
- [ ] The extension reads its account's Other Contacts (`otherContacts`, every page) and reports names and emails
- [ ] The contacts import runs once a day, not on every Gmail poll
- [ ] An imported contact with an email the store already holds merges into that contact instead of adding one
- [ ] An imported contact with an unknown email adds a new contact
- [ ] The same person imported from two accounts by the same email ends as one contact holding both accounts' data
- [ ] A starred imported contact is marked `vip`
- [ ] An unstarred imported contact does not remove a `vip` mark the user set in the app
- [ ] A Google label on an imported contact becomes one of its lists
- [ ] An imported name or organization does not replace one the user set in the app
- [ ] The contacts import, from the extension against the fake People server to the stored contacts, ends with the contacts readable from the backend

### Backfill and retriage

- [ ] `GET /bodies-missing?account=` lists the stored messages of that account that have no body
- [ ] `GET /bodies-missing?account=` lists no message of another account, and no message that has a body
- [ ] On its poll, the extension fetches each listed message with `format=full` and reports its body
- [ ] The backfill, from the extension against the fake Gmail server, ends with the body stored for every listed message
- [ ] A message whose body arrives by backfill is retriaged under `triage-v2` with the Haiku-first setup
- [ ] A retriage replaces the message's open proposal and keeps every verdict already given on it
- [ ] A message already proposed under `triage-v2` is not retriaged when its body arrives again

### Search

- [ ] `GET /search?q=` returns the messages whose body contains the query word
- [ ] `GET /search?q=` returns no message whose body, summary, extracts and thread state lack the query word
- [ ] `GET /search?q=` finds a message by a word only in its summary, extract or thread state
- [ ] A message stored after the index was built is found by `GET /search?q=` without a rebuild
- [ ] Search results survive a backend restart

### Structured context in the prompt

- [ ] The triage request for a message from a known contact carries that contact's record (name, organization, `vip`, lists, note)
- [ ] The triage request for a message from an unknown sender carries no contact record
- [ ] The triage request for a message in a thread with an earlier extraction carries that thread state
- [ ] The triage request for the first message of a thread carries no thread state

### Wiring and acceptance

- [ ] The shipped backend (`main.ts`) and extension (`background.ts`) store bodies, triage under `triage-v2`, link contacts, import Google Contacts daily, backfill bodies and answer `GET /search`
- [ ] `scripts/demo.sh` seeds bodies, v2 extractions and contacts, and a screenshot of the triage page over it shows the body-driven summaries

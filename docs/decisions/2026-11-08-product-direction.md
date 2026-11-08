# 2026-11-08 — Product direction: from per-message triage to an omnichannel People view

Grilled with the user (`/grill-me`) on 2026-11-08, after Phase 2 shipped and before the three remaining inboxes
backfilled. The point of deciding now: whatever Claude extracts while reading each message for the first time never
has to be re-read.

## Decisions

- **Keep full text bodies** (plain text, quoted replies trimmed, 20 KB cap, no attachments), locally. Locked decision 20
  amended. Stored messages without a body are refetched and retriaged under prompt v2; verdicts already given are kept.
- **Extraction v2 in the same triage call:** people with roles, organization, asks, commitments, dates, thread state.
- **Digests are rolling, per source**, cleared on confirm, with a Haiku-written line; automatic work is visible in a
  _Handled for you_ strip with undo.
- **People model:** email identity, organization by domain or name, manual merges proposed by the LLM, seeded from
  Google Contacts of all four accounts (starred = VIP, labels = lists). Default list name: _Everyone else_.
- **Urgent is computed** (2 business days unanswered, 48 h deadline, VIP 1 day, unseen significant alert); VIP is a mark.
- **Needs input:** one-key questions, three sources (model disagreement or `unknown`, new sender asking, identity
  merge), no daily cap, every answer stored.
- **Agent:** Opus with tools over SQLite full-text and the structured stores; acts within safeguards (archive, label,
  task, VIP, filter decisions, Gmail drafts), never deletes or sends. mempalace (Python, ChromaDB, MCP) was considered
  and set aside: a second runtime outside the Node toolchain and duplicated storage, for retrieval the app can do with
  FTS5 and tools first; embeddings only after a measured recall gap.
- **Home:** _Now_ stays home; People is the second tab and takes the full waiting-on view.
- **Order:** capture → digests → People, Needs input, tasks and prioritizer → agent → Slack → WhatsApp and Telegram →
  Gemini notes → cloud. Each phase ships end to end with a feedback loop.

## Open questions carried into the phases

- Thread-state lines across many messages: rewritten per message or folded per thread by a cheaper pass (Phase 2b).
- Which Google Contacts labels become lists by default (Phase 2b; start with all, let the user drop).
- Whether the agent's drafts need `gmail.compose` or `gmail.modify` suffices (Phase 4; check in the fake server).

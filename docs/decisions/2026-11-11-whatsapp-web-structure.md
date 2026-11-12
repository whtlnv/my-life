# WhatsApp Web structure and fixture fidelity (2026-11-11)

## What was measured

On 2026-11-10 the user ran a read-only snippet in the DevTools console of their `web.whatsapp.com` tab (the
`catala.francisco@gmail.com` profile), once in a one-to-one chat and once in a group with their own messages on screen.
It copied the structure of `#pane-side` (chat list) and `#main` (open chat) with every text node and the `title`,
`aria-label` and `data-pre-plain-text` attributes masked (letters to `a`, digits to `0`). Both captures were checked:
no unmasked letter or digit in any text node or masked attribute.

## What the page looks like (and what the plan had wrong)

- **A message's `data-id` is a bare hex id** (`3A23CD1B…`), not `true_<chat>@c.us_<id>`. The plan read sent-by-user from
  the `true_`/`false_` prefix; there is none. **Sent by the user** is read from the delivery-status icon (a labelled span
  inside `[data-testid="msg-meta"]`, the ✓✓), which only the user's own messages carry.
- **Sender and time** are in `data-pre-plain-text`: `[9:41 PM, 11/3/2026] Name: `, a 12-hour time with upper-case
  AM/PM and **month/day/year** (confirmed on the first real reports, 2026-11-11: read as day/month, a November
  conversation landed on the 11th of other months). The parser also reads lower-case, dotted and 24-hour times, and
  day/month when the first number is above 12. An unsaved group member is named by their phone number.
- **Photos and stickers** have no `data-pre-plain-text` and no text; they become `[photo]` and `[sticker]`, timed from
  `msg-meta`; other media with no text (voice notes, videos, documents) become `[media]`, with the previous sender. The parser fails only when no rendered row in the open chat has `data-pre-plain-text`.
- **Rows WhatsApp has not rendered** (scrolled away) are empty placeholders; only rendered rows are read.
- **Chat list:** title in `[data-testid="cell-frame-title"] span[title]`, time in `[data-testid="chat-list-timestamp"]`
  (display text such as `9:41 pm`, `Yesterday` or a weekday, not a date), unread count in
  `[data-testid="icon-unread-count"]`, last-message preview in the `title` of `[data-testid="last-msg-status"]` wrapped in
  bidi marks.
- **Composer:** `[data-testid="conversation-compose-box-input"]`, a Lexical editor (`data-lexical-editor`) that ignores a
  direct text change; the send types through a `beforeinput` `insertText` event.
- Class names are hashed atomic CSS and are never used as selectors.

## Fidelity gap

The fixtures (`apps/extension/src/whatsapp-*.fixture.html`) are trimmed from the masked captures, with made-up message
ids; no real text, name or number is in git. They are faithful to the page's structure on 2026-11-10, not to its
behavior: what WhatsApp does with a clicked chat row, an `insertText` event or a synthetic Enter is untested until the
walk-through, and WhatsApp can change the page at any time. A selector that stops matching makes the content script
report a parser failure, and the header chip says `whatsapp parser broken`.

The real message ids from the captures were in the fixtures for a few local commits on 2026-11-10 before being replaced;
they are random ids with no personal data.

## First real reports (2026-11-11)

The first reports stored no open-chat messages: upper-case `PM` failed the time pattern and the backend threw on the
first invalid time after marking WhatsApp healthy. Fixed test-first (time formats, a row with an unreadable time left
out, the backend skipping such a message, the open chat named by its header), then the date order. A report holds the
rows on screen when the page has been quiet for 10 s, so scrolling past a day without pausing does not report it.

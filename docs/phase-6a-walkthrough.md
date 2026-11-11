# Phase 6a walk-through — Telegram on the real account

Built and tested against a scripted Telegram client (2026-11-10). These steps check it against the user's own account once.

1. **Log in once.** In your own terminal (it needs a keyboard): `scripts/telegram-login.sh`. Phone number with country code, the code Telegram sends to the app, the 2FA password if set (not echoed). The session lands at `~/Library/Application Support/my-life/telegram-session`, mode 0600.
2. **Restart the backend** (`scripts/start-backend.sh`, or the launchd job). The log says nothing about Telegram when it connects; "telegram not logged in" or "telegram connect failed" means it did not.
3. **Header:** the `telegram` chip is green with the time of the last start or the last message received.
4. **Triage:** chats with unread messages from before the start appear under _Telegram_ (at most 20 recent messages per chat are read); a new message appears without a restart. Check a private chat, a basic group and a supergroup. A media message without text reads `[photo]`, `[video]`, `[voice note]`, `[audio]`, `[document]` or `[sticker]`, followed by its caption if any. A chat with a bot shows no card, sender or waiting-on entry; it is a digest with the bot's name and its unconfirmed message count, and confirming it clears it until the bot writes again.
5. **Open in Telegram:** the link opens the right chat in Telegram Web for each of the three kinds. The link is `https://web.telegram.org/k/#<marked id>`; whether Telegram Web K accepts the `-100…` form for a supergroup is unverified.
6. **Reply:** send a short reply from the composer to a chat you choose; it arrives in that chat (a group reply must land in the group, not in a private chat with a member), and the card leaves the queue.
7. **People:** the sender is listed once with their last message time; their timeline shows their messages; Mark VIP and Remove VIP stick after a restart.
8. **Nothing is sent** except what you pressed Send for.

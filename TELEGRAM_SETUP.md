# Telegram orders bot — MARHABA

The bot is a staff channel. Supabase stores the orders. The website never calls `api.telegram.org`.

The connected Supabase project is the one in `.env`:

`https://jwbfthadjyfwxpahmwid.supabase.co`

Do not put the bot token in `.env`, in `VITE_` variables, in git, or in this chat.

## 1. BotFather

1. Open Telegram and talk to [@BotFather](https://t.me/BotFather).
2. Send `/newbot` if this restaurant does not already have a bot.
3. Choose a display name, for example `MARHABA Orders`, and a username ending in `bot`.
4. BotFather replies with a token. Leave it in that private chat.

If the bot already exists, `/mybots` → the bot → **API Token** shows the current token. If the token was ever pasted into a shared chat, use **Revoke current token** and use only the new one.

## 2. Where the token goes

Supabase Dashboard → project `jwbfthadjyfwxpahmwid` → **Edge Functions** → **Secrets** (or Project Settings → Edge Functions → Secrets).

Add:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | The token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | A long random string, not the bot token |
| `TELEGRAM_ORDERS_CHAT_ID` | Optional until `/chatid` is known |

`TELEGRAM_ORDERS_CHAT_ID` can also be saved later in Admin → Заказы → Настройки. If the secret is set, it overrides the value in the database.

A helper that reads the token from the environment and does not print it:

```bash
cd marhaba-digital-menu
# PowerShell
$env:TELEGRAM_BOT_TOKEN = "<paste only in this private terminal>"
$env:SUPABASE_ACCESS_TOKEN = "<personal access token from supabase.com/dashboard/account/tokens>"
node scripts/setup-telegram.mjs
```

The script writes the webhook secret to `.secrets/telegram.env`, which is gitignored. It tries to store the secrets, then calls Telegram `setWebhook` and `getWebhookInfo`. Trust the printed `getWebhookInfo` result. A failed call means the webhook is not registered.

## 3. Staff group

1. Create a private group, for example `MARHABA | Заказы`.
2. Add the bot.
3. In BotFather, `/setprivacy` → the bot → **Disable**, so the bot can see a cancellation reason written in the group. Commands still work if privacy stays on, but a reason must then be sent as a reply to the bot.
4. Optional: make the bot a group admin so it can stay in the group. Admin rights in Telegram do not grant order permissions.

## 4. Database

In the Supabase SQL Editor, run:

`supabase/migrations/20261001193000_restaurant_orders.sql`

This does not replace the 120 QR tokens or table numbers. Run it once. It is safe to run again.

## 5. Deploy the Edge Functions

Install the Supabase CLI and log in with an account that can access project `jwbfthadjyfwxpahmwid`.

```bash
supabase functions deploy telegram-webhook --project-ref jwbfthadjyfwxpahmwid --no-verify-jwt
supabase functions deploy restaurant-orders --project-ref jwbfthadjyfwxpahmwid --no-verify-jwt
```

`telegram-webhook` checks `X-Telegram-Bot-Api-Secret-Token` itself. `restaurant-orders` checks the signed-in administrator for staff actions. Guest checkout is rate-limited and recalculates prices in the database. Both functions keep JWT verification off at the gateway because the site uses a publishable key, which is not a legacy JWT.

## 6. Register the webhook

After the function is deployed and the secrets exist, run `node scripts/setup-telegram.mjs` as above.

The webhook URL is:

`https://jwbfthadjyfwxpahmwid.supabase.co/functions/v1/telegram-webhook`

Telegram must call it with HTTPS. The secret is sent in the header, never in the query string.

## 7. Chat ID

1. Open the staff group.
2. Send `/chatid`.
3. The bot replies with `Chat ID: ...`.
4. Paste that number into Admin → Заказы → Настройки, or set `TELEGRAM_ORDERS_CHAT_ID` and run the setup script again.

`/chatid` does not show orders. It works for anyone in a chat where the bot can see the command.

## 8. Check webhook health

`scripts/setup-telegram.mjs` prints `getWebhookInfo`.

You want:

- `url` equal to the function URL above
- `pending_update_count` not stuck climbing
- `last_error_message` empty

Admin → Заказы → Уведомления → **Проверить бота** shows the same facts without the token: bot username, webhook URL, queued and failed notifications.

## 9. Who can press the buttons

Anyone who is currently a member of the configured restaurant group can press the buttons under an order. Separate staff accounts, roles, and `/link` codes are not used.

The bot checks two things:

- the tap came from the configured group;
- the Telegram user is still a member of that group.

## 10. First test

1. Scan a real table QR. The menu should show `Стол №…`. The QR token is not regenerated.
2. Add a dish. If it has several prices, choose one.
3. Confirm the order. The page should open the private tracking link.
4. The staff group should receive one message with Принять and Отклонить.
5. A linked manager presses Принять. The same message updates. The tracking page moves to Принят within a few seconds.
6. An account that has not used `/link` can press a button and must get “Недостаточно прав” without a status change.

Payment stays at the restaurant. The confirmation text says the order is not paid.

## 11. Troubleshooting

| What you see | What to check |
| --- | --- |
| `/chatid` does nothing | Webhook URL in `getWebhookInfo`. Function deployed. Secret header matches `TELEGRAM_WEBHOOK_SECRET`. |
| `401` in function logs | The secret in Telegram and in Supabase differ, or the secret was not set. The function rejects every request until the secret exists. |
| Order saved, no Telegram message | Admin → Уведомления. `TELEGRAM_CHAT_NOT_CONFIGURED` means `/chatid` has not been saved. Press **Повторить отправку** after saving it. |
| Button spins forever | The function did not answer the callback. Check the function logs for a crash after the secret check. |
| “Только участники группы” | The person left the group, or the tap did not come from the configured group. |
| Two taps, one order | Expected. Checkout reuses an idempotency key. A second request returns the same order. |
| Guest cannot reopen an order | The tracking link is random. An order number is not enough. Admin → the order → **Новая ссылка для гостя**. |
| Menu works, checkout says the server is not connected | Run the orders migration and deploy `restaurant-orders`. |
| Webhook last error `Wrong response from the webhook` | The function returned a non-200. A bad secret returns 401; fix the secret and call `setWebhook` again. |

Orders are stored before Telegram is contacted. A Telegram outage does not delete an accepted order. Failed deliveries are retried with backoff and then flagged for staff.

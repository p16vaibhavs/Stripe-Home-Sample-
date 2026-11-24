# Stripe Press Shop: Book Checkout with the Stripe Payment Element

A small Node.js/Express store that sells three Stripe Press books. A customer can:

1. **Select a book** on the home page.
2. **Check out and pay** with the embedded **Stripe Payment Element** (not Stripe Checkout).
3. **See a confirmation page** showing the **total charged** and the **PaymentIntent ID** (`pi_...`).

The project starts from the [`sa-takehome-project-node`](https://github.com/mattmitchell6/sa-takehome-project-node) boilerplate. I kept its structure and styling and added the payment flow.

---

## 1. Build, configure and run

### Prerequisites

- **Node.js 20 or later** (server checked with Node 26) and npm
- A **Stripe account** in test mode. You can [create one for free](https://dashboard.stripe.com/register).
- Optional: the [Stripe CLI](https://stripe.com/docs/stripe-cli), if you want to receive webhooks locally

### Install

```bash
cd sa-takehome-project-node
npm install
```

### Configure

Copy the sample environment file and add your **test-mode** keys from
[Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys):

```bash
cp sample.env .env
```

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
# Optional
# STRIPE_WEBHOOK_SECRET=whsec_...
# PORT=3000
```

`.env` is listed in `.gitignore`; keep it out of archives and do not share its secret key. If either key is missing, the server stops at startup and prints a clear message instead of failing later at checkout.

### Run

```bash
npm start
```

Open **http://localhost:3000**.

### Try a payment

Choose a book, enter any email address, and pay with one of Stripe's [test cards](https://stripe.com/docs/testing). Use any future expiry date, any CVC, and any postal code.

| Scenario | Card number |
|---|---|
| Successful payment | `4242 4242 4242 4242` |
| Requires 3D Secure authentication | `4000 0025 0000 3155` |
| Declined (insufficient funds) | `4000 0000 0000 9995` |
| Generic decline | `4000 0000 0000 0002` |

After a successful payment, the confirmation page shows the book, the amount charged (for example, **$25.00**), and the **PaymentIntent ID**. You can find the same payment under [Dashboard → Payments](https://dashboard.stripe.com/test/payments). Declined cards show an inline error on the checkout page, and the customer can try again.

### Optional: webhooks

```bash
stripe listen --forward-to localhost:3000/webhook
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET` and restart the app. Successful and failed payments are then logged by the server. This is where order fulfillment would be added.

---

## 2. How the solution works

### Payment flow

```
 Browser                                   Express server                     Stripe API
 ───────                                   ──────────────                     ──────────
 GET /checkout?item=2  ─────────────────▶  look up book in catalog
                       ◀─────────────────  render page + publishable key
 POST /create-payment-intent {item:2} ───▶  price looked up server-side
                                            paymentIntents.create(2500 usd) ─▶ PaymentIntent
                       ◀─────────────────  { clientSecret }               ◀── pi_..._secret_...
 stripe.elements({clientSecret})
 mount Payment Element (card, wallets, …)
 Pay → stripe.confirmPayment() ──────────────────────────────────────────────▶ confirm, 3DS if needed
                       ◀───────────────────────────── redirect to /success?payment_intent=pi_...
 GET /success?payment_intent=pi_... ─────▶  paymentIntents.retrieve(pi_...) ─▶ status, amount
                       ◀─────────────────  render amount + pi_ ID
                                            POST /webhook ◀──────────────────── payment_intent.succeeded
```

1. **Select a book.** The home page links to `/checkout?item=<id>`. The server looks up the book in `lib/catalog.js` and renders the checkout page with the title, price and **publishable** key.
2. **Create a PaymentIntent.** When the checkout page loads, `public/js/checkout.js` calls `POST /create-payment-intent` with **only the item ID**. The server looks up the price, creates a PaymentIntent with `automatic_payment_methods: { enabled: true }`, attaches the book as metadata, and returns the `client_secret`. Because the browser never sends a price, a customer cannot change the amount they are charged.
3. **Collect payment details.** Stripe.js initializes Elements with the client secret and mounts the **Payment Element**. The Payment Element shows the payment methods enabled in the Dashboard and handles card validation and formatting.
4. **Confirm the payment.** On submit, `stripe.confirmPayment()` sends the payment details directly to Stripe. Raw card data does not pass through our server, reducing its exposure to sensitive card data. PCI compliance depends on the full integration and deployment. The call also passes the customer's email as `receipt_email` and sets `return_url` to `/success`. If authentication such as 3D Secure is required, Stripe handles it. If the payment is declined, the error appears inline.
5. **Show the confirmation.** Stripe redirects to `/success?payment_intent=pi_...`. The server **retrieves the PaymentIntent from Stripe** instead of trusting query parameters. It then renders the status, the amount, the book title from metadata, the `pi_` ID and a receipt link, when available. It shows "Success!" only for a succeeded payment. For processing or failed payments, however, the current page can label the intended amount as "Total charged"; that label needs correction before production.
6. **Handle webhooks (optional).** `POST /webhook` verifies the `Stripe-Signature` header against the raw request body and logs `payment_intent.succeeded` and `payment_intent.payment_failed`. It does not update an order or notify a customer. In production, fulfillment belongs here because webhooks still arrive if the customer closes the tab before the redirect.

### Stripe APIs and products used

| Where | API | Purpose |
|---|---|---|
| Server (`stripe` Node SDK) | [`paymentIntents.create`](https://stripe.com/docs/api/payment_intents/create) | Creates the payment for the server-determined amount, with automatic payment methods and metadata |
| Server | [`paymentIntents.retrieve`](https://stripe.com/docs/api/payment_intents/retrieve) (expanding `latest_charge`) | Gets the trusted status, amount and receipt URL for the confirmation page |
| Server | [`webhooks.constructEvent`](https://stripe.com/docs/webhooks/signatures) | Verifies webhook signatures |
| Browser ([Stripe.js](https://stripe.com/docs/js)) | `stripe.elements({ clientSecret, appearance })` and `elements.create('payment')` | Renders the [Payment Element](https://stripe.com/docs/payments/payment-element), styled to match the Bootstrap UI with the Appearance API |
| Browser | [`stripe.confirmPayment`](https://stripe.com/docs/js/payment_intents/confirm_payment) | Confirms the PaymentIntent, runs 3DS when needed, and redirects to the return URL |

### Architecture

```
app.js                  Express server: config check, routes, Stripe calls, webhook
lib/catalog.js          Product catalog (source of checkout prices) + currency formatting
views/
  layouts/main.hbs      Shared Bootstrap layout and error banner
  index.hbs             Book selection
  checkout.hbs          Email field + Payment Element mount point
  success.hbs           Confirmation page: amount charged and PaymentIntent ID
public/js/
  checkout.js           Stripe.js: create intent, mount Payment Element, confirm payment
  custom.js             Formats cents as dollars in the UI (from the boilerplate)
sample.env              Template for API keys and optional settings
```

Design choices:

- **The server determines the charge.** Checkout prices come from `lib/catalog.js`, and the confirmation page reads its data from Stripe rather than from the URL. The home page also contains hard-coded display prices in `views/index.hbs`, so both places must currently be updated when a price changes.
- **Secrets stay on the server.** Only the publishable key is sent to the browser, and the secret key is read from `.env`.
- **The code is easy to extend.** Route handlers are short, the catalog is in its own module, and the client script uses the standard Payment Element flow. New Stripe features usually need one new route or a few extra PaymentIntent parameters.

---

## 3. How I approached the problem

1. **Read the boilerplate.** It already had the three pages and a hard-coded price switch, so I kept that structure and limited changes to the payment flow.
2. **Chose an integration pattern.** The brief asked for the Payment Element rather than Checkout, so the solution uses Stripe's [custom integration with Elements and Payment Intents](https://docs.stripe.com/payments/advanced): create the PaymentIntent on the server, mount the Payment Element with its client secret, call `confirmPayment`, and use a return URL.
3. **Started with security.** I moved prices into a server-side catalog, sent only the item ID from the browser, and built the confirmation page from a server-side `retrieve` call.
4. **Handled common cases,** including displaying declined-payment errors and distinguishing `processing` payments, invalid item IDs, missing configuration, and missing or unknown payment references.
5. **Checked the server routes** against a local stub of the Stripe API. These checks confirmed that a price sent by the client is ignored, unknown items return errors, `/success` rejects missing or unknown PaymentIntent IDs, and webhook signatures are enforced. The browser flow has **not yet been verified with a Stripe account and test card**; run the test described above before relying on or submitting the project.

### Documentation used

- [Custom integration with Elements and Payment Intents](https://docs.stripe.com/payments/advanced)
- [Payment Element overview](https://stripe.com/docs/payments/payment-element) and [Appearance API](https://stripe.com/docs/elements/appearance-api)
- [PaymentIntents API reference](https://stripe.com/docs/api/payment_intents) and [PaymentIntent lifecycle](https://stripe.com/docs/payments/paymentintents/lifecycle)
- [`stripe.confirmPayment` reference](https://stripe.com/docs/js/payment_intents/confirm_payment)
- [Webhooks and signature verification](https://stripe.com/docs/webhooks) and [Stripe CLI `listen`](https://stripe.com/docs/stripe-cli)
- [Testing and test cards](https://stripe.com/docs/testing)

### Challenges and decisions

- **When to create the PaymentIntent.** The Payment Element needs a client secret before it can render. I create the intent when the checkout page loads. This is the simplest documented pattern, but it can leave an unused, incomplete PaymentIntent when a customer leaves the page. That has no cost, but Stripe's [deferred intent creation](https://stripe.com/docs/payments/accept-a-payment-deferred) flow avoids it and is listed as an improvement below.
- **Showing a trustworthy confirmation.** The redirect URL contains the `pi_` ID, but a URL can be edited. Retrieving the PaymentIntent on the server ensures that the amount and status shown are the ones Stripe recorded.
- **Webhook raw body.** Signature verification needs the exact raw request bytes. The webhook route uses `express.raw()` and is registered **before** the global `express.json()` parser. Otherwise every signature check would fail.
- **Upgrading the SDK.** The boilerplate pinned `stripe@8`. I upgraded to the current Node SDK so the code uses the current API version and `automatic_payment_methods`.

---

## 4. How I would extend this for production

- **Fulfillment and orders:** Store orders in a database, create them as `pending`, and mark them `paid` only from the `payment_intent.succeeded` webhook. Use the event ID to make the handler idempotent.
- **Confirmation and access:** Authenticate access to payment details, correct the amount label for payments that have not succeeded, and only promise customer updates once notifications are implemented.
- **Catalog in Stripe:** Move books to Stripe [Products and Prices](https://stripe.com/docs/products-prices/overview) so prices can be managed in the Dashboard.
- **Cart and quantities:** Support multiple items, and add shipping and [Stripe Tax](https://stripe.com/docs/tax) by updating the PaymentIntent amount when the cart changes.
- **Deferred intent creation:** Render the Payment Element with `mode: 'payment'` and create the PaymentIntent only when the customer clicks Pay.
- **Customers and saved cards:** Create Stripe [Customers](https://stripe.com/docs/api/customers), use `setup_future_usage` to save payment methods, and add the [Link Authentication Element](https://stripe.com/docs/payments/elements/link-authentication-element) for faster checkout.
- **More payment methods and markets:** Enable wallets and local payment methods in the Dashboard. They appear automatically through `automatic_payment_methods`. Add multi-currency pricing too.
- **Operations:** Add refunds through an admin view (`refunds.create`), [Radar](https://stripe.com/docs/radar) rules, idempotency keys on create calls, structured logging, rate limiting, CSRF protection and a CSP that allows `js.stripe.com`.
- **Quality:** Add automated tests with [stripe-mock](https://github.com/stripe/stripe-mock) or test-mode fixtures, CI, and deployment with secrets in a managed secret store.

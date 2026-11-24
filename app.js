const express = require('express');
const path = require('path');
const exphbs = require('express-handlebars');
require('dotenv').config({ quiet: true });
const Stripe = require('stripe');
const { CURRENCY, getBook, formatAmount } = require('./lib/catalog');

const { STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET } = process.env;
const PORT = process.env.PORT || 3000;

if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
  console.error(
    'Missing Stripe API keys. Copy sample.env to .env and set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.'
  );
  process.exit(1);
}

const stripe = Stripe(STRIPE_SECRET_KEY);

const app = express();

// view engine setup (Handlebars)
app.engine('hbs', exphbs({
  defaultLayout: 'main',
  extname: '.hbs',
}));
app.set('view engine', 'hbs');
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Webhook route. Registered before the JSON body parser because Stripe's
 * signature check needs the raw request body.
 */
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send('Webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      // Fulfilment hook: this is where an order would be marked paid and shipped.
      console.log(`Payment succeeded: ${pi.id} for ${formatAmount(pi.amount, pi.currency)} (book ${pi.metadata.book_id})`);
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      console.log(`Payment failed: ${pi.id} - ${pi.last_payment_error && pi.last_payment_error.message}`);
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/**
 * Home route
 */
app.get('/', (req, res) => {
  res.render('index');
});

/**
 * Checkout route
 */
app.get('/checkout', (req, res) => {
  const book = getBook(req.query.item);

  if (!book) {
    return res.status(404).render('checkout', { error: 'No item selected' });
  }

  res.render('checkout', {
    book,
    amount: book.amount,
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
});

/**
 * Creates a PaymentIntent for the selected book and returns its client secret
 * to the browser, which uses it to initialise the Payment Element.
 */
app.post('/create-payment-intent', async (req, res) => {
  const book = getBook(req.body.item);

  if (!book) {
    return res.status(400).json({ error: { message: 'Unknown item' } });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: book.amount,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: false },
      
      description: book.title,
      metadata: { book_id: book.id, book_title: book.title },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(`Failed to create PaymentIntent: ${err.message}`);
    res.status(500).json({ error: { message: 'Unable to start checkout. Please try again.' } });
  }
});

/**
 * Success route. Stripe redirects here after confirmPayment with
 * ?payment_intent=pi_... appended. The PaymentIntent is retrieved server-side
 * so the amount and status shown come from Stripe, not from the URL.
 */
app.get('/success', async (req, res) => {
  const paymentIntentId = req.query.payment_intent;

  if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
    return res.status(400).render('success', { error: 'Missing or invalid payment reference.' });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = pi.latest_charge;

    res.render('success', {
      succeeded: pi.status === 'succeeded',
      processing: pi.status === 'processing',
      failed: !['succeeded', 'processing'].includes(pi.status),
      status: pi.status,
      paymentIntentId: pi.id,
      amount: formatAmount(pi.amount_received || pi.amount, pi.currency),
      title: pi.metadata.book_title || pi.description,
      email: pi.receipt_email || (charge && charge.billing_details && charge.billing_details.email),
      receiptUrl: charge && charge.receipt_url,
    });
  } catch (err) {
    console.error(`Failed to retrieve PaymentIntent ${paymentIntentId}: ${err.message}`);
    res.status(404).render('success', { error: 'We could not find that payment.' });
  }
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`Getting served on http://localhost:${PORT}`);
});

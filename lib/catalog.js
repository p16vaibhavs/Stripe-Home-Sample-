/**
 * Product catalog.
 *
 * The server is the single source of truth for prices: the browser only ever
 * sends an item id, and the amount charged is looked up here. In a production
 * app this would live in a database or in Stripe Products/Prices.
 */
const CURRENCY = 'usd';

const BOOKS = {
  1: {
    id: '1',
    title: 'The Art of Doing Science and Engineering',
    author: 'Richard Hamming',
    amount: 2300,
  },
  2: {
    id: '2',
    title: 'The Making of Prince of Persia: Journals 1985-1993',
    author: 'Jordan Mechner',
    amount: 2500,
  },
  3: {
    id: '3',
    title: 'Working in Public: The Making and Maintenance of Open Source',
    author: 'Nadia Eghbal',
    amount: 2800,
  },
};

function getBook(id) {
  return Object.prototype.hasOwnProperty.call(BOOKS, id) ? BOOKS[id] : null;
}

function formatAmount(amount, currency = CURRENCY) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

module.exports = { CURRENCY, BOOKS, getBook, formatAmount };

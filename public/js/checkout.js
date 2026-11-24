/**
 * Checkout page: mounts the Stripe Payment Element and confirms the payment.
 *
 * Flow:
 *  1. Ask our server to create a PaymentIntent for the selected book.
 *  2. Initialise Stripe Elements with the returned client secret and mount the
 *     Payment Element.
 *  3. On submit, call stripe.confirmPayment(). Stripe handles any required
 *     authentication (e.g. 3D Secure) and then redirects to /success.
 */
(function () {
  var form = document.getElementById('payment-form');
  if (!form) return;

  var submitButton = document.getElementById('submit');
  var spinner = document.getElementById('spinner');
  var buttonText = document.getElementById('button-text');
  var messageEl = document.getElementById('payment-message');
  var emailInput = document.getElementById('email');

  var stripe = Stripe(form.dataset.publishableKey);
  var elements;

  function showMessage(text) {
    messageEl.textContent = text;
    messageEl.classList.remove('d-none');
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.classList.add('d-none');
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    spinner.classList.toggle('d-none', !isLoading);
    buttonText.classList.toggle('d-none', isLoading);
  }

  async function initialize() {
    try {
      var response = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: form.dataset.item }),
      });
      var data = await response.json();

      if (!response.ok) {
        throw new Error((data.error && data.error.message) || 'Unable to start checkout.');
      }

      elements = stripe.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: { colorPrimary: '#007bff', fontFamily: 'Roboto, sans-serif' },
        },
      });

      var paymentElement = elements.create('payment', { layout: 'tabs' });
      paymentElement.on('ready', function () {
        var loading = document.getElementById('payment-element-loading');
        if (loading) loading.remove();
        submitButton.disabled = false;
      });
      paymentElement.mount('#payment-element');
    } catch (err) {
      showMessage(err.message);
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!elements) return;

    clearMessage();

    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    setLoading(true);

    var result = await stripe.confirmPayment({
      elements: elements,
      confirmParams: {
        return_url: window.location.origin + '/success',
        receipt_email: emailInput.value,
      },
    });

    // confirmPayment only resolves here if there was an immediate error
    // (e.g. card declined, invalid details); otherwise the customer is redirected.
    if (result.error) {
      showMessage(
        result.error.type === 'card_error' || result.error.type === 'validation_error'
          ? result.error.message
          : 'An unexpected error occurred. Please try again.'
      );
    }
    setLoading(false);
  });

  initialize();
})();

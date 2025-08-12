document.querySelector('.checkout-form').addEventListener('submit', async function (e) {
  e.preventDefault(); // Stop form from submitting normally
  
  // Validate form fields
  const inputs = document.querySelectorAll('.billing-form input[required], .billing-form select[required]');
  for (let input of inputs) {
    if (!input.value.trim()) {
      alert("Please fill in all required fields.");
      input.focus();
      return;
    }
  }

  const selectedPayment = document.querySelector('input[name="payment"]:checked');
  if (!selectedPayment) {
    alert("Please select a payment method.");
    return;
  }

  const paymentMethod = selectedPayment.value;

  const formData = new FormData(e.target);
  const billingInfo = Object.fromEntries(formData.entries());

  const submitButton = document.querySelector('.checkout-button');
  const originalText = submitButton.textContent;
  submitButton.textContent = 'Processing...';
  submitButton.disabled = true;

  try {
    switch (paymentMethod) {
      case "stripe":
        console.log("Redirecting to Stripe...");
        const response = await fetch('/stripe/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            billingInfo: billingInfo
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create Stripe session');
        }

        const data = await response.json();
        window.location.href = data.url;
        break;
        
      case "paypal":
        // PayPal integration
        console.log("Initiating PayPal payment...");
        initiatePayPalPayment(billingInfo);
        break;
        
      case "googlepay":
        // Google Pay integration
        console.log("Starting Google Pay...");
        
        // Check if we're in a supported browser
        if (!navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Safari')) {
          alert("Google Pay works best in Chrome or Safari browsers. Please try a different payment method.");
          break;
        }
        
        initiateGooglePayPayment(billingInfo);
        break;
      case "vnpay":
        // VNPay logic here
        console.log("Redirecting to VNPay...");
        
        // Get cart total
        const vnpayTotalElement = document.querySelector('.total-amount') || document.querySelector('[data-total]');
        const vnpayTotal = vnpayTotalElement ? vnpayTotalElement.textContent.replace(/[^0-9.]/g, '') : '20.00';
        
        const vnpayResponse = await fetch('/vnpay/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: parseFloat(vnpayTotal),
            billingInfo: billingInfo
          })
        });

        if (!vnpayResponse.ok) {
          const vnpayErrorData = await vnpayResponse.json();
          throw new Error(vnpayErrorData.error || 'Failed to create VNPay session');
        }

        const vnpayData = await vnpayResponse.json();
        window.location.href = vnpayData.url;
        break;
        
      default:
        alert("Unknown payment method.");
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    alert('An error occurred while processing your payment. Please try again.');
  } finally {
    // Reset button state
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }
});

// PayPal integration functions
function initiatePayPalPayment(billingInfo) {
  try {
    // Store billing info in session storage for later use
    sessionStorage.setItem('billingInfo', JSON.stringify(billingInfo));
    
    // Get cart total from the page
    const totalElement = document.querySelector('.total-amount') || document.querySelector('[data-total]');
    const total = totalElement ? totalElement.textContent.replace(/[^0-9.]/g, '') : '20.00';
    
    // Redirect to PayPal checkout endpoint with amount
    window.location.href = `/paypal?amount=${total}`;
    
  } catch (error) {
    alert('Failed to initiate PayPal payment. Please try again.');
  }
}

// Function to handle PayPal success callback
function handlePayPalSuccess(paymentData) {
  // Retrieve billing info
  const billingInfo = JSON.parse(sessionStorage.getItem('billingInfo') || '{}');
  
  // Complete the order processing
  completeOrder(paymentData, billingInfo);
}

// Function to complete the order after successful payment
async function completeOrder(paymentData, billingInfo) {
  try {
    const response = await fetch('/paypal/complete-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentData,
        billingInfo,
        paymentMethod: 'paypal'
      })
    });

    if (response.ok) {
      const result = await response.json();
      alert('Order completed successfully! Order ID: ' + result.orderId);
      // Clear session storage
      sessionStorage.removeItem('billingInfo');
      // Redirect to home
      window.location.href = '/';
    } else {
      throw new Error('Failed to complete order');
    }
  } catch (error) {
    alert('Payment successful but order completion failed. Please contact support.');
  }
}

/**
 * Google Pay API Configuration
 * Based on official Google Pay API documentation
 */

// 1. Define your Google Pay API version
const baseRequest = {
  apiVersion: 2,
  apiVersionMinor: 0
};

// 2. Request a payment token for your payment provider
const tokenizationSpecification = {
  type: 'PAYMENT_GATEWAY',
  parameters: {
    'gateway': 'example',
    'gatewayMerchantId': 'exampleGatewayMerchantId'
  }
};

// 3.1 Define supported payment card networks
const allowedCardNetworks = ["AMEX", "DISCOVER", "INTERAC", "JCB", "MASTERCARD", "VISA"];

// 3.2 Card authentication methods
const allowedCardAuthMethods = ["PAN_ONLY", "CRYPTOGRAM_3DS"];

// 4.1 Describe your allowed payment methods
const baseCardPaymentMethod = {
  type: 'CARD',
  parameters: {
    allowedAuthMethods: allowedCardAuthMethods,
    allowedCardNetworks: allowedCardNetworks
  }
};

// 4.2 Describe your allowed payment methods with tokenization
const cardPaymentMethod = Object.assign(
  {tokenizationSpecification: tokenizationSpecification},
  baseCardPaymentMethod
);

// 5. Google Pay client
let paymentsClient = null;

// 5.2 Return an active PaymentsClient or initialize
function getGooglePaymentsClient() {
  if (paymentsClient === null) {
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: 'TEST',
      paymentDataCallbacks: {
        onPaymentAuthorized: onPaymentAuthorized
      }
    });
  }
  return paymentsClient;
}

// 6.1 Determine readiness to pay with the Google Pay API
function getGoogleIsReadyToPayRequest() {
  return Object.assign(
    {},
    baseRequest,
    {
      allowedPaymentMethods: [baseCardPaymentMethod]
    }
  );
}

// 8. Create a PaymentDataRequest object
function getGooglePaymentDataRequest(total) {
  const paymentDataRequest = Object.assign({}, baseRequest);
  paymentDataRequest.allowedPaymentMethods = [cardPaymentMethod];
  paymentDataRequest.transactionInfo = getGoogleTransactionInfo(total);
  paymentDataRequest.merchantInfo = {
    merchantName: 'Demo Store'
  };
  paymentDataRequest.callbackIntents = ["PAYMENT_AUTHORIZATION"];
  return paymentDataRequest;
}

// 8.3 Part 2 - Provide transaction info
function getGoogleTransactionInfo(total) {
  return {
    displayItems: [
      {
        label: "Subtotal",
        type: "SUBTOTAL",
        price: total.toFixed(2),
      }
    ],
    countryCode: 'US',
    currencyCode: "USD",
    totalPriceStatus: "FINAL",
    totalPrice: total.toFixed(2),
    totalPriceLabel: "Total"
  };
}

// 10.3 Set up Authorize Payments
function onPaymentAuthorized(paymentData) {
  return new Promise(function(resolve, reject) {
    try {
      // Validate payment data
      if (!paymentData || !paymentData.paymentMethodData) {
        throw new Error('Invalid payment data received');
      }
      
      const paymentToken = paymentData.paymentMethodData.tokenizationData.token;
      
      // Get billing info from session storage
      const billingInfoStr = sessionStorage.getItem('billingInfo');
      if (!billingInfoStr) {
        throw new Error('Billing information not found');
      }
      
      const billingInfo = JSON.parse(billingInfoStr);
      
      // Get total from payment data or fallback
      let total = 20.00; // Default fallback
      if (paymentData.transactionInfo && paymentData.transactionInfo.totalPrice) {
        total = parseFloat(paymentData.transactionInfo.totalPrice);
      }
      
      // Complete the order
      handleGooglePaySuccess(paymentData, billingInfo, total);
      
      // Return success immediately
      resolve({transactionState: 'SUCCESS'});
      
    } catch (error) {
      console.error('Payment processing error:', error);
      
      // Return error with more specific message
      resolve({
        transactionState: 'ERROR',
        error: {
          intent: 'PAYMENT_AUTHORIZATION',
          message: error.message || 'Payment processing failed',
          reason: 'PAYMENT_DATA_INVALID'
        }
      });
    }
  });
}



// Google Pay integration function
function initiateGooglePayPayment(billingInfo) {
  try {
    // Check if Google Pay is available
    if (typeof google === 'undefined' || !google.payments) {
      setTimeout(() => {
        if (typeof google !== 'undefined' && google.payments) {
          initiateGooglePayPayment(billingInfo);
        } else {
          alert("Google Pay is not available. Please try a different payment method.");
        }
      }, 1000);
      return;
    }

    // Get cart total
    const totalElement = document.querySelector('.total-amount') || document.querySelector('[data-total]');
    const total = totalElement ? parseFloat(totalElement.textContent.replace(/[^0-9.]/g, '')) : 20.00;

    // Store billing info
    sessionStorage.setItem('billingInfo', JSON.stringify(billingInfo));

    // Initialize Google Pay client
    const paymentsClient = getGooglePaymentsClient();

    // Check if ready to pay
    paymentsClient.isReadyToPay(getGoogleIsReadyToPayRequest())
      .then(function(response) {
        if (response.result) {
          // Load payment data
          const paymentDataRequest = getGooglePaymentDataRequest(total);
          paymentsClient.loadPaymentData(paymentDataRequest)
            .then(function(paymentData) {
              // Payment will be processed in onPaymentAuthorized callback
            })
            .catch(function(err) {
              if (err.statusCode === 'CANCELED') {
                alert('Google Pay payment was cancelled.');
              } else {
                alert('Google Pay payment failed: ' + (err.message || 'Unknown error'));
              }
            });
        } else {
          alert('Google Pay is not available on this device/browser. Please try a different payment method.');
        }
      })
      .catch(function(err) {
        alert('Google Pay is not available. Please try a different payment method.');
      });

  } catch (error) {
    alert('Failed to initiate Google Pay payment: ' + error.message);
  }
}

// Handle Google Pay success
function handleGooglePaySuccess(paymentData, billingInfo, total) {
  try {
    // Create order data
    const orderData = {
      paymentMethod: 'googlepay',
      paymentData: {
        orderId: `GP-${Date.now()}`,
        id: paymentData.paymentMethodData?.tokenizationData?.token || `GP-${Date.now()}`,
        timestamp: new Date().toISOString()
      },
      billingInfo: billingInfo,
      total: total
    };
    
    // Send order to backend for storage
    fetch('/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        // Clear billing info from session storage
        sessionStorage.removeItem('billingInfo');
        
        // Show success message and redirect
        setTimeout(() => {
          try {
            alert(`Order completed successfully! Order ID: ${result.orderId}`);
            window.location.href = '/';
          } catch (uiError) {
            // Fallback redirect
            window.location.href = '/';
          }
        }, 100);
      } else {
        throw new Error(result.message || 'Failed to create order');
      }
    })
    .catch(error => {
      console.error('Error creating order:', error);
      alert('Payment successful but order creation failed. Please contact support.');
    });
    
  } catch (error) {
    console.error('Error in handleGooglePaySuccess:', error);
    throw error; // Re-throw to be caught by onPaymentAuthorized
  }
}



// Check if we're returning from payment success/cancel
document.addEventListener('DOMContentLoaded', function() {
  // Check URL parameters for payment success/cancel
  const urlParams = new URLSearchParams(window.location.search);
  const paypalStatus = urlParams.get('paypal_status');
  const stripeStatus = urlParams.get('stripe_status');
  const vnpayStatus = urlParams.get('vnpay_status');
  
  // Debug logging
  console.log('Payment status check:', { paypalStatus, stripeStatus, vnpayStatus });
  console.log('Full URL:', window.location.href);
  
  if (paypalStatus === 'success') {
    const paymentData = urlParams.get('payment_data');
    if (paymentData) {
      handlePayPalSuccess(JSON.parse(decodeURIComponent(paymentData)));
    }
  } else if (paypalStatus === 'cancel') {
    alert('Payment was cancelled.');
  } else if (stripeStatus === 'success') {
    const orderId = urlParams.get('order_id');
    console.log('Stripe success with order ID:', orderId);
    alert('Order completed successfully! Order ID: ' + orderId);
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  } else if (stripeStatus === 'cancel') {
    alert('Payment was cancelled.');
  } else if (stripeStatus === 'error') {
    alert('Payment failed. Please try again.');
  } else if (vnpayStatus === 'success') {
    const orderId = urlParams.get('order_id');
    console.log('VNPay success with order ID:', orderId);
    alert('Order completed successfully! Order ID: ' + orderId);
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  } else if (vnpayStatus === 'error') {
    const errorCode = urlParams.get('code');
    alert('Payment failed. Error code: ' + (errorCode || 'Unknown'));
  }
});

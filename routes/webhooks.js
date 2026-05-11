/**
 * routes/webhooks.js
 * External webhooks (Paystack, etc.)
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Order = require('../models/Order');

// Verify Paystack webhook signature
function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY not configured in .env');
    return false;
  }

  const hash = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return hash === req.headers['x-paystack-signature'];
}

router.post('/paystack', async (req, res) => {
  try {
    // Verify webhook signature for security
    if (!verifyPaystackSignature(req)) {
      console.warn('⚠️  Invalid Paystack webhook signature - possible attack');
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const event = req.body.event;
    const data = req.body.data;

    // Handle only successful charge events
    if (event === 'charge.success') {
      const reference = data.reference;
      const paidAmount = data.amount; // Amount in kobo (₦ * 100)
      
      const order = await Order.findOne({ 'payment.reference': reference });
      
      if (!order) {
        console.warn(`⚠️ Payment successful but order not found for reference: ${reference}`);
        return res.sendStatus(200); // Still acknowledge webhook to prevent retries
      }

      // ✅ CRITICAL: Verify amount matches order total
      const expectedAmount = Math.round(order.total * 100); // Convert to kobo
      if (paidAmount !== expectedAmount) {
        console.error(
          `🚨 SECURITY ALERT: Amount mismatch for order ${order._id}. ` +
          `Expected: ₦${order.total} (${expectedAmount} kobo), ` +
          `Received: ₦${paidAmount / 100} (${paidAmount} kobo). ` +
          `Reference: ${reference}. PAYMENT REJECTED.`
        );
        // Mark as failed to prevent order confirmation
        await Order.findByIdAndUpdate(order._id, {
          $set: { 'payment.status': 'failed' }
        });
        return res.status(400).json({ 
          success: false, 
          error: 'Payment amount does not match order total' 
        });
      }

      // Amount verified - safe to confirm order
      await Order.findByIdAndUpdate(order._id, {
        $set: {
          'payment.status': 'paid',
          'payment.amount': paidAmount / 100, // Store in naira
          'payment.paidAt': new Date(),
          status: 'confirmed'
        }
      });
      
      console.log(`✅ Payment verified and confirmed for reference: ${reference}. Order ${order._id} confirmed.`);
    } else if (event === 'charge.failed') {
      const reference = data.reference;
      await Order.findOneAndUpdate(
        { 'payment.reference': reference },
        { $set: { 'payment.status': 'failed' } }
      );
      console.log(`❌ Payment failed for reference: ${reference}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

module.exports = router;

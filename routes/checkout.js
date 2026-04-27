/**
 * routes/checkout.js  +  Hybrid Checkout Engine (controller logic inline)
 *
 * The "Hybrid Checkout" supports two flows:
 *   1. 'online_payment'  → Paystack popup → webhook confirms → order saved as 'confirmed'
 *   2. 'whatsapp'        → Build structured WA message → redirect → order saved as 'pending'
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: Upsert Customer (CRM auto-save)
// ─────────────────────────────────────────────────────────────────────────────
async function upsertCustomer(vendorId, { fullName, email, phone, city, state, addressLine1, addressLine2 }, channel) {
  const customer = await Customer.findOneAndUpdate(
    { vendor: vendorId, phone },
    {
      $setOnInsert: {
        vendor: vendorId,
        phone,
        acquisitionChannel: channel,
      },
      $set: {
        fullName: fullName || '',
        email: email || null,
      },
      $addToSet: {
        addresses: { addressLine1, addressLine2, city, state, lastUsedAt: new Date() },
      },
    },
    { upsert: true, new: true }
  );
  return customer;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: Build WhatsApp message URL
// ─────────────────────────────────────────────────────────────────────────────
function buildWhatsAppUrl(vendorPhone, { items, deliveryAddress, orderNumber, total }) {
  const itemLines = items
    .map(
      (item) =>
        `  • ${item.name} x${item.quantity} — ₦${item.price.toLocaleString('en-NG')}` +
        (item.selectedVariants && Object.keys(item.selectedVariants).length
          ? ` (${Object.entries(item.selectedVariants)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')})`
          : '')
    )
    .join('\n');

  const message = `Hello! I'd like to place an order 🛒

*Order Ref:* ${orderNumber}

*Items:*
${itemLines}

*Delivery Address:*
${deliveryAddress.fullName}
${deliveryAddress.addressLine1}${deliveryAddress.addressLine2 ? ', ' + deliveryAddress.addressLine2 : ''}
${deliveryAddress.city}, ${deliveryAddress.state}
📞 ${deliveryAddress.phone}

${deliveryAddress.additionalNotes ? `*Note:* ${deliveryAddress.additionalNotes}\n` : ''}
*Order Total:* ₦${total.toLocaleString('en-NG')}

Please confirm my order. Thank you!`;

  const cleaned = vendorPhone.replace(/\D/g, '');
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: Validate & hydrate cart items from DB
// ─────────────────────────────────────────────────────────────────────────────
async function hydrateCartItems(rawItems, vendorId) {
  const productIds = rawItems.map((i) => i.productId);
  const products = await Product.find({
    _id: { $in: productIds },
    vendor: vendorId,
    isPublished: true,
  }).lean();

  const productMap = {};
  products.forEach((p) => (productMap[p._id.toString()] = p));

  const hydratedItems = [];
  const errors = [];

  for (const cartItem of rawItems) {
    const product = productMap[cartItem.productId];
    if (!product) {
      errors.push(`Product not found or unavailable.`);
      continue;
    }
    if (product.stockStatus === 'sold_out') {
      errors.push(`"${product.name}" is sold out.`);
      continue;
    }
    hydratedItems.push({
      product: product._id,
      name: product.name,
      price: product.price,                       // Always use DB price — never trust client
      quantity: Math.max(1, parseInt(cartItem.quantity) || 1),
      selectedVariants: cartItem.selectedVariants || {},
      imageUrl: product.images?.[0]?.url ?? null,
    });
  }

  return { hydratedItems, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /checkout/:vendorSlug/whatsapp
//  WhatsApp Order Flow
// ─────────────────────────────────────────────────────────────────────────────
// Validation middleware
const validateCheckoutInput = [
  body('buyer.fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('buyer.email')
    .trim()
    .optional()
    .isEmail()
    .withMessage('Invalid email format'),
  body('buyer.phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[\d\s\-\+\(\)]{10,}$/)
    .withMessage('Invalid phone number format'),
  body('buyer.addressLine1')
    .trim()
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('buyer.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('buyer.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Cart must contain at least one item'),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Quantity must be between 1 and 1000'),
  body('deliveryFee')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('Invalid delivery fee'),
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

router.post('/:vendorSlug/whatsapp', validateCheckoutInput, handleValidationErrors, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.vendorSlug, isActive: true }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Store not found.' });

    const { buyer, items: rawItems, deliveryFee = 0 } = req.body;

    // 1. Validate & hydrate items
    const { hydratedItems, errors } = await hydrateCartItems(rawItems, vendor._id);
    if (errors.length) return res.status(400).json({ success: false, errors });
    if (!hydratedItems.length) return res.status(400).json({ success: false, message: 'Your cart is empty.' });

    // 2. Calculate totals (server-side only)
    const subtotal = hydratedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + Number(deliveryFee);

    // 3. Upsert customer in CRM
    const customer = await upsertCustomer(vendor._id, buyer, 'whatsapp_checkout');

    // 4. Create order (status: 'pending')
    const order = await Order.create({
      vendor: vendor._id,
      customer: customer._id,
      items: hydratedItems,
      subtotal,
      deliveryFee: Number(deliveryFee),
      total,
      deliveryAddress: buyer,
      checkoutMethod: 'whatsapp',
      payment: { method: 'whatsapp', status: 'pending', amount: total },
      status: 'pending',
      whatsappMessageSent: true,
    });

    // 5. Build WhatsApp redirect URL
    const waUrl = buildWhatsAppUrl(vendor.phone, {
      items: hydratedItems,
      deliveryAddress: buyer,
      orderNumber: order.orderNumber,
      total,
    });

    // 6. Save redirect URL on order (for audit)
    order.whatsappRedirectUrl = waUrl;
    await order.save();

    // 7. Update customer purchase stats (lightweight — fire async)
    Customer.findByIdAndUpdate(customer._id, {
      $inc: { totalOrders: 1, totalSpend: total },
      $set: { lastOrderAt: new Date() },
      $setOnInsert: { firstOrderId: order._id },
    }).exec();

    // 8. Respond with redirect URL for client-side navigation
    return res.json({
      success: true,
      orderNumber: order.orderNumber,
      redirectUrl: waUrl,
      storeSuccessUrl: `/store/${vendor.slug}/order-success?ref=${order.orderNumber}`,
    });
  } catch (err) {
    console.error('WhatsApp checkout error:', err);
    res.status(500).json({ success: false, message: 'Checkout failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /checkout/:vendorSlug/initiate-payment
//  Paystack Online Payment — Step 1: Create order, return Paystack reference
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:vendorSlug/initiate-payment', validateCheckoutInput, handleValidationErrors, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.vendorSlug, isActive: true }).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Store not found.' });

    const { buyer, items: rawItems, deliveryFee = 0 } = req.body;

    const { hydratedItems, errors } = await hydrateCartItems(rawItems, vendor._id);
    if (errors.length) return res.status(400).json({ success: false, errors });
    if (!hydratedItems.length) return res.status(400).json({ success: false, message: 'Cart is empty.' });

    const subtotal = hydratedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = subtotal + Number(deliveryFee);

    // Upsert customer
    const customer = await upsertCustomer(vendor._id, buyer, 'online_payment');

    // Create order in 'pending' state — webhook will confirm it
    const order = await Order.create({
      vendor: vendor._id,
      customer: customer._id,
      items: hydratedItems,
      subtotal,
      deliveryFee: Number(deliveryFee),
      total,
      deliveryAddress: buyer,
      checkoutMethod: 'online_payment',
      payment: { method: 'paystack', status: 'pending', amount: total },
      status: 'pending',
    });

    // Generate a unique Paystack reference tied to this order
    const paystackRef = `WS-${order.orderNumber}-${Date.now()}`;
    order.payment.reference = paystackRef;
    await order.save();

    return res.json({
      success: true,
      paystackRef,
      amountKobo: total * 100, // Paystack uses kobo
      email: buyer.email,
      orderNumber: order.orderNumber,
      callbackUrl: `/store/${vendor.slug}/order-success?ref=${order.orderNumber}`,
    });
  } catch (err) {
    console.error('Payment initiation error:', err);
    res.status(500).json({ success: false, message: 'Could not initiate payment.' });
  }
});

// ── POST /checkout/:vendorSlug/cancel-order/:id ──────────────────────────────
router.post('/:vendorSlug/cancel-order/:id', async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, status: 'pending' });
    if (!order) {
      req.session.flashError = 'Order cannot be cancelled as it is already being processed.';
      return res.redirect('back');
    }

    order.status = 'cancelled';
    await order.save();

    req.session.flashSuccess = 'Order cancelled successfully.';
    res.redirect(`/store/${req.params.vendorSlug}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
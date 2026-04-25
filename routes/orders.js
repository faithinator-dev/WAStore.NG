/**
 * routes/orders.js
 * Vendor order management.
 */

const express = require('express');
const router = express.Router();
const { requireVendorAuth, attachVendor } = require('../middleware/auth');
const Order = require('../models/Order');

// Apply auth guards
router.use(requireVendorAuth, attachVendor);

// ── GET /dashboard/orders ─────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const orders = await Order.find({ vendor: req.vendor._id })
      .sort({ createdAt: -1 })
      .populate('customer', 'fullName phone');
    res.render('vendor/orders', { title: 'Manage Orders', orders });
  } catch (err) {
    next(err);
  }
});

// ── GET /dashboard/orders/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, vendor: req.vendor._id })
      .populate('customer')
      .populate('items.product');
    if (!order) return res.redirect('/dashboard/orders');
    res.render('vendor/orders/details', { title: `Order #${order._id.toString().slice(-6)}`, order });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /dashboard/orders/:id/status ────────────────────────────────────────
router.patch('/:id/status', async (req, res, next) => {
  const { status } = req.body;
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, vendor: req.vendor._id },
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    req.session.flashSuccess = `Order marked as ${status}.`;
    res.redirect(`/dashboard/orders/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// ── GET /dashboard/orders/export ─────────────────────────────────────────────
router.get('/export', async (req, res, next) => {
  try {
    const orders = await Order.find({ vendor: req.vendor._id })
      .sort({ createdAt: -1 })
      .populate('customer', 'fullName phone');

    // Simple CSV header
    let csv = 'Order Ref,Date,Customer,Phone,Total,Status,Payment Status\n';
    
    orders.forEach(o => {
      const date = o.createdAt.toLocaleDateString();
      const customer = o.customer ? o.customer.fullName : 'Guest';
      const phone = o.customer ? o.customer.phone : '';
      csv += `${o.orderNumber},${date},"${customer}","${phone}",${o.total},${o.status},${o.payment.status}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${req.vendor.slug}.csv`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

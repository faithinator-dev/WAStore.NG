/**
 * routes/customers.js
 * Vendor customer management.
 */

const express = require('express');
const router = express.Router();
const { requireVendorAuth, attachVendor } = require('../middleware/auth');
const Customer = require('../models/Customer');

// Apply auth guards
router.use(requireVendorAuth, attachVendor);

// ── GET /dashboard/customers ──────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const customers = await Customer.find({ vendor: req.vendor._id }).sort({ lastOrderedAt: -1 });
    res.render('vendor/customers', { title: 'Customer Database', customers });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

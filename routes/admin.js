/**
 * routes/admin.js
 * Platform-wide administration.
 */

const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../middleware/adminAuth');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

// Apply admin guard to all routes in this file
router.use(requireAdminAuth);

// ── GET /admin ────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const [
      totalVendors,
      totalOrders,
      totalRevenue,
      totalProducts,
      recentVendors
    ] = await Promise.all([
      Vendor.countDocuments({ role: 'vendor' }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { 'payment.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Product.countDocuments(),
      Vendor.find({ role: 'vendor' }).sort({ createdAt: -1 }).limit(5)
    ]);

    const stats = {
      totalVendors,
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalProducts
    };

    res.render('admin/dashboard', { 
      title: 'Platform Admin', 
      stats, 
      recentVendors,
      layout: 'layout' // Use standard layout or create admin layout
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /admin/vendors ────────────────────────────────────────────────────
router.get('/vendors', async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ role: 'vendor' }).sort({ createdAt: -1 });
    res.render('admin/vendors', { title: 'Manage Vendors', vendors });
  } catch (err) {
    next(err);
  }
});

// ── POST /admin/vendors/:id/verify ────────────────────────────────────────
router.post('/vendors/:id/verify', async (req, res, next) => {
  try {
    await Vendor.findByIdAndUpdate(req.params.id, { 
      isVerified: true, 
      verifiedAt: new Date() 
    });
    req.session.flashSuccess = 'Vendor verified successfully.';
    res.redirect('/admin/vendors');
  } catch (err) {
    next(err);
  }
});

// ── POST /admin/vendors/:id/toggle-status ──────────────────────────────────
router.post('/vendors/:id/toggle-status', async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    vendor.isActive = !vendor.isActive;
    await vendor.save();
    req.session.flashSuccess = `Vendor ${vendor.isActive ? 'activated' : 'deactivated'} successfully.`;
    res.redirect('/admin/vendors');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

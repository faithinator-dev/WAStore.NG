/**
 * routes/customer-portal.js
 * Customer Self-Service Portal — /store/:vendorSlug/account/*
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');

// Middleware to resolve store and check customer session
async function resolveCustomerStore(req, res, next) {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.vendorSlug, isActive: true }).lean();
    if (!vendor) return res.status(404).render('errors/store-not-found', { title: 'Store Not Found', slug: req.params.vendorSlug });
    
    res.locals.store = vendor;
    req.store = vendor;
    
    // Check if customer is logged in for this specific vendor
    if (req.session.customer && req.session.customer.vendorId === vendor._id.toString()) {
      res.locals.customer = req.session.customer;
    }
    
    next();
  } catch (err) {
    next(err);
  }
}

function requireCustomerAuth(req, res, next) {
  if (!res.locals.customer) {
    return res.redirect(`/store/${req.params.vendorSlug}/account/login`);
  }
  next();
}

router.use(resolveCustomerStore);

// ── GET /store/:vendorSlug/account/login ─────────────────────────────────────
router.get('/login', (req, res) => {
  if (res.locals.customer) return res.redirect(`/store/${req.params.vendorSlug}/account`);
  res.render('store/account/login', { title: 'Customer Login', errors: null });
});

// ── POST /store/:vendorSlug/account/login ────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const customer = await Customer.findOne({ vendor: req.store._id, phone }).select('+passwordHash');
    
    if (!customer || !customer.passwordHash) {
      return res.render('store/account/login', { 
        title: 'Customer Login', 
        errors: [{ msg: 'No account found. Please place an order first to create an account.' }] 
      });
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      return res.render('store/account/login', { title: 'Customer Login', errors: [{ msg: 'Invalid credentials.' }] });
    }

    req.session.customer = {
      _id: customer._id,
      vendorId: req.store._id.toString(),
      fullName: customer.fullName,
      phone: customer.phone
    };

    res.redirect(`/store/${req.params.vendorSlug}/account`);
  } catch (err) {
    console.error(err);
    res.render('store/account/login', { title: 'Customer Login', errors: [{ msg: 'Something went wrong.' }] });
  }
});

// ── GET /store/:vendorSlug/account ───────────────────────────────────────────
router.get('/', requireCustomerAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.session.customer._id, vendor: req.store._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.render('store/account/dashboard', {
      title: 'My Account',
      orders
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /store/:vendorSlug/account/orders ────────────────────────────────────
router.get('/orders', requireCustomerAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.session.customer._id, vendor: req.store._id })
      .sort({ createdAt: -1 });
    
    res.render('store/account/orders', {
      title: 'My Orders',
      orders
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /store/:vendorSlug/account/logout ───────────────────────────────────
router.post('/logout', (req, res) => {
  delete req.session.customer;
  res.redirect(`/store/${req.params.vendorSlug}`);
});

module.exports = router;

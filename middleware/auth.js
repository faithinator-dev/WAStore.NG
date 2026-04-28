/**
 * middleware/auth.js
 * Protects vendor dashboard routes.
 */

exports.requireVendorAuth = (req, res, next) => {
  if (!req.session?.vendor) {
    req.session.flashError = 'Please log in to access your dashboard.';
    return res.redirect('/auth/login');
  }

  // Restrict access if email not verified
  if (req.session.vendor.emailVerified === false) {
    return res.redirect('/auth/verify-notice');
  }

  next();
};

/**
 * Attach full vendor document to res.locals for EJS templates.
 * Use after requireVendorAuth.
 */
const Vendor = require('../models/Vendor');

exports.attachVendor = async (req, res, next) => {
  try {
    if (!req.session?.vendor?._id) {
      req.session.flashError = 'Session expired. Please log in again.';
      return res.redirect('/auth/login');
    }

    const vendor = await Vendor.findById(req.session.vendor._id).lean();
    if (!vendor) {
      req.session.destroy(() => {
        req.session.flashError = 'Vendor account not found.';
        res.redirect('/auth/login');
      });
      return;
    }

    // Sync session state
    req.session.vendor.emailVerified = vendor.emailVerified;

    res.locals.vendor = vendor;
    req.vendor = vendor;
    next();
  } catch (err) {
    console.error('Error attaching vendor:', err);
    next(err);
  }
};
/**
 * middleware/adminAuth.js
 * Guards routes to ensure only users with 'admin' role can access.
 */

exports.requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.vendor && req.session.vendor.role === 'admin') {
    return next();
  }
  
  // If a regular vendor tries to access /admin, redirect them or show error
  req.session.flashError = 'Unauthorized access. Admins only.';
  res.redirect('/dashboard');
};

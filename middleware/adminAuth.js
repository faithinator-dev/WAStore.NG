/**
 * middleware/adminAuth.js
 * Guards routes to ensure only users with 'admin' role can access.
 */

exports.requireAdminAuth = (req, res, next) => {
  console.log('--- ADMIN ACCESS CHECK ---');
  console.log('Session Data:', req.session.vendor);
  
  if (req.session && req.session.vendor && req.session.vendor.role === 'admin') {
    console.log('✅ Access Granted');
    return next();
  }
  
  console.log('❌ Access Denied: User role is', req.session?.vendor?.role || 'undefined');
  req.session.flashError = 'Unauthorized access. Admins only.';
  res.redirect('/dashboard');
};

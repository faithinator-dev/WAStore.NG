const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send a password reset email
 * @param {string} to - Recipient email
 * @param {string} resetUrl - The URL for resetting the password
 */
exports.sendResetEmail = async (to, resetUrl) => {
  const mailOptions = {
    from: `"WaStore Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Password Reset Request - WaStore',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #25D366; text-align: center;">WaStore</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your WaStore vendor account. Click the button below to set a new password. This link will expire in 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #25D366; color: white; padding: 12px 25px; text-decoration: none; border-radius: 50px; font-weight: bold;">Reset Password</a>
        </div>
        <p>If you did not request this, please ignore this email or contact support if you have concerns.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">Nigerian Commerce, Global Impact.</p>
      </div>
    `,
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('--- DEVELOPMENT MAIL PREVIEW ---');
    console.log(`To: ${to}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log('--------------------------------');
    return; // Don't try to send real mail in dev unless configured
  }

  return transporter.sendMail(mailOptions);
};

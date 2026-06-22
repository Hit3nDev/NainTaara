const crypto = require("crypto");

const RESEND_API_URL = "https://api.resend.com/emails";
const NOTIFY_TO = process.env.DONATION_NOTIFY_EMAIL || "support@naintaara.ngo";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "support@naintaara.ngo";

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set — skipping email send");
    return { ok: false, skipped: true };
  }
  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Nain Taara Welfare Foundation <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Resend API error:", resp.status, errText);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { ok: false };
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      donor_name,
      donor_email,
      donor_mobile,
      donor_pan,
      amount,
      purpose,
      recurring,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    // Payment is verified. Fire off notification emails (best-effort —
    // failures here must never change the success response below, since
    // the payment itself is already confirmed and final).
    const safeName = escapeHtml(donor_name) || "N/A";
    const safeEmail = escapeHtml(donor_email) || "N/A";
    const safeMobile = escapeHtml(donor_mobile) || "N/A";
    const safePan = escapeHtml(donor_pan) || "Not provided";
    const safePurpose = escapeHtml(purpose) || "Where Needed Most";
    const safeRecurring = escapeHtml(recurring) || "One-time Donation";
    const safeAmount = amount ? `₹${amount}` : "N/A";
    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const adminHtml = `
      <h2>New Donation Received</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td><strong>Name</strong></td><td>${safeName}</td></tr>
        <tr><td><strong>Email</strong></td><td>${safeEmail}</td></tr>
        <tr><td><strong>Mobile</strong></td><td>${safeMobile}</td></tr>
        <tr><td><strong>Amount</strong></td><td>${safeAmount}</td></tr>
        <tr><td><strong>Purpose</strong></td><td>${safePurpose}</td></tr>
        <tr><td><strong>Donation Type</strong></td><td>${safeRecurring}</td></tr>
        <tr><td><strong>PAN</strong></td><td>${safePan}</td></tr>
        <tr><td><strong>Razorpay Order ID</strong></td><td>${escapeHtml(razorpay_order_id)}</td></tr>
        <tr><td><strong>Razorpay Payment ID</strong></td><td>${escapeHtml(razorpay_payment_id)}</td></tr>
        <tr><td><strong>Date/Time (IST)</strong></td><td>${timestamp}</td></tr>
      </table>
    `;

    const donorHtml = `
      <p>Dear ${safeName},</p>
      <p>Thank you for your generous donation of <strong>${safeAmount}</strong> to Nain Taara Welfare Foundation
      towards <strong>${safePurpose}</strong>. Your support helps us restore sight and transform lives.</p>
      <p><strong>Payment Reference:</strong> ${escapeHtml(razorpay_payment_id)}<br>
      <strong>Date:</strong> ${timestamp}</p>
      <p>Your 80G tax-exemption receipt will be issued after the financial year ends and sent to this email address.</p>
      <p>With gratitude,<br>Nain Taara Welfare Foundation</p>
    `;

    // Fire both emails; use Promise.allSettled so one failing never
    // affects the other or the verification response below.
    await Promise.allSettled([
      sendEmail({
        to: NOTIFY_TO,
        subject: `New Donation: ${safeAmount} from ${safeName}`,
        html: adminHtml,
      }),
      donor_email
        ? sendEmail({
            to: donor_email,
            subject: "Thank You for Your Donation — Nain Taara Welfare Foundation",
            html: donorHtml,
          })
        : Promise.resolve(),
    ]);

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
    });

  }
};
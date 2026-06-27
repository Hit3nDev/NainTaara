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
      wants_80g_receipt,
      id_type,
      id_number,
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
    const wants80G = wants_80g_receipt === "Yes";
    const safeWants80G = wants80G ? "Yes" : "No";
    const safeIdType = wants80G ? (escapeHtml(id_type) || "Not specified") : "—";
    const safeIdNumber = wants80G ? (escapeHtml(id_number) || "Not provided") : "—";
    const safePurpose = escapeHtml(purpose) || "Where Needed Most";
    const safeRecurring = escapeHtml(recurring) || "One-time Donation";
    const safeAmount = amount ? `₹${amount}` : "N/A";
    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const LOGO_URL = "https://res.cloudinary.com/dajekho84/image/upload/v1780296549/3cc8f12c-b8af-4915-b31b-cb36ecdff172_removalai_preview_olxguq.png";
    const BRAND_ORANGE = "#C05A18";
    const BRAND_DARK = "#1a1208";
    const receiptNote = wants80G
      ? `Your <strong>80G tax-exemption receipt</strong> will be issued after the financial year ends and sent to this email address, using the ${safeIdType} on record with this donation.`
      : `You chose not to request an 80G tax receipt for this donation. If you'd like one, write to us at <a href="mailto:support@naintaara.ngo" style="color:${BRAND_ORANGE};">support@naintaara.ngo</a> with a valid ID before the financial year ends.`;

    const adminHtml = `
    <div style="background:#f4f1ea;padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ece7da;">
        <div style="background:${BRAND_DARK};padding:20px 28px;">
          <span style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Nain Taara Welfare Foundation</span>
        </div>
        <div style="padding:28px;">
          <h2 style="margin:0 0 4px;color:${BRAND_DARK};font-size:20px;">New Donation Received</h2>
          <p style="margin:0 0 20px;color:${BRAND_ORANGE};font-size:28px;font-weight:700;">${safeAmount}</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:${BRAND_DARK};">
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Name</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;font-weight:600;">${safeName}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Email</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;">${safeEmail}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Mobile</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;">${safeMobile}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Purpose</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;">${safePurpose}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Donation Type</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;">${safeRecurring}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">80G Receipt Requested</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;font-weight:600;">${safeWants80G}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">ID Type</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;">${safeIdType}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">ID Number</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;font-family:monospace;">${safeIdNumber}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Order ID</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(razorpay_order_id)}</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #f0ece0;color:#8a7d68;">Payment ID</td><td style="padding:8px 0;border-bottom:1px solid #f0ece0;text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(razorpay_payment_id)}</td></tr>
            <tr><td style="padding:8px 0;color:#8a7d68;">Date/Time (IST)</td><td style="padding:8px 0;text-align:right;">${timestamp}</td></tr>
          </table>
        </div>
      </div>
    </div>
    `;

    const donorHtml = `
    <div style="background:#f4f1ea;padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ece7da;">
        <div style="background:${BRAND_DARK};padding:32px 28px;text-align:center;">
          <img src="${LOGO_URL}" alt="Nain Taara Welfare Foundation" style="height:48px;max-width:240px;" />
        </div>
        <div style="padding:36px 32px;">
          <p style="margin:0 0 4px;color:#8a7d68;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Thank You</p>
          <h1 style="margin:0 0 20px;color:${BRAND_DARK};font-size:24px;font-family:Georgia,serif;">Dear ${safeName},</h1>
          <p style="margin:0 0 20px;color:#4a4136;font-size:15px;line-height:1.7;">
            Your generous donation of <strong style="color:${BRAND_ORANGE};">${safeAmount}</strong> towards
            <strong>${safePurpose}</strong> has been received with gratitude. Because of you, we can continue
            restoring sight and transforming lives.
          </p>
          <div style="background:#f9f6ee;border-radius:8px;padding:18px 20px;margin:24px 0;">
            <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#4a4136;">
              <tr><td style="padding:4px 0;color:#8a7d68;">Payment Reference</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${escapeHtml(razorpay_payment_id)}</td></tr>
              <tr><td style="padding:4px 0;color:#8a7d68;">Date</td><td style="padding:4px 0;text-align:right;">${timestamp}</td></tr>
              <tr><td style="padding:4px 0;color:#8a7d68;">Donation Type</td><td style="padding:4px 0;text-align:right;">${safeRecurring}</td></tr>
            </table>
          </div>
          <p style="margin:0 0 28px;color:#4a4136;font-size:14px;line-height:1.7;">
            ${receiptNote}
          </p>
          <p style="margin:0;color:${BRAND_DARK};font-size:15px;">With gratitude,<br><strong>Nain Taara Welfare Foundation</strong></p>
        </div>
        <div style="background:#f9f6ee;padding:18px 28px;text-align:center;border-top:1px solid #ece7da;">
          <p style="margin:0;color:#a89c87;font-size:11px;">Section 8 Company · Delhi, India · support@naintaara.ngo</p>
        </div>
      </div>
    </div>
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
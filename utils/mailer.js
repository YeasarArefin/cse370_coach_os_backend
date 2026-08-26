const nodemailer = require("nodemailer");

// Create nodemailer transporter — called fresh each time so env vars are always read
const createTransporter = () => {
  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const rawPass = process.env.SMTP_PASS || "";

  if (!user || !rawPass) {
    console.warn(
      "⚠️  SMTP_USER or SMTP_PASS not set — emails will NOT be sent."
    );
    return null;
  }

  // Strip spaces from App Password (Google App Passwords have spaces)
  const cleanPass = rawPass.replace(/\s+/g, "");
  const isGmail =
    host.toLowerCase().includes("gmail") ||
    user.toLowerCase().includes("gmail.com");

  if (isGmail) {
    // Gmail: always use service shorthand with TLS on port 587
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: user.trim(),
        pass: cleanPass,
      },
    });
  }

  // Generic SMTP (non-Gmail)
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for SSL, false for TLS
    auth: {
      user: user.trim(),
      pass: cleanPass,
    },
  });
};

// Verify SMTP connection on startup (logs status without crashing)
const verifyMailer = () => {
  const t = createTransporter();
  if (!t) return;
  t.verify((err) => {
    if (err) {
      console.error("❌ SMTP connection failed:", err.message);
    } else {
      console.log("✅ SMTP connection verified — mailer is ready");
    }
  });
};

verifyMailer();

/**
 * Send notice notification email to recipient(s)
 */
const sendNoticeEmail = async ({ to, title, content, batchName }) => {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    return { success: false, message: "No recipients provided" };
  }

  const recipients = Array.isArray(to) ? to.join(", ") : to;
  const isGlobal = !batchName;

  const subject = isGlobal
    ? `📢 [Notice] ${title}`
    : `📢 [${batchName}] ${title}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
      <div style="background-color: #0f172a; color: #ffffff; padding: 16px 20px; border-radius: 6px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 18px;">CoachOS</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
          ${isGlobal ? "Global Announcement for all students" : `Cohort Announcement: ${batchName}`}
        </p>
      </div>

      <div style="padding: 0 10px;">
        <h3 style="color: #0f172a; font-size: 18px; margin-top: 0;">${title}</h3>
        <div style="color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-line; margin-top: 12px;">
          ${content}
        </div>
      </div>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      
      <p style="font-size: 11px; color: #64748b; text-align: center; margin: 0;">
        This is an automated notification from your CoachOS management system.
      </p>
    </div>
  `;

  const senderAddress =
    process.env.SMTP_FROM ||
    (process.env.SMTP_USER
      ? `"CoachOS" <${process.env.SMTP_USER}>`
      : '"CoachOS" <no-reply@coaching.edu>');

  const t = createTransporter();
  if (!t) {
    console.warn("⚠️  Skipping notice email — SMTP not configured.");
    return { success: false, error: "SMTP not configured" };
  }

  try {
    const info = await t.sendMail({
      from: senderAddress,
      to: recipients,
      subject,
      text: `${title}\n\n${content}`,
      html,
    });

    console.log("✅ Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Mailer send error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send monthly fee reminder email to a student
 */
const sendFeeReminderEmail = async ({
  to,
  studentName,
  month,
  amount,
  dueDate,
  batchNames,
}) => {
  if (!to) {
    return { success: false, message: "No recipient provided" };
  }

  const subject = `🔔 Monthly Fee Reminder for ${month} — CoachOS`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e5; border-radius: 8px; background-color: #ffffff;">
      <div style="background-color: #0f172a; color: #ffffff; padding: 18px 20px; border-radius: 6px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 18px;">CoachOS</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
          Monthly Tuition Fee Reminder
        </p>
      </div>

      <div style="padding: 0 10px; color: #334155; font-size: 14px; line-height: 1.6;">
        <p style="margin-top: 0;">Dear <strong>${studentName}</strong>,</p>
        <p>
          This is a friendly reminder that your monthly tuition fee for <strong>${month}</strong> is due.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <div style="margin-bottom: 8px;">
            <span style="color: #64748b; font-size: 13px;">Billing Month:</span>
            <strong style="color: #0f172a; margin-left: 6px;">${month}</strong>
          </div>
          <div style="margin-bottom: 8px;">
            <span style="color: #64748b; font-size: 13px;">Enrolled Course Batch(es):</span>
            <strong style="color: #0f172a; margin-left: 6px;">${batchNames || "General"}</strong>
          </div>
          ${dueDate
      ? `<div style="margin-bottom: 8px;">
                  <span style="color: #64748b; font-size: 13px;">Due Date (based on admission date):</span>
                  <strong style="color: #0f172a; margin-left: 6px;">${dueDate}</strong>
                </div>`
      : ""
    }
          <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px;">
            <span style="font-weight: bold; color: #0f172a; font-size: 14px;">Total Payable Amount:</span>
            <strong style="color: #0f172a; font-size: 16px; margin-left: 8px;">৳${Number(
      amount
    ).toLocaleString()}</strong>
          </div>
        </div>

        <p>
          Please settle your fee payment to ensure uninterrupted access to course materials, classes, and examination results.
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
          * If you have already completed your payment for this month, please disregard this notice.
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
        CoachOS · Academic Management System
      </p>
    </div>
  `;

  const senderAddress =
    process.env.SMTP_FROM ||
    (process.env.SMTP_USER
      ? `"CoachOS" <${process.env.SMTP_USER}>`
      : '"CoachOS" <no-reply@coaching.edu>');

  const t = createTransporter();
  if (!t) {
    console.warn("⚠️  Skipping fee reminder email — SMTP not configured.");
    return { success: false, error: "SMTP not configured" };
  }

  try {
    const info = await t.sendMail({
      from: senderAddress,
      to,
      subject,
      text: `Dear ${studentName},\n\nYour monthly fee of ৳${amount} for ${month} is due. Please pay at your earliest convenience.\n\nUniversity CoachOS`,
      html,
    });

    console.log(`✅ Fee reminder sent to ${to} (${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send fee reminder to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendNoticeEmail,
  sendFeeReminderEmail,
};

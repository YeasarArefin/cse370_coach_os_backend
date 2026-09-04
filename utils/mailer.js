const nodemailer = require("nodemailer");

/**
 * Send email via Brevo HTTPS API (Port 443 — NEVER blocked on Render or cloud hosts)
 * Allows sending from your verified Gmail address to ANY student email address for free (300/day).
 */
const sendViaBrevo = async ({ to, subject, html, text }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  try {
    const rawRecipients = Array.isArray(to) ? to : [to];
    const recipients = rawRecipients
      .map((email) => (typeof email === "string" ? email.trim() : email))
      .filter(Boolean)
      .map((email) => ({ email }));

    if (recipients.length === 0) {
      return { success: false, error: "No valid recipient email provided" };
    }

    // Sender email must be verified on Brevo (defaults to SMTP_USER or BREVO_SENDER_EMAIL)
    const senderEmail =
      process.env.BREVO_SENDER_EMAIL ||
      process.env.SMTP_USER ||
      "execlusivemart@gmail.com";

    const senderName = process.env.BREVO_SENDER_NAME || "CoachOS";

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail.trim(),
      },
      to: recipients,
      subject,
      htmlContent: html,
      textContent: text,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey.trim(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ Brevo API error:", data);
      return {
        success: false,
        error: data.message || data.code || "Brevo API error",
      };
    }

    console.log("✅ Email sent successfully via Brevo HTTPS:", data.messageId);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error("❌ Brevo fetch error:", error.message);
    return { success: false, error: error.message };
  }
};

// Create nodemailer transporter — configured for direct SMTP (Port 465 SSL or 587 TLS)
const createTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const user = process.env.SMTP_USER || "";
  const rawPass = process.env.SMTP_PASS || "";
  const port = Number(process.env.SMTP_PORT) || 465;

  if (!user || !rawPass) {
    return null;
  }

  // Strip spaces from App Password (Google App Passwords have spaces)
  const cleanPass = rawPass.replace(/\s+/g, "");
  const isPort465 = port === 465;

  return nodemailer.createTransport({
    host: host.trim() || "smtp.gmail.com",
    port: port,
    secure: isPort465, // true for 465 (SSL direct), false for 587 (TLS/STARTTLS)
    auth: {
      user: user.trim(),
      pass: cleanPass,
    },
    family: 4, // Force IPv4 resolution on Linux
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

// Verify email configuration on startup
const verifyMailer = () => {
  if (process.env.BREVO_API_KEY) {
    console.log("✅ Mailer configured with Brevo HTTPS API (Port 443)");
    return;
  }
  if (process.env.RESEND_API_KEY) {
    console.log("✅ Mailer configured with Resend HTTPS API (Port 443)");
    return;
  }
  const t = createTransporter();
  if (!t) {
    console.warn("⚠️  No email credentials found (BREVO_API_KEY or SMTP_USER/SMTP_PASS).");
    return;
  }
  t.verify((err) => {
    if (err) {
      console.error(
        "⚠️  SMTP direct connection failed (Render free tier blocks SMTP ports 25/465/587):",
        err.message
      );
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

  // 1. Send via Brevo HTTPS API (Port 443 — guaranteed on Render, sends to ANY recipient)
  if (process.env.BREVO_API_KEY) {
    return await sendViaBrevo({
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: `${title}\n\n${content}`,
    });
  }

  // 2. Fallback to direct SMTP (Nodemailer)
  const t = createTransporter();
  if (!t) {
    console.warn("⚠️  Skipping notice email — No email credentials configured.");
    return { success: false, error: "No email credentials configured" };
  }

  try {
    const info = await t.sendMail({
      from: senderAddress,
      to: recipients,
      subject,
      text: `${title}\n\n${content}`,
      html,
    });

    console.log("✅ Email sent successfully via SMTP:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Mailer SMTP send error:", error.message);
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
          ${
            dueDate
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

  // 1. Send via Brevo HTTPS API (Port 443 — guaranteed on Render, sends to ANY recipient)
  if (process.env.BREVO_API_KEY) {
    return await sendViaBrevo({
      to: [to],
      subject,
      html,
      text: `Dear ${studentName},\n\nYour monthly fee of ৳${amount} for ${month} is due. Please pay at your earliest convenience.\n\nUniversity CoachOS`,
    });
  }

  // 2. Fallback to direct SMTP (Nodemailer)
  const t = createTransporter();
  if (!t) {
    console.warn("⚠️  Skipping fee reminder email — No email credentials configured.");
    return { success: false, error: "No email credentials configured" };
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

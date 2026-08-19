const nodemailer = require("nodemailer");

// Create nodemailer transporter
const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;

  if (user && rawPass) {
    const cleanPass = rawPass.replace(/\s+/g, ""); // Strip spaces if App Password
    const port = Number(process.env.SMTP_PORT) || 587;
    const isGmail = host && host.includes("gmail");

    if (isGmail) {
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: user.trim(),
          pass: cleanPass,
        },
      });
    }

    return nodemailer.createTransport({
      host: host || "smtp.gmail.com",
      port: port,
      secure: port === 465,
      auth: {
        user: user.trim(),
        pass: cleanPass,
      },
    });
  }

  // Fallback test / mock transporter if SMTP env vars are not configured
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "test@ethereal.email",
      pass: "testpass",
    },
  });
};

const transporter = createTransporter();

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
        <h2 style="margin: 0; font-size: 18px;">University Coaching Center</h2>
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
        This is an automated notification from your coaching center management system.
      </p>
    </div>
  `;

  const senderAddress =
    process.env.SMTP_FROM ||
    (process.env.SMTP_USER
      ? `"University Coaching Center" <${process.env.SMTP_USER}>`
      : '"University Coaching Center" <no-reply@coaching.edu>');

  try {
    const info = await transporter.sendMail({
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

module.exports = {
  sendNoticeEmail,
};

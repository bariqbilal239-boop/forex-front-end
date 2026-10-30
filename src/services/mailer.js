// Sends email through any SMTP provider (Brevo, Mailgun, SendGrid, Amazon SES, Gmail, ...).
// Without SMTP_HOST, emails are saved to data/outbox/ as .html files so you can preview them in development.
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

let transport;

export const emailEnabled = () => Boolean(process.env.SMTP_HOST);

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

/** @param {{ to: string, subject: string, html: string, text: string, replyTo?: string, headers?: Record<string,string> }} mail */
export async function sendEmail(mail) {
  if (!emailEnabled()) {
    const dir = path.resolve("data/outbox");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.html`);
    fs.writeFileSync(file, `<!-- To: ${mail.to} | Subject: ${mail.subject} -->\n${mail.html}`);
    console.log(`[email] SMTP not configured — saved "${mail.subject}" to ${path.relative(process.cwd(), file)}`);
    return;
  }
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM || `"${process.env.SITE_NAME || "Aurum Markets"}" <no-reply@localhost>`,
    ...mail,
  });
}

/** Fire-and-forget for emails that must not block or fail a request (auto-replies, notifications). */
export function sendInBackground(mail) {
  sendEmail(mail).catch((err) => console.error(`[email] failed to send "${mail.subject}" to ${mail.to}:`, err.message));
}

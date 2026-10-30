// Branded email templates. Table layout + inline styles so they render in Gmail, Outlook and Apple Mail.
// Every template returns { subject, html, text }.

const C = { navy: "#0B1220", gold: "#D4AF37", goldDark: "#8A6D12", ink: "#0F172A", body: "#334155", muted: "#64748B", line: "#E2E8F0", bg: "#F1F5F9" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const brand = () => process.env.SITE_NAME || "Aurum Markets";
const siteUrl = () => process.env.SITE_URL || "http://localhost:3000";

const button = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr>
    <td style="border-radius:10px;background:${C.gold}">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font:600 15px ${FONT};color:${C.navy};text-decoration:none;border-radius:10px">${esc(label)}</a>
    </td>
  </tr></table>`;

const p = (html) => `<p style="margin:0 0 16px;font:400 16px/1.65 ${FONT};color:${C.body}">${html}</p>`;
const h1 = (text) => `<h1 style="margin:0 0 16px;font:700 26px/1.25 ${FONT};color:${C.ink};letter-spacing:-0.02em">${esc(text)}</h1>`;
const eyebrow = (text) => `<p style="margin:0 0 10px;font:700 12px ${FONT};letter-spacing:0.14em;text-transform:uppercase;color:${C.goldDark}">${esc(text)}</p>`;
const box = (html) => `<div style="margin:20px 0;padding:18px 20px;border-radius:12px;background:#FBF5E1;border:1px solid #F1E3B0;font:400 15px/1.6 ${FONT};color:${C.body}">${html}</div>`;

/** Shared shell: dark header with logo, white card, footer with disclaimer and optional unsubscribe link. */
function layout({ preheader, content, unsubscribeUrl }) {
  const name = esc(brand());
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${name}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="background:${C.navy};border-radius:16px 16px 0 0;padding:24px 32px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:36px;height:36px;border-radius:8px;background:${C.gold};text-align:center;font:800 14px/36px ${FONT};color:${C.navy}">Au</td>
        <td style="padding-left:12px;font:800 18px ${FONT};color:#F8FAFC">${name}</td>
      </tr></table>
    </td></tr>
    <tr><td style="height:3px;background:linear-gradient(90deg,${C.gold},#F0D77A,${C.gold});background-color:${C.gold}"></td></tr>
    <tr><td style="background:#FFFFFF;padding:36px 32px 28px;border-radius:0 0 16px 16px">${content}</td></tr>
    <tr><td style="padding:24px 8px;text-align:center;font:400 12px/1.6 ${FONT};color:${C.muted}">
      <p style="margin:0 0 8px">${name} · Independent research on gold, Forex, Bitcoin and global markets</p>
      <p style="margin:0 0 8px">Educational content only — not investment advice. Trading leveraged products carries a high risk of loss.</p>
      ${unsubscribeUrl ? `<p style="margin:0"><a href="${esc(unsubscribeUrl)}" style="color:${C.muted}">Unsubscribe</a> · <a href="${esc(siteUrl())}" style="color:${C.muted}">Visit website</a></p>` : `<p style="margin:0"><a href="${esc(siteUrl())}" style="color:${C.muted}">Visit website</a></p>`}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const footerText = (unsubscribeUrl) =>
  `\n\n—\n${brand()} · Educational content only — not investment advice.${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}`;

// ---------- Newsletter ----------

export function confirmSubscription({ confirmUrl }) {
  return {
    subject: `Confirm your ${brand()} subscription`,
    html: layout({
      preheader: "One click to start receiving the Daily Gold Brief.",
      content:
        eyebrow("The Daily Gold Brief") +
        h1("Please confirm your email") +
        p("Thanks for signing up. Confirm your address and we'll send levels, catalysts and analysis every trading morning.") +
        button(confirmUrl, "Confirm subscription") +
        p(`<span style="font-size:13px;color:${C.muted}">If you didn't sign up, ignore this email — you won't be subscribed.</span>`),
    }),
    text: `Please confirm your email\n\nConfirm your subscription to the Daily Gold Brief:\n${confirmUrl}\n\nIf you didn't sign up, ignore this email.${footerText()}`,
  };
}

export function welcome({ unsubscribeUrl }) {
  const items = [
    ["Daily Gold Brief", "Key levels and the day's catalysts before the London open."],
    ["Weekly FX & Crypto wrap", "What moved EUR/USD, USD/JPY and Bitcoin — and what's next."],
    ["Event alerts", "Short notes around Fed, ECB and NFP releases."],
  ];
  return {
    subject: `Welcome to ${brand()}`,
    html: layout({
      preheader: "You're subscribed. Here's what to expect.",
      unsubscribeUrl,
      content:
        eyebrow("You're in") +
        h1(`Welcome to ${brand()}`) +
        p("Your subscription is confirmed. Here's what you'll receive:") +
        items
          .map(
            ([t, d]) =>
              `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr>
                <td style="width:10px;background:${C.gold};border-radius:4px"></td>
                <td style="padding:12px 16px;background:${C.bg};border-radius:0 10px 10px 0;font:400 15px/1.5 ${FONT};color:${C.body}"><b style="color:${C.ink}">${esc(t)}</b><br>${esc(d)}</td>
              </tr></table>`
          )
          .join("") +
        button(`${siteUrl()}/blog`, "Read the latest analysis"),
    }),
    text: `Welcome to ${brand()}\n\nYour subscription is confirmed. You'll receive:\n${items.map(([t, d]) => `• ${t}: ${d}`).join("\n")}\n\nRead the latest analysis: ${siteUrl()}/blog${footerText(unsubscribeUrl)}`,
  };
}

/** Admin-written campaign (e.g. Daily Gold Brief). `body` is plain text; blank lines become paragraphs. */
export function campaign({ subject, preheader, body, unsubscribeUrl }) {
  const paragraphs = String(body).split(/\n{2,}/).map((para) => p(esc(para).replace(/\n/g, "<br>"))).join("");
  return {
    subject,
    html: layout({
      preheader: preheader || subject,
      unsubscribeUrl,
      content:
        eyebrow(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })) +
        h1(subject) +
        paragraphs +
        button(`${siteUrl()}/gold`, "Open the gold dashboard"),
    }),
    text: `${subject}\n\n${body}\n\nGold dashboard: ${siteUrl()}/gold${footerText(unsubscribeUrl)}`,
  };
}

// ---------- Contact ----------

export function contactAutoReply({ name, subject }) {
  return {
    subject: `We received your message: ${subject}`,
    html: layout({
      preheader: "Thanks for getting in touch — we'll reply within one business day.",
      content:
        h1(`Thanks, ${name}`) +
        p("We've received your message and a member of our team will reply within one business day (Mon–Fri, 08:00–18:00 GMT).") +
        box(`<b style="color:${C.ink}">Your subject</b><br>${esc(subject)}`) +
        p(`<span style="font-size:13px;color:${C.muted}">We can't provide personal investment advice by email.</span>`),
    }),
    text: `Thanks, ${name}\n\nWe've received your message ("${subject}") and will reply within one business day.${footerText()}`,
  };
}

export function contactNotification({ name, email, category, subject, message, adminUrl }) {
  return {
    subject: `New contact message: ${subject}`,
    html: layout({
      preheader: `${name} (${category}) sent a message.`,
      content:
        eyebrow(category || "Contact form") +
        h1(subject) +
        p(`<b style="color:${C.ink}">${esc(name)}</b> · <a href="mailto:${esc(email)}" style="color:${C.goldDark}">${esc(email)}</a>`) +
        box(esc(message).replace(/\n/g, "<br>")) +
        button(adminUrl, "Open in Contact Inbox"),
    }),
    text: `New contact message\n\nFrom: ${name} <${email}>\nCategory: ${category}\nSubject: ${subject}\n\n${message}\n\nOpen inbox: ${adminUrl}`,
  };
}

export function contactReply({ name, subject, reply, staffName }) {
  return {
    subject: `Re: ${subject}`,
    html: layout({
      preheader: String(reply).slice(0, 90),
      content:
        p(`Hi ${esc(name)},`) +
        String(reply).split(/\n{2,}/).map((para) => p(esc(para).replace(/\n/g, "<br>"))).join("") +
        p(`Best regards,<br><b style="color:${C.ink}">${esc(staffName)}</b><br><span style="color:${C.muted}">${esc(brand())}</span>`),
    }),
    text: `Hi ${name},\n\n${reply}\n\nBest regards,\n${staffName}\n${brand()}${footerText()}`,
  };
}

// ---------- Account ----------

export function passwordChanged({ name }) {
  return {
    subject: `Your ${brand()} admin password was changed`,
    html: layout({
      preheader: "Security notice for your admin account.",
      content:
        eyebrow("Security notice") +
        h1("Your password was changed") +
        p(`Hi ${esc(name)}, the password for your admin account was changed on ${esc(new Date().toUTCString())}.`) +
        box("If this wasn't you, contact your site administrator immediately and change your password."),
    }),
    text: `Your password was changed\n\nHi ${name}, the password for your admin account was changed on ${new Date().toUTCString()}.\nIf this wasn't you, contact your site administrator immediately.`,
  };
}

/** Sample data for previewing every template (used by /api/emails/preview). */
export const previews = {
  "confirm-subscription": () => confirmSubscription({ confirmUrl: `${siteUrl()}/newsletter?status=confirmed` }),
  welcome: () => welcome({ unsubscribeUrl: "#unsubscribe" }),
  campaign: () =>
    campaign({
      subject: "Daily Gold Brief — gold holds above 2,700",
      body: "Gold is consolidating above support as real yields ease.\n\nKey levels today: resistance 2,790, support 2,705.\n\nWatch: US Core PCE at 12:30 GMT.",
      unsubscribeUrl: "#unsubscribe",
    }),
  "contact-auto-reply": () => contactAutoReply({ name: "Jane", subject: "Question about the gold calculator" }),
  "contact-notification": () =>
    contactNotification({ name: "Jane Doe", email: "jane@example.com", category: "Technical support", subject: "Gold calculator question", message: "Hello,\nThe tola value looks different from my local dealer. Could you explain why?", adminUrl: "#inbox" }),
  "contact-reply": () => contactReply({ name: "Jane", subject: "Gold calculator question", reply: "Thanks for your message.\n\nLocal dealers add import duty and a premium, so their price is usually higher than spot.", staffName: "Sarah Mitchell" }),
  "password-changed": () => passwordChanged({ name: "Site Admin" }),
};

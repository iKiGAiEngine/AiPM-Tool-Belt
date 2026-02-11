import sgMail from "@sendgrid/mail";

const EMAIL_PROVIDER = process.env.SENDGRID_API_KEY ? "sendgrid" : "console";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@aipm-toolbelt.com";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export async function sendOTPEmail(to: string, code: string): Promise<void> {
  const subject = "AiPM Tool Belt - Your Login Code";
  const text = `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #111;">AiPM Tool Belt</h2>
      <p style="color: #555; margin: 0 0 24px 0;">Your login verification code:</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: 'JetBrains Mono', monospace; color: #111;">${code}</span>
      </div>
      <p style="color: #888; font-size: 13px; margin: 0;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
    </div>
  `;

  if (EMAIL_PROVIDER === "sendgrid") {
    try {
      await sgMail.send({ to, from: EMAIL_FROM, subject, text, html });
      console.log(`[Email] OTP sent to ${to} via SendGrid`);
    } catch (error: any) {
      console.error(`[Email] SendGrid error:`, error?.response?.body || error.message);
      throw new Error("Failed to send verification email");
    }
  } else {
    console.log(`\n========================================`);
    console.log(`[Email-DEV] OTP Code for ${to}: ${code}`);
    console.log(`========================================\n`);
  }
}

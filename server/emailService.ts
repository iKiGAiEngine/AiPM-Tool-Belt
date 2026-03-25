import sgMail from "@sendgrid/mail";
import { db } from "./db";
import { emailTemplateConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

const EMAIL_PROVIDER = process.env.SENDGRID_API_KEY ? "sendgrid" : "console";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@aipm-toolbelt.com";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export const BID_ASSIGNMENT_DEFAULTS = {
  subject: "AiPM Tool Belt - New Bid Assignment",
  greeting: "Hello {{estimator}},",
  bodyMessage: "You have been assigned to a new bid. Please review the details below and begin your estimate.",
  signOff: "Thank you,\nAiPM Tool Belt Team",
};

export async function getBidAssignmentTemplate(): Promise<{
  subject: string;
  greeting: string;
  bodyMessage: string;
  signOff: string;
}> {
  const [config] = await db
    .select()
    .from(emailTemplateConfig)
    .where(eq(emailTemplateConfig.templateKey, "bid_assignment"));

  if (config) {
    return {
      subject: config.subject,
      greeting: config.greeting,
      bodyMessage: config.bodyMessage,
      signOff: config.signOff,
    };
  }

  return { ...BID_ASSIGNMENT_DEFAULTS };
}

export async function saveBidAssignmentTemplate(data: {
  subject: string;
  greeting: string;
  bodyMessage: string;
  signOff: string;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(emailTemplateConfig)
    .where(eq(emailTemplateConfig.templateKey, "bid_assignment"));

  if (existing) {
    await db
      .update(emailTemplateConfig)
      .set({
        subject: data.subject,
        greeting: data.greeting,
        bodyMessage: data.bodyMessage,
        signOff: data.signOff,
        updatedAt: new Date(),
      })
      .where(eq(emailTemplateConfig.id, existing.id));
  } else {
    await db.insert(emailTemplateConfig).values({
      templateKey: "bid_assignment",
      subject: data.subject,
      greeting: data.greeting,
      bodyMessage: data.bodyMessage,
      signOff: data.signOff,
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildBidAssignmentHtml(
  template: { subject: string; greeting: string; bodyMessage: string; signOff: string },
  details: {
    estimatorName: string;
    projectName: string;
    estimateNumber: string;
    dueDate: string;
    gcLead: string;
  }
): { subject: string; text: string; html: string } {
  const greeting = escapeHtml(template.greeting.replace(/\{\{estimator\}\}/g, details.estimatorName));
  const bodyMessage = escapeHtml(template.bodyMessage);
  const signOff = escapeHtml(template.signOff).replace(/\n/g, "<br>");

  const subject = template.subject;

  const text = [
    greeting,
    "",
    bodyMessage,
    "",
    `Project: ${details.projectName}`,
    `Estimate #: ${details.estimateNumber}`,
    `Due Date: ${details.dueDate || "Not set"}`,
    `GC Lead: ${details.gcLead || "Not set"}`,
    "",
    template.signOff,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <div style="border-bottom: 3px solid #D4A843; padding-bottom: 12px; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px; color: #111;">AiPM Tool Belt</h2>
      </div>
      <p style="color: #333; font-size: 15px; margin: 0 0 16px 0;">${greeting}</p>
      <p style="color: #555; font-size: 14px; margin: 0 0 20px 0;">${bodyMessage}</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #D4A843;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #888; font-size: 13px; width: 110px;">Project</td>
            <td style="padding: 6px 0; color: #111; font-size: 14px; font-weight: 600;">${escapeHtml(details.projectName)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #888; font-size: 13px;">Estimate #</td>
            <td style="padding: 6px 0; color: #111; font-size: 14px; font-weight: 600;">${escapeHtml(details.estimateNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #888; font-size: 13px;">Due Date</td>
            <td style="padding: 6px 0; color: #111; font-size: 14px; font-weight: 600;">${escapeHtml(details.dueDate || "Not set")}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #888; font-size: 13px;">GC Lead</td>
            <td style="padding: 6px 0; color: #111; font-size: 14px; font-weight: 600;">${escapeHtml(details.gcLead || "Not set")}</td>
          </tr>
        </table>
      </div>
      <p style="color: #666; font-size: 13px; margin: 0;">${signOff}</p>
    </div>
  `;

  return { subject, text, html };
}

export interface BidAssignmentDetails {
  estimatorInitials: string;
  projectName: string;
  estimateNumber: string;
  dueDate: string;
  gcLead: string;
}

export async function sendBidAssignmentEmail(
  to: string,
  estimatorName: string,
  details: BidAssignmentDetails
): Promise<void> {
  const template = await getBidAssignmentTemplate();

  const { subject, text, html } = buildBidAssignmentHtml(template, {
    estimatorName,
    projectName: details.projectName,
    estimateNumber: details.estimateNumber,
    dueDate: details.dueDate,
    gcLead: details.gcLead,
  });

  if (EMAIL_PROVIDER === "sendgrid") {
    try {
      await sgMail.send({ to, from: EMAIL_FROM, subject, text, html });
      console.log(`[Email] Bid assignment notification sent to ${to} via SendGrid`);
    } catch (error: any) {
      console.error(`[Email] SendGrid error sending bid assignment:`, error?.response?.body || error.message);
    }
  } else {
    console.log(`\n========================================`);
    console.log(`[Email-DEV] Bid Assignment Notification`);
    console.log(`To: ${to}`);
    console.log(`Estimator: ${estimatorName} (${details.estimatorInitials})`);
    console.log(`Project: ${details.projectName}`);
    console.log(`Estimate #: ${details.estimateNumber}`);
    console.log(`Due Date: ${details.dueDate || "Not set"}`);
    console.log(`GC Lead: ${details.gcLead || "Not set"}`);
    console.log(`========================================\n`);
  }
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

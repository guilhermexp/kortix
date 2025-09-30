import { Resend } from "resend"
import { env } from "./env"

type SendEmailParams = {
  to: string
  subject: string
  text?: string
  html?: string
}

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
  if (!resendClient) {
    console.info("[mailer] resend disabled", { to, subject, text, html })
    return
  }

  try {
    await resendClient.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      text,
      html,
    } as any)
  } catch (error) {
    console.error("[mailer] resend send failed", error)
  }
}

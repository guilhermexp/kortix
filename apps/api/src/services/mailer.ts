import { type CreateEmailOptions, Resend } from "resend"
import { env } from "../env"

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

	if (!text && !html) {
		console.warn("[mailer] skipping email send: no content provided", {
			to,
			subject,
		})
		return
	}

	try {
		const emailPayload = {
			from: env.RESEND_FROM_EMAIL,
			to,
			subject,
			...(text ? { text } : {}),
			...(html ? { html } : {}),
		} satisfies CreateEmailOptions
		await resendClient.emails.send(emailPayload)
	} catch (error) {
		console.error("[mailer] resend send failed", error)
	}
}

import { z } from "zod"

const welcomeEmailSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
})

export async function sendWelcomeEmail(body: unknown) {
  const payload = welcomeEmailSchema.parse(body)
  // TODO: integrate with transactional email provider (Resend, Postmark, etc.)
  console.info("sendWelcomeEmail stub", payload)
  return {
    message: "Welcome email queued",
  }
}

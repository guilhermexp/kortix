import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export function hashPassword(password: string) {
	const salt = randomBytes(16).toString("hex")
	const derived = scryptSync(password, salt, 64)
	return `${salt}:${derived.toString("hex")}`
}

export function verifyPassword(password: string, hashedPassword: string) {
	const [salt, key] = hashedPassword.split(":")
	if (!salt || !key) return false
	const derived = scryptSync(password, salt, 64)
	return timingSafeEqual(Buffer.from(key, "hex"), derived)
}

/**
 * Minimal logger with configurable log levels.
 * Set LOG_LEVEL env var to: silent | error | warn | info | debug
 */

type LogLevel = "silent" | "error" | "warn" | "info" | "debug"

const LEVELS: Record<LogLevel, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
}

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || "info"
const levelNum = LEVELS[currentLevel] ?? LEVELS.info

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

function timestamp() {
	return dim(new Date().toLocaleTimeString("en-US", { hour12: false }))
}

export const log = {
	error: (tag: string, ...args: unknown[]) => {
		if (levelNum >= LEVELS.error) {
			console.error(timestamp(), red(`[${tag}]`), ...args)
		}
	},
	warn: (tag: string, ...args: unknown[]) => {
		if (levelNum >= LEVELS.warn) {
			console.warn(timestamp(), yellow(`[${tag}]`), ...args)
		}
	},
	info: (tag: string, ...args: unknown[]) => {
		if (levelNum >= LEVELS.info) {
			console.log(timestamp(), cyan(`[${tag}]`), ...args)
		}
	},
	debug: (tag: string, ...args: unknown[]) => {
		if (levelNum >= LEVELS.debug) {
			console.log(timestamp(), dim(`[${tag}]`), ...args)
		}
	},
}

export default log

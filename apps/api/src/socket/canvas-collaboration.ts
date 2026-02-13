import type { Server as HTTPServer } from "http"
import { Server } from "socket.io"
import { createClient } from "@supabase/supabase-js"
import { extractAccessToken } from "../session"
import { env } from "../env"
import { parseCookies } from "../utils/cookies"

interface User {
	id: string
	name: string
	color: string
}

interface RoomUser extends User {
	socketId: string
	isActive: boolean
	cursor?: { x: number; y: number }
}

const rooms = new Map<string, Map<string, RoomUser>>()

export function setupCanvasCollaboration(httpServer: HTTPServer) {
	const io = new Server(httpServer, {
		cors: {
			origin:
				process.env.ALLOWED_ORIGINS?.split(",") || [
					"http://localhost:3000",
					"http://localhost:3001",
				],
			credentials: true,
		},
	})

	// Authentication middleware - verify JWT before allowing connection
	io.use(async (socket, next) => {
		try {
			const cookies = parseCookies(
				socket.handshake.headers.cookie ?? "",
			)
			const accessToken = extractAccessToken(
				new Request("http://localhost", {
					headers: {
						authorization:
							socket.handshake.auth?.token
								? `Bearer ${socket.handshake.auth.token}`
								: "",
						cookie: socket.handshake.headers.cookie ?? "",
					},
				}),
				cookies,
			)

			if (!accessToken) {
				return next(new Error("Authentication required"))
			}

			// Verify the token with Supabase
			const supabase = createClient(
				env.SUPABASE_URL,
				env.SUPABASE_ANON_KEY,
				{
					auth: { persistSession: false },
					global: {
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					},
				},
			)

			const {
				data: { user },
				error,
			} = await supabase.auth.getUser()

			if (error || !user) {
				return next(new Error("Invalid or expired token"))
			}

			// Attach authenticated user info to socket data
			socket.data.userId = user.id
			socket.data.email = user.email
			socket.data.accessToken = accessToken
			next()
		} catch (err) {
			next(new Error("Authentication failed"))
		}
	})

	io.on("connection", (socket) => {
		console.log("Client connected:", socket.id, "user:", socket.data.userId)

		socket.on(
			"join-canvas",
			async ({ canvasId, user }: { canvasId: string; user: User }) => {
				// Validate canvasId format
				if (!canvasId || typeof canvasId !== "string") {
					return socket.emit("error", { message: "Invalid canvas ID" })
				}

				// Enforce authenticated user ID - ignore client-provided ID
				const authenticatedUserId = socket.data.userId

				// Verify user has access to this canvas
				const supabase = createClient(
					env.SUPABASE_URL,
					env.SUPABASE_ANON_KEY,
					{
						auth: { persistSession: false },
						global: {
							headers: {
								Authorization: `Bearer ${socket.data.accessToken}`,
							},
						},
					},
				)

				const { data: canvas, error: canvasError } = await supabase
					.from("canvases")
					.select("id")
					.eq("id", canvasId)
					.eq("user_id", authenticatedUserId)
					.maybeSingle()

				if (canvasError || !canvas) {
					return socket.emit("error", { message: "Canvas not found or access denied" })
				}

				const roomId = `canvas_${canvasId}`
				socket.join(roomId)

				// Add user to room using authenticated ID
				if (!rooms.has(roomId)) {
					rooms.set(roomId, new Map())
				}
				const room = rooms.get(roomId)!
				room.set(authenticatedUserId, {
					...user,
					id: authenticatedUserId,
					socketId: socket.id,
					isActive: true,
				})

				// Notify others
				socket.to(roomId).emit("user-joined", {
					...user,
					id: authenticatedUserId,
				})

				// Send current users to new user
				const users = Array.from(room.values()).filter(
					(u) => u.id !== authenticatedUserId,
				)
				socket.emit("room-users", users)

				console.log(
					`User ${authenticatedUserId} joined canvas ${canvasId}`,
				)
			},
		)

		socket.on(
			"cursor-move",
			(data: {
				canvasId: string
				cursor: { x: number; y: number }
			}) => {
				if (
					!data ||
					typeof data.canvasId !== "string" ||
					!data.cursor ||
					typeof data.cursor.x !== "number" ||
					typeof data.cursor.y !== "number"
				) {
					return
				}
				const roomId = `canvas_${data.canvasId}`
				socket.volatile.to(roomId).emit("cursor-update", {
					userId: socket.data.userId,
					cursor: data.cursor,
				})
			},
		)

		socket.on(
			"element-update",
			(data: { canvasId: string; elements: any[] }) => {
				if (
					!data ||
					typeof data.canvasId !== "string" ||
					!Array.isArray(data.elements)
				) {
					return
				}
				const roomId = `canvas_${data.canvasId}`
				socket.to(roomId).emit("elements-changed", data.elements)
			},
		)

		socket.on(
			"leave-canvas",
			({ canvasId }: { canvasId: string }) => {
				if (!canvasId || typeof canvasId !== "string") return
				const userId = socket.data.userId
				const roomId = `canvas_${canvasId}`
				const room = rooms.get(roomId)
				if (room) {
					room.delete(userId)
					if (room.size === 0) {
						rooms.delete(roomId)
					}
				}
				socket.leave(roomId)
				socket.to(roomId).emit("user-left", userId)
				console.log(`User ${userId} left canvas ${canvasId}`)
			},
		)

		socket.on("disconnect", () => {
			console.log("Client disconnected:", socket.id)
			// Clean up user from all rooms
			for (const [roomId, room] of rooms) {
				for (const [userId, user] of room) {
					if (user.socketId === socket.id) {
						room.delete(userId)
						io.to(roomId).emit("user-left", userId)
						if (room.size === 0) {
							rooms.delete(roomId)
						}
					}
				}
			}
		})
	})

	return io
}

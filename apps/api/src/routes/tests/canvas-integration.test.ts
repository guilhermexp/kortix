import { describe, expect, it, vi, beforeEach } from "bun:test"
import { Hono } from "hono"
import { canvasRouter } from "../canvas.router"
import * as canvasService from "../canvas"

// Mock the Supabase client creation
vi.mock("../supabase", () => ({
  createClientForSession: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    })),
  })),
}))

// Mock the canvas service
vi.mock("../canvas", () => ({
  listCanvases: vi.fn(),
  getCanvas: vi.fn(),
  createCanvas: vi.fn(),
  updateCanvas: vi.fn(),
  deleteCanvas: vi.fn(),
}))

describe("Canvas API Integration", () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    // Mock session middleware variable
    app.use("*", async (c, next) => {
      c.set("session", { userId: "test-user-id", organizationId: "test-org-id" })
      await next()
    })
    app.route("/canvas", canvasRouter)
    vi.clearAllMocks()
  })

  it("GET /canvas should return list of canvases", async () => {
    const mockCanvases = [{ id: "550e8400-e29b-41d4-a716-446655440000", name: "Test Canvas" }]
    ;(canvasService.listCanvases as any).mockResolvedValue(mockCanvases)

    const res = await app.request("/canvas")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockCanvases)
    expect(canvasService.listCanvases).toHaveBeenCalledWith(
      expect.anything(),
      "test-user-id",
      undefined,
    )
  })

  it("GET /canvas/:id should return a specific canvas", async () => {
    const mockCanvas = { id: "550e8400-e29b-41d4-a716-446655440000", name: "Test Canvas", content: {} }
    ;(canvasService.getCanvas as any).mockResolvedValue(mockCanvas)

    const res = await app.request("/canvas/550e8400-e29b-41d4-a716-446655440000")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockCanvas)
    expect(canvasService.getCanvas).toHaveBeenCalledWith(
      expect.anything(),
      "550e8400-e29b-41d4-a716-446655440000",
      "test-user-id",
    )
  })

  it("POST /canvas should create a new canvas", async () => {
    const newCanvas = { name: "New Canvas", projectId: "550e8400-e29b-41d4-a716-446655440001" }
    const createdCanvas = { id: "550e8400-e29b-41d4-a716-446655440002", ...newCanvas }
    ;(canvasService.createCanvas as any).mockResolvedValue(createdCanvas)

    const res = await app.request("/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCanvas),
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(createdCanvas)
    expect(canvasService.createCanvas).toHaveBeenCalledWith(
      expect.anything(),
      "test-user-id",
      newCanvas,
    )
  })

  it("POST /canvas should handle missing projectId (default project)", async () => {
    const newCanvas = { name: "New Canvas" }
    const createdCanvas = { id: "550e8400-e29b-41d4-a716-446655440003", ...newCanvas }
    ;(canvasService.createCanvas as any).mockResolvedValue(createdCanvas)

    const res = await app.request("/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCanvas),
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(createdCanvas)
    expect(canvasService.createCanvas).toHaveBeenCalledWith(
      expect.anything(),
      "test-user-id",
      newCanvas,
    )
  })

  it("PATCH /canvas/:id should update a canvas", async () => {
    const updateData = { name: "Updated Title" }
    const updatedCanvas = { id: "550e8400-e29b-41d4-a716-446655440000", name: "Updated Title", content: {} }
    ;(canvasService.updateCanvas as any).mockResolvedValue(updatedCanvas)

    const res = await app.request("/canvas/550e8400-e29b-41d4-a716-446655440000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updatedCanvas)
    expect(canvasService.updateCanvas).toHaveBeenCalledWith(
      expect.anything(),
      "550e8400-e29b-41d4-a716-446655440000",
      "test-user-id",
      updateData,
    )
  })

  it("DELETE /canvas/:id should delete a canvas", async () => {
    ;(canvasService.deleteCanvas as any).mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000" })

    const res = await app.request("/canvas/550e8400-e29b-41d4-a716-446655440000", {
      method: "DELETE",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "550e8400-e29b-41d4-a716-446655440000" })
    expect(canvasService.deleteCanvas).toHaveBeenCalledWith(
      expect.anything(),
      "550e8400-e29b-41d4-a716-446655440000",
      "test-user-id",
    )
  })
})

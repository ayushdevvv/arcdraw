# ArcDraw Design Agent

The in-room agent turns a natural-language visual brief into a structured, editable canvas composition. It replaces the former research/task-planning panel. It does not return a screenshot: the frontend converts the validated design plan into native Excalidraw shapes, text, arrows, lines and grouped sticky notes.

## Workflow

1. A signed-in user opens the Design Agent in a Board room and describes a screen, diagram, brainstorm or visual concept.
2. The client sends the prompt and bounded room context (room title/type, object count and up to 12 selected object summaries) to `POST /api/v1/agent/design`.
3. The endpoint streams progress events and keep-alive heartbeats so the panel can show live stages even during a slower model request.
4. A LangGraph.js graph runs `prepare → compose → review`, with one conditional repair pass when validation finds a weak or malformed result.
5. The compose and repair nodes call the configured Groq-compatible chat completions endpoint. The default model is `openai/gpt-oss-120b`; the request uses `reasoning_effort: medium` and `include_reasoning: false` (Groq documents these as GPT-OSS-supported controls).
6. The server validates and normalizes object types, geometry, colors, text and element count before returning a design plan.
7. The user previews the composition and explicitly chooses **Add editable design to canvas**.
8. The client converts objects into native Excalidraw elements, saves the complete local scene and publishes it through the existing Yjs collaboration channel.

The graph currently has no persistent checkpointer because a single design generation is a bounded request/response workflow, not a long-lived agent conversation. The room itself is the source of truth for the current canvas.

## Install and configure

The backend uses LangGraph.js. From the `backend` directory, run `npm install` after pulling this release so npm resolves and records the new LangGraph dependencies. `@langchain/langgraph` is pinned to `1.7.3` and `@langchain/core` to `1.3.6`. Run `npm install` in the backend directory on a network-connected machine; this resolves the pinned LangGraph packages and generates a fresh `package-lock.json`. Then commit that generated lockfile and use `npm ci` for repeatable deploys. The working environment used to prepare this archive could not reach the npm registry, so a regenerated lockfile is not included.

Configure these server-only variables in `backend/.env` and in Render: 

```env
AI_API_KEY=your_groq_api_key
AI_API_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
AI_REQUEST_TIMEOUT_MS=110000
```

Never use a `VITE_` prefix for the Groq key. The key must never reach the browser. You do not need Tavily or a separate image-generation API for the current native-object generator. The agent creates shapes, text, connectors and sticky notes; generated photographic assets are not included in this release.

## Design quality and limits

- The system prompt sets a senior product-design quality bar: layout hierarchy, 8px spacing rhythm, controlled palette, readable type scale, realistic copy, deliberate grouping and restrained decoration.
- The model returns a strict JSON Schema plan where supported by Groq. The server validates and bounds output before it reaches the client, including canvas bounds and reusable component group mappings.
- A design is limited to 85 model-generated objects. Normal desktop compositions should use around 22–65 objects; compact diagrams can use fewer.
- Supported native element types: rectangle, ellipse, diamond, text, line, arrow and sticky.
- For a clear edit instruction with selected objects, the model returns a separate edit plan limited to the selected IDs. The client rechecks that those objects are still selected before applying property changes.
- For create/add/build instructions, the client applies a generated design as a new grouped composition. It preserves existing canvas objects and places a new composition to the right of existing content.
- When the model identifies repeated patterns, it declares a master group, matching instance groups and optional variants. On approval ArcDraw saves these into the room Design Studio library and tags the on-canvas copies with the existing instance metadata, so supported default instances can receive master updates. Preview is a lightweight layout representation, not a pixel-perfect raster render of Excalidraw. All applied objects remain editable.
- Selected-object editing currently supports copy, fill/stroke/text color, font size, position, dimensions, opacity and corner-rounding updates on selected supported Excalidraw objects. It does not yet expose a full Figma property inspector or auto-layout constraint engine.
- The endpoint requires an authenticated account and uses the existing per-IP agent rate limit.

## Manual test

1. Configure a valid Groq key and start the backend.
2. Sign in and open a Board room.
3. Ask for a premium desktop dashboard, landing page, mobile screen, flowchart and sticky-note brainstorm in separate runs.
4. Watch the streamed progress stages; ensure the final preview lists object count, canvas dimensions and quality score.
5. Apply a preview and confirm each element can be selected and edited in Excalidraw. Open Design Studio and check that any generated reusable masters/instances were added to the room library.
6. Confirm the local room saves and a second collaborator receives the generated scene through Yjs.
7. Repeat with a populated room and confirm the generated composition is placed beside existing objects rather than replacing them.
8. Test invalid API key, provider timeout, viewer permission and an empty prompt.

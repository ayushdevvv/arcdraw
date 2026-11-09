# Arcdraw Agent — research and planning

The Agent exists to solve one real gap: turning a loosely described room goal into a researched, gap-aware plan that can be converted into project tasks. It is not a general-purpose chat window and does not autonomously edit a room.

## Flow

1. The signed-in user enters a goal in a Board or Notes room.
2. The client sends the prompt and a bounded context bundle (room title/type, up to 12 notes, up to 80 canvas text elements, and up to 30 existing tasks) to `POST /api/v1/agent/analyze`.
3. If `TAVILY_API_KEY` is configured, the server sends a short search query derived from the prompt and room title to Tavily Search. Private note bodies and canvas content are not sent to Tavily.
4. The server passes the bounded room context and Tavily snippets to the configured OpenAI-compatible model. The model returns structured JSON: summary, gaps, recommended approach, execution steps, candidate tasks and cautions.
5. The user reviews the proposed tasks, selects the ones to keep, and explicitly approves adding them to the room Project. No canvas, note, milestone or existing task is silently modified.

## Configure providers

Copy `backend/.env.example` to `backend/.env`, then add:

```env
AI_API_KEY=your-provider-key
AI_API_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
TAVILY_API_KEY=your-tavily-key
AI_REQUEST_TIMEOUT_MS=45000
```

`AI_API_KEY` is required for the planner. `TAVILY_API_KEY` is optional: without it, the Agent still produces an AI-based plan and labels web research as not configured. If Tavily is temporarily unavailable, the Agent falls back to an AI-only plan and clearly labels search as unavailable. Provider keys stay on the server and must never be prefixed with `VITE_` or committed to source control.

The current Groq default model is `openai/gpt-oss-120b`; choose another model with JSON-object response support by changing `AI_MODEL`. The API base URL can be changed for another OpenAI-compatible endpoint.

## Safety, privacy and limits

- The endpoint requires an authenticated account and is rate limited to 8 requests per IP per 10 minutes.
- The UI discloses that the prompt and relevant room context are sent to the configured model provider.
- Tavily receives only the bounded search query, not the room's notes, canvas text or task list.
- The model is instructed to treat room text and search snippets as untrusted reference data, not instructions.
- Search results are shown as direct source links. Model recommendations should still be reviewed; they are not guaranteed to be correct.
- This is a single-pass research/planning workflow, not an autonomous multi-tool execution loop. The only v1 write action is adding user-approved tasks.
- The current client sends a bounded excerpt of each note and canvas text into the model context. Users should avoid submitting confidential content unless they accept the configured provider's data terms.

## Manual test

1. Without signing in, open Agent and confirm the account gate is shown.
2. Sign in without `AI_API_KEY`; confirm the API reports that the provider is not configured.
3. Add only `AI_API_KEY`; confirm the result says web search is not configured and does not claim research was performed.
4. Add `TAVILY_API_KEY`; confirm sources appear and open in a new tab. Temporarily invalid/unavailable Tavily should degrade to an explicitly labelled AI-only plan instead of blocking the analysis.
5. Ask for a plan; uncheck some candidate tasks and approve the rest. Confirm only selected tasks appear in Project.
6. Confirm the original notes and canvas are unchanged.
7. Send repeated requests from one IP and confirm the rate limit is enforced.

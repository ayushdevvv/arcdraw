import { apiRequest } from "./apiClient.js";

export async function analyzeRoomGoal(prompt, roomContext) {
  const result = await apiRequest("/agent/analyze", {
    method: "POST",
    body: JSON.stringify({ prompt, roomContext })
  });
  return result.data;
}

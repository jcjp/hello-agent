import {
  createExecutionContext,
  waitOnExecutionContext
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "./server";

const AGENT_URL = "http://example.com/agents/chat-agent/hello-agent";

describe("ChatAgent", () => {
  it("returns empty message history on a fresh agent", async () => {
    const request = new Request(`${AGENT_URL}/get-messages`);
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("upgrades to WebSocket for agent connections", async () => {
    const response = await exports.default.fetch(
      new Request(AGENT_URL, {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade"
        }
      })
    );

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  it("receives a response after sending a chat message", async () => {
    const response = await exports.default.fetch(
      new Request(AGENT_URL, {
        headers: { Upgrade: "websocket", Connection: "Upgrade" }
      })
    );

    const ws = response.webSocket!;
    ws.accept();

    const received = await new Promise<string[]>((resolve) => {
      const messages: string[] = [];
      ws.addEventListener("message", (event) => {
        messages.push(event.data as string);
        // Resolve as soon as we get any response back
        resolve(messages);
      });

      ws.send(
        JSON.stringify({
          type: "cf_agent_use_chat_request",
          init: {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: "hello" }]
            })
          }
        })
      );
    });

    ws.close();
    expect(received.length).toBeGreaterThan(0);
    expect(() => JSON.parse(received[0])).not.toThrow();
  });

  it("returns 404 for unknown routes", async () => {
    const request = new Request(`${AGENT_URL}/unknown-endpoint`);
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });
});

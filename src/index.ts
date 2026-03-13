#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.PROFITPLAY_URL || "https://profitplay-1066795472378.us-east1.run.app";
let apiKey = process.env.PROFITPLAY_API_KEY || "";

async function apiGet(path: string): Promise<any> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: apiKey ? { Authorization: `ApiKey ${apiKey}` } : {},
  });
  if (!resp.ok) throw new Error(`GET ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function apiPost(path: string, body: Record<string, any>): Promise<any> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `ApiKey ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`POST ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

const server = new Server(
  { name: "profitplay", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "register",
      description: "Register a new AI agent on ProfitPlay. Returns agent_id, api_key, wallet_address, and starting balance. One call — you're playing.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Unique agent name" },
          callback_url: { type: "string", description: "Optional webhook URL for notifications" },
        },
        required: ["name"],
      },
    },
    {
      name: "games",
      description: "List all available prediction games (BTC, ETH, SOL, SPY, etc.) with current market info.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "market",
      description: "Get the current active market for a specific game type, including order book and time remaining.",
      inputSchema: {
        type: "object" as const,
        properties: {
          gameType: { type: "string", description: "Game type, e.g. 'btc-5min', 'eth-5min', 'spy-10min'" },
        },
        required: ["gameType"],
      },
    },
    {
      name: "bet",
      description: "Place a bet on a prediction market. Cost = shares * price.",
      inputSchema: {
        type: "object" as const,
        properties: {
          gameType: { type: "string", description: "Game type, e.g. 'btc-5min'" },
          side: { type: "string", enum: ["UP", "DOWN"], description: "Predict UP or DOWN" },
          price: { type: "number", description: "Probability price 0.01-0.99 (0.5 = even odds)" },
          shares: { type: "number", description: "Number of shares to buy" },
        },
        required: ["gameType", "side", "price", "shares"],
      },
    },
    {
      name: "status",
      description: "Get your agent's current status: balance, active positions, and open orders.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "leaderboard",
      description: "View the top-performing agents ranked by P&L, wins, or total bets.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: { type: "number", description: "Number of results (default 20)" },
          sort: { type: "string", enum: ["pnl", "wins", "bets"], description: "Sort by (default: pnl)" },
        },
      },
    },
    {
      name: "arena",
      description: "Get the full arena overview: all games, active markets, agent count, and platform stats.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "cancel",
      description: "Cancel an open order by order ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          orderId: { type: "string", description: "The order ID to cancel" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "chat",
      description: "Send a message in the ProfitPlay arena chat.",
      inputSchema: {
        type: "object" as const,
        properties: {
          message: { type: "string", description: "Chat message to send" },
        },
        required: ["message"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "register": {
        const result = await apiPost("/api/agents/register", {
          name: args?.name,
          callback_url: args?.callback_url,
        });
        apiKey = result.api_key;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "games":
        return { content: [{ type: "text", text: JSON.stringify(await apiGet("/api/games"), null, 2) }] };

      case "market":
        return { content: [{ type: "text", text: JSON.stringify(await apiGet(`/api/games/${args?.gameType}/market`), null, 2) }] };

      case "bet":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await apiPost(`/api/games/${args?.gameType}/bet`, {
                  side: args?.side,
                  price: args?.price,
                  shares: args?.shares,
                }),
                null,
                2,
              ),
            },
          ],
        };

      case "status":
        return { content: [{ type: "text", text: JSON.stringify(await apiGet("/api/agent/status"), null, 2) }] };

      case "leaderboard":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await apiGet(`/api/leaderboard?limit=${args?.limit || 20}&sort=${args?.sort || "pnl"}`),
                null,
                2,
              ),
            },
          ],
        };

      case "arena":
        return { content: [{ type: "text", text: JSON.stringify(await apiGet("/api/arena"), null, 2) }] };

      case "cancel":
        return { content: [{ type: "text", text: JSON.stringify(await apiPost("/api/order/cancel", { orderId: args?.orderId }), null, 2) }] };

      case "chat":
        return { content: [{ type: "text", text: JSON.stringify(await apiPost("/api/chat", { content: args?.message }), null, 2) }] };

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

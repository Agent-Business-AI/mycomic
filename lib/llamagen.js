import { LlamaGenClient } from "comic";

let client = null;
let currentKey = null;

export function getLlamaGenClient() {
  const apiKey = process.env.LLAMAGEN_API_KEY;
  if (!apiKey) return null;
  if (!client || currentKey !== apiKey) {
    client = new LlamaGenClient({ apiKey, timeoutMs: 120_000 });
    currentKey = apiKey;
  }
  return client;
}

export function getApiKey() {
  return process.env.LLAMAGEN_API_KEY || null;
}

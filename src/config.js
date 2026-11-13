
import "dotenv/config";

function num(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

export const config = {
  baseUrl: "https://fapi.binance.com",

  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: String(
    process.env.TELEGRAM_CHAT_ID || ""
  ),

  depthLimit: num("DEPTH_LIMIT", 500),
  minWallUSDT: num("MIN_WALL_USDT", 100000),
  minWallRatio: num("MIN_WALL_RATIO", 50),
  priceRangePercent: num("PRICE_RANGE_PERCENT", 5),

  scanDelayMs: num("SCAN_DELAY_MS", 250),
  retryDelayMs: num("SCAN_RETRY_DELAY_MS", 15000),
  maxRetries: Math.floor(num("MAX_RETRIES", 3)),

  dataDir: process.env.DATA_DIR || "./data"
};

if (!config.telegramToken) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN");
}

if (!config.telegramChatId) {
  throw new Error("Missing TELEGRAM_CHAT_ID");
}

if (![100, 500, 1000].includes(config.depthLimit)) {
  throw new Error("DEPTH_LIMIT must be 100, 500 or 1000");
}

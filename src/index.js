
import { config } from "./config.js";

import {
  getSymbols,
  getDepth,
  sleep
} from "./binance.js";

import { scanWalls } from "./wallScanner.js";

import {
  loadHistory,
  getHourKey,
  formatHour,
  wasSymbolProcessed,
  processSymbolWalls,
  getHistoryStats
} from "./wallHistory.js";

import {
  flushNotifications
} from "./telegram.js";

const HOUR_MS = 60 * 60 * 1000;
// const HOUR_MS = 5 * 60 * 1000;

let running = true;
let scanning = false;

process.on("SIGINT", () => {
  console.log("[SYSTEM] SIGINT received");
  running = false;
});

process.on("SIGTERM", () => {
  console.log("[SYSTEM] SIGTERM received");
  running = false;
});

function log(message) {
  const time = new Date().toLocaleString(
    "vi-VN",
    {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false
    }
  );

  console.log(`[${time}] ${message}`);
}

async function scanMarket(hourKey) {
  if (scanning) return;

  scanning = true;

  let success = 0;
  let failed = 0;
  let skipped = 0;

  const eventCounts = {
    NEW: 0,
    REPEAT: 0,
    NO_REPEAT_1: 0,
    NO_REPEAT_2: 0
  };

  try {
    log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log(`🔍 START SCAN: ${formatHour(hourKey)}`);

    const symbols = await getSymbols();

    log(`📊 Total symbols: ${symbols.length}`);

    for (let i = 0; i < symbols.length; i++) {
      if (!running) break;

      const symbol = symbols[i];

      if (wasSymbolProcessed(symbol, hourKey)) {
        skipped++;
        continue;
      }

      try {
        const depth = await getDepth(symbol);

        const walls = scanWalls(symbol, depth);

        // Chỉ cập nhật vòng đời khi:
        // 1. API thành công.
        // 2. Order Book hợp lệ.
        // 3. scanWalls không phát sinh lỗi.
        const events = processSymbolWalls(
          symbol,
          walls,
          hourKey
        );

        success++;

        for (const event of events) {
          eventCounts[event.type]++;

          log(
            `[${event.type}] ${event.key}`
          );
        }

        if (events.length) {
          await flushNotifications();
        }

      } catch (error) {
        failed++;

        log(
          `❌ ${symbol}: ` +
          (error.response?.data?.msg ||
           error.message)
        );

        // API lỗi: không tăng NO REPEAT.
      }

      if (i < symbols.length - 1 && running) {
        await sleep(config.scanDelayMs);
      }
    }

    await flushNotifications();

    const stats = getHistoryStats();

    log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log("📊 SCAN SUMMARY");
    log(`✅ Success: ${success}`);
    log(`❌ Failed: ${failed}`);
    log(`⏭ Skipped: ${skipped}`);
    log(`🆕 NEW: ${eventCounts.NEW}`);
    log(`🔁 REPEAT: ${eventCounts.REPEAT}`);
    log(`⚠️ NO REPEAT 1: ${eventCounts.NO_REPEAT_1}`);
    log(`🗑 NO REPEAT 2: ${eventCounts.NO_REPEAT_2}`);
    log(`📚 Active walls: ${stats.activeWalls}`);
    log(
      `📨 Pending notifications: ` +
      stats.pendingNotifications
    );
    log("━━━━━━━━━━━━━━━━━━━━━━━━━━");

  } catch (error) {
    log(
      `[SCAN ERROR] ${error.message}`
    );

  } finally {
    scanning = false;
  }
}


async function waitForNextHour() {
  const now = Date.now();

  const HOUR_MS = 60 * 60 * 1000;
  const OFFSET_MS = 2 * 60 * 1000;

  const nextScan =
    Math.floor((now - OFFSET_MS) / HOUR_MS + 1)
    * HOUR_MS + OFFSET_MS;

  log(
    `⏰ Next scan: ${new Date(nextScan)
      .toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false
      })}`
  );

  while (running && Date.now() < nextScan) {
    const remaining = nextScan - Date.now();

    await sleep(Math.min(remaining, 10000));
  }
}


async function main() {
  loadHistory();

  log("🚀 BINANCE WALL SCANNER STARTED");
  log("⏱ Scan interval: 1H");
  log("🌏 Timezone: Asia/Ho_Chi_Minh");
  log(`📚 Depth limit: ${config.depthLimit}`);
  log(`💰 Min Wall: ${config.minWallUSDT} USDT`);
  log(`📊 Min Ratio: ${config.minWallRatio}x`);
  log(
    `📏 Price Range: ±${config.priceRangePercent}%`
  );

  const stats = getHistoryStats();

  log(`💾 History file: ${stats.filePath}`);
  log(`📚 Active walls: ${stats.activeWalls}`);

  // Thử gửi thông báo tồn đọng sau restart.
  await flushNotifications();

  // Chờ tới đầu giờ tiếp theo.
  await waitForNextHour();

  while (running) {
    const hourKey = getHourKey();

    await scanMarket(hourKey);

    if (!running) break;

    await flushNotifications();

    await waitForNextHour();
  }

  log("🛑 WALL SCANNER STOPPED");
}

main().catch(error => {
  console.error("[FATAL]", error);
  process.exitCode = 1;
});

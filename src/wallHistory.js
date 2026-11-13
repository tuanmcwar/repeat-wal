
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// ========================================
// CONFIG
// ========================================

// TEST: 5 phút/lần
// Khi chạy chính thức 1H, đổi thành:
const HOUR_MS = 60 * 60 * 1000;

// const HOUR_MS = 5 * 60 * 1000;

const filePath = path.resolve(
  config.dataDir,
  "wall-history.json"
);

// ========================================
// DATABASE
// ========================================

function emptyDatabase() {
  return {
    version: 2,
    walls: {},
    processedSymbols: {},
    notifications: []
  };
}

let database = emptyDatabase();

// ========================================
// SAVE DATABASE
// ========================================

function save() {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  const tempPath = `${filePath}.tmp`;

  fs.writeFileSync(
    tempPath,
    JSON.stringify(database, null, 2),
    "utf8"
  );

  fs.renameSync(tempPath, filePath);
}

// ========================================
// LOAD DATABASE
// ========================================

export function loadHistory() {
  if (!fs.existsSync(filePath)) {
    database = emptyDatabase();
    save();

    console.log("[HISTORY] Created new database");
    return;
  }

  const content = fs.readFileSync(
    filePath,
    "utf8"
  ).trim();

  if (!content) {
    console.warn(
      "[HISTORY] Empty JSON file. Creating new database."
    );

    database = emptyDatabase();
    save();
    return;
  }

  let data;

  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid history JSON: ${filePath}. ` +
      `Please repair or back up the file. ${error.message}`
    );
  }

  if (
    data.version !== 2 ||
    !data.walls ||
    typeof data.walls !== "object" ||
    !data.processedSymbols ||
    typeof data.processedSymbols !== "object" ||
    !Array.isArray(data.notifications)
  ) {
    throw new Error(
      "Invalid wall-history.json structure"
    );
  }

  database = data;

  console.log(
    `[HISTORY] Loaded ${
      Object.keys(database.walls).length
    } active walls`
  );

  console.log(
    `[HISTORY] Pending notifications: ${
      database.notifications.length
    }`
  );
}

// ========================================
// TIME HELPERS
// ========================================

export function getHourKey(timestamp = Date.now()) {
  return Math.floor(timestamp / HOUR_MS);
}

export function formatHour(hourKey) {
  return new Date(hourKey * HOUR_MS)
    .toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
}

// ========================================
// WALL KEY
// ========================================

function normalizePrice(price) {
  const value = Number(price);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `Invalid Wall price: ${price}`
    );
  }

  // 0.13100000 và 0.131
  // được xem là cùng một mức giá.
  return value.toString();
}

function getWallKey(symbol, price) {
  return `${symbol}:${normalizePrice(price)}`;
}

// ========================================
// NOTIFICATION QUEUE
// ========================================

function enqueue(type, wall, hourKey) {
  const id = `${hourKey}:${type}:${wall.key}`;

  const exists = database.notifications.some(
    item => item.id === id
  );

  if (exists) return;

  database.notifications.push({
    id,
    type,
    hourKey,

    symbol: wall.symbol,
    price: wall.price,
    side: wall.side,

    quantity: wall.quantity ?? null,
    value: wall.value ?? null,
    ratio: wall.ratio ?? null,
    average: wall.average ?? null,
    distancePercent: wall.distancePercent ?? null,

    repeatCount: wall.repeatCount,
    noRepeatCount: wall.noRepeatCount,

    firstSeenHour: wall.firstSeenHour,
    lastSeenHour: wall.lastSeenHour
  });
}

// ========================================
// PROCESSED SYMBOL CHECK
// ========================================

export function wasSymbolProcessed(
  symbol,
  hourKey
) {
  return database.processedSymbols[symbol] === hourKey;
}

// ========================================
// PROCESS WALLS
// ========================================

export function processSymbolWalls(
  symbol,
  detectedWalls,
  hourKey
) {
  // Không xử lý trùng cùng chu kỳ.
  if (wasSymbolProcessed(symbol, hourKey)) {
    return [];
  }

  const events = [];

  // ----------------------------------------
  // DEDUPLICATE BY SYMBOL + PRICE
  // ----------------------------------------

  const found = new Map();

  for (const wall of detectedWalls) {
    const key = getWallKey(
      symbol,
      wall.price
    );

    const previous = found.get(key);

    // Nếu cùng giá có nhiều Wall,
    // chọn Wall có giá trị lớn nhất.
    if (
      !previous ||
      wall.value > previous.value
    ) {
      found.set(key, wall);
    }
  }

  // ----------------------------------------
  // NEW / REPEAT
  // ----------------------------------------

  for (const [key, wall] of found) {
    const existing = database.walls[key];

    if (!existing) {
      // NEW WALL
      const record = {
        key,
        symbol,
        price: normalizePrice(wall.price),

        side: wall.side,
        quantity: wall.quantity,
        value: wall.value,
        ratio: wall.ratio,
        average: wall.average ?? null,
        distancePercent:
          wall.distancePercent ?? null,

        firstSeenHour: hourKey,
        lastSeenHour: hourKey,
        lastCheckedHour: hourKey,

        // NEW là lần xuất hiện đầu tiên.
        repeatCount: 1,
        noRepeatCount: 0
      };

      database.walls[key] = record;

      enqueue("NEW", record, hourKey);

      events.push({
        type: "NEW",
        key
      });

    } else {
      // REPEAT WALL
      existing.side = wall.side;
      existing.quantity = wall.quantity;
      existing.value = wall.value;
      existing.ratio = wall.ratio;
      existing.average =
        wall.average ?? null;
      existing.distancePercent =
        wall.distancePercent ?? null;

      existing.lastSeenHour = hourKey;
      existing.lastCheckedHour = hourKey;

      // Tăng tổng số lần xuất hiện.
      existing.repeatCount++;

      // Wall quay lại -> reset NO REPEAT.
      existing.noRepeatCount = 0;

      enqueue("REPEAT", existing, hourKey);

      events.push({
        type: "REPEAT",
        key
      });
    }
  }

  // ----------------------------------------
  // NO REPEAT
  // ----------------------------------------

  for (const [key, record] of Object.entries(
    database.walls
  )) {
    if (record.symbol !== symbol) {
      continue;
    }

    if (found.has(key)) {
      continue;
    }

    // Không xử lý lại cùng chu kỳ.
    if (record.lastCheckedHour >= hourKey) {
      continue;
    }

    record.lastCheckedHour = hourKey;
    record.noRepeatCount++;

    if (record.noRepeatCount === 1) {
      enqueue(
        "NO_REPEAT_1",
        record,
        hourKey
      );

      events.push({
        type: "NO_REPEAT_1",
        key
      });

    } else if (record.noRepeatCount >= 2) {
      enqueue(
        "NO_REPEAT_2",
        record,
        hourKey
      );

      events.push({
        type: "NO_REPEAT_2",
        key
      });

      // Xóa Wall khỏi dữ liệu theo dõi.
      delete database.walls[key];
    }
  }

  // ----------------------------------------
  // MARK SYMBOL PROCESSED
  // ----------------------------------------

  database.processedSymbols[symbol] = hourKey;

  // Dọn lịch sử xử lý cũ.
  const oldestHour = hourKey - 48;

  for (const [
    name,
    processedHour
  ] of Object.entries(
    database.processedSymbols
  )) {
    if (processedHour < oldestHour) {
      delete database.processedSymbols[name];
    }
  }

  // Lưu ngay sau khi xử lý coin.
  save();

  return events;
}

// ========================================
// NOTIFICATION MANAGEMENT
// ========================================

export function getPendingNotifications() {
  return [...database.notifications];
}

export function markNotificationSent(id) {
  database.notifications =
    database.notifications.filter(
      item => item.id !== id
    );

  save();
}

// ========================================
// STATISTICS
// ========================================

export function getHistoryStats() {
  return {
    activeWalls:
      Object.keys(database.walls).length,

    pendingNotifications:
      database.notifications.length,

    filePath
  };
}

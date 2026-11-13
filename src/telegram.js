
import axios from "axios";
import { config } from "./config.js";

import {
  formatHour,
  getPendingNotifications,
  markNotificationSent
} from "./wallHistory.js";

const telegram = axios.create({
  baseURL:
    `https://api.telegram.org/bot${config.telegramToken}`,
  timeout: 15000
});

function number(value, digits = 2) {
  if (!Number.isFinite(Number(value))) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(Number(value));
}

function formatPrice(value) {
  return String(value);
}

function formatNotification(n) {
  const side =
    n.side === "BUY"
      ? "🟢 BUY WALL"
      : "🔴 SELL WALL";

  let status;

  switch (n.type) {
    case "NEW":
      status = "🆕 NEW WALL";
      break;

    case "REPEAT":
      status = `🔁 REPEAT ×${n.repeatCount}`;
      break;

    case "NO_REPEAT_1":
      status = "⚠️ NO REPEAT 1";
      break;

    case "NO_REPEAT_2":
      status = "❌ NO REPEAT 2";
      break;

    default:
      status = "📊 WALL UPDATE";
  }

  const lines = [
    "🚨 BINANCE FUTURES WALL ALERT",
    "",
    `🌑 Coin: ${n.symbol}`,
    side,
    status,
    "",
    "💰 WALL INFORMATION",
    `💰 Giá Wall: ${formatPrice(n.price)}`,
    `📦 Khối lượng: ${number(n.quantity, 2)}`,
    `💵 Giá trị: ${number(n.value)} USDT`,
    `📊 Gấp trung bình: ${number(n.ratio)} lần`,
    `📉 Trung bình/mức: ${number(n.average)} USDT`,
    "",
    "📍 PRICE POSITION",
    `📍 Khoảng cách giá: ${
      Number.isFinite(Number(n.distancePercent))
        ? number(n.distancePercent) + "%"
        : "N/A"
    }`,
    "",
    `🕒 Giờ quét: ${formatHour(n.hourKey)}`
  ];

  if (n.type === "NO_REPEAT_1") {
    lines.push("");
    lines.push(
      "⚠️ Wall không còn đạt điều kiện.",
      "⏳ Tiếp tục kiểm tra lần quét sau."
    );
  }

  if (n.type === "NO_REPEAT_2") {
    lines.push("");
    lines.push(
      "🗑 Wall đã bị xóa khỏi danh sách theo dõi."
    );
  }

  lines.push("");
  lines.push(
    "⚠️ Snapshot lệnh chờ, không phải giao dịch đã khớp."
  );

  return lines.join("\n");
}

function getKeyboard(notification) {
  const symbol = notification.symbol;

  return {
    inline_keyboard: [
      [
        {
          text: "📋 Copy giá Wall",
          copy_text: {
            text: String(notification.price)
          }
        },
        {
          text: "📈 Xem biểu đồ CoinGlass",
          url: "https://www.coinglass.com/"
        }
      ]
    ]
  };
}

export async function sendTelegram(
  text,
  replyMarkup = null
) {
  const payload = {
    chat_id: config.telegramChatId,
    text
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  await telegram.post("/sendMessage", payload);
}

export async function flushNotifications() {
  const pending = getPendingNotifications();

  let sent = 0;

  for (const notification of pending) {
    try {
      await sendTelegram(
        formatNotification(notification),
        getKeyboard(notification)
      );

      markNotificationSent(notification.id);
      sent++;

      await new Promise(resolve =>
        setTimeout(resolve, 100)
      );

    } catch (error) {
      console.error(
        "[TELEGRAM] Send failed:",
        error.response?.data?.description ||
        error.message
      );

      break;
    }
  }

  return sent;
}

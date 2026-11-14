
import axios from "axios";
import { config } from "./config.js";

import {
  formatHour,
  getPendingNotifications,
  markNotificationSent
} from "./wallHistory.js";

// ========================================
// TELEGRAM API
// ========================================

const telegram = axios.create({
  baseURL: `https://api.telegram.org/bot${config.telegramToken}`,
  timeout: 15000
});

// ========================================
// NUMBER FORMAT
// ========================================

function number(value, digits = 2) {
  if (
    value == null ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(Number(value));
}

function formatPrice(value) {
  return String(value);
}

// ========================================
// FORMAT TELEGRAM NOTIFICATION
// ========================================


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
      status = "⚠️ NO REPEAT";
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
  ];

  // NO REPEAT 1: Chỉ hiển thị thông tin Wall
  // và xác nhận đã xóa khỏi lịch sử.
  if (n.type === "NO_REPEAT_1") {
    lines.push(
      "",
      `🕒 Giờ quét: ${formatHour(n.hourKey)}`,
      "🗑️ Đã xóa Wall khỏi lịch sử theo dõi."
    );

    return lines.join("\n");
  }

  // NEW / REPEAT: Giữ nguyên thông tin bổ sung.
  lines.push(
    `📍 Khoảng cách giá: ${
      n.distancePercent != null &&
      Number.isFinite(Number(n.distancePercent))
        ? number(n.distancePercent) + "%"
        : "N/A"
    }`,
    "",
    `🕒 Giờ quét: ${formatHour(n.hourKey)}`,
    "",
    "⚠️ Snapshot lệnh chờ, không phải giao dịch đã khớp."
  );

  return lines.join("\n");
}


// ========================================
// INLINE KEYBOARD
// ========================================



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
          text: "📋 Copy Symbol",
          copy_text: {
            text: `${symbol}.P`
          }
        },
        {
          text: "📈 Xem biểu đồ CoinGlass",
          url: `https://www.coinglass.com/tv/vi/Binance_${symbol}`
        }
      ]
    ]
  };
}



// ========================================
// SEND TELEGRAM
// ========================================

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

  const { data } = await telegram.post(
    "/sendMessage",
    payload
  );

  if (!data?.ok) {
    throw new Error(
      data?.description || "Telegram gửi thất bại"
    );
  }

  return data.result;
}

// ========================================
// FLUSH NOTIFICATION QUEUE
// ========================================

export async function flushNotifications() {
  const pending = getPendingNotifications();

  let sent = 0;

  for (const notification of pending) {
    try {
      await sendTelegram(
        formatNotification(notification),
        getKeyboard(notification)
      );

      // Chỉ xóa thông báo khỏi hàng đợi
      // sau khi Telegram gửi thành công.
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

      // Giữ thông báo chưa gửi để thử lại.
      break;
    }
  }

  return sent;
}

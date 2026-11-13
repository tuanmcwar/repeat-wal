
import axios from "axios";
import { config } from "./config.js";

const api = axios.create({
  baseURL: config.baseUrl,
  timeout: 15000
});

export const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function request(path, params = {}) {
  let lastError;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const { data } = await api.get(path, { params });
      return data;
    } catch (error) {
      lastError = error;

      const status = error.response?.status;
      const retryable =
        status === 429 ||
        status === 418 ||
        status >= 500 ||
        !error.response;

      if (!retryable || attempt === config.maxRetries) {
        break;
      }

      const retryAfter = Number(
        error.response?.headers?.["retry-after"]
      );

      const delay = Number.isFinite(retryAfter) &&
        retryAfter > 0
          ? retryAfter * 1000
          : config.retryDelayMs * attempt;

      console.warn(
        `[BINANCE] HTTP ${status || "NETWORK"}, ` +
        `retry ${attempt}/${config.maxRetries} ` +
        `after ${delay}ms`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

export async function getSymbols() {
  const data = await request("/fapi/v1/exchangeInfo");

  return data.symbols
    .filter(item =>
      item.contractType === "PERPETUAL" &&
      item.status === "TRADING" &&
      item.quoteAsset === "USDT" &&
      item.marginAsset === "USDT"
    )
    .map(item => item.symbol)
    .sort();
}

export async function getDepth(symbol) {
  return request("/fapi/v1/depth", {
    symbol,
    limit: config.depthLimit
  });
}

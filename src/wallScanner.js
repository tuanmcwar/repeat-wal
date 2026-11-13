
import { config } from "./config.js";

function parseLevels(levels) {
  return levels
    .map(([price, quantity]) => {
      const p = Number(price);
      const q = Number(quantity);

      return {
        price: p,
        priceText: String(price),
        quantity: q,
        value: p * q
      };
    })
    .filter(level =>
      Number.isFinite(level.price) &&
      Number.isFinite(level.quantity) &&
      level.price > 0 &&
      level.quantity > 0
    );
}

export function scanWalls(symbol, depth) {
  const bids = parseLevels(depth.bids || []);
  const asks = parseLevels(depth.asks || []);

  if (!bids.length || !asks.length) {
    throw new Error(`Empty order book: ${symbol}`);
  }

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;

  const midPrice = (bestBid + bestAsk) / 2;
  const range = config.priceRangePercent / 100;

  const minPrice = midPrice * (1 - range);
  const maxPrice = midPrice * (1 + range);

  const results = [];

  for (const [side, levels] of [
    ["BUY", bids],
    ["SELL", asks]
  ]) {
    const nearby = levels.filter(level =>
      level.price >= minPrice &&
      level.price <= maxPrice
    );

    if (!nearby.length) continue;

    const total = nearby.reduce(
      (sum, level) => sum + level.value,
      0
    );

    const average = total / nearby.length;

    if (average <= 0) continue;

    for (const level of nearby) {
      const ratio = level.value / average;

      if (
        level.value >= config.minWallUSDT &&
        ratio >= config.minWallRatio
      ) {
        results.push({
  symbol,
  side,
  price: level.price,
  priceText: level.priceText,
  quantity: level.quantity,
  value: level.value,
  ratio,
  average,
  distancePercent:
    ((level.price - midPrice) / midPrice) * 100,
  midPrice
});
      }
    }
  }

  return results.sort((a, b) => b.value - a.value);
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CircuitBreaker,
  SlidingWindowRateLimiter,
  selectModelRoute,
  TtlCache,
} from "../src/reliability.js";

describe("Week 8 生产可靠性原语", () => {
  it("按滑动窗口限流", () => {
    const limiter = new SlidingWindowRateLimiter(2, 1_000);
    assert.equal(limiter.allow("user", 0), true);
    assert.equal(limiter.allow("user", 10), true);
    assert.equal(limiter.allow("user", 20), false);
    assert.equal(limiter.allow("user", 1_100), true);
  });

  it("连续失败后打开熔断器", async () => {
    const breaker = new CircuitBreaker(2, 60_000);
    await assert.rejects(() =>
      breaker.execute(async () => {
        throw new Error("provider failed");
      }),
    );
    await assert.rejects(() =>
      breaker.execute(async () => {
        throw new Error("provider failed");
      }),
    );
    assert.equal(breaker.state, "open");
    await assert.rejects(
      () => breaker.execute(async () => "never"),
      /熔断器已打开/u,
    );
  });

  it("缓存会过期并根据任务复杂度路由模型", () => {
    const cache = new TtlCache<string>(100);
    cache.set("key", "value", 0);
    assert.equal(cache.get("key", 50), "value");
    assert.equal(cache.get("key", 101), undefined);
    assert.equal(selectModelRoute("普通问答", 1_000), "fast");
    assert.equal(selectModelRoute("退款投诉", 1_000), "smart");
  });
});

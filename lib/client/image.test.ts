import { describe, expect, it } from "vitest";
import { MAX_SIDE, fitWithin } from "./image";

describe("fitWithin", () => {
  it("leaves a small picture alone", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
  it("leaves a picture exactly at the limit alone", () => expect(fitWithin(MAX_SIDE, 1000)).toEqual({ width: MAX_SIDE, height: 1000 }));
  it("scales a tall phone screenshot down by its height, keeping the shape", () => {
    expect(fitWithin(1170, 2532, 2200)).toEqual({ width: 1017, height: 2200 });
  });
  it("scales a wide picture by its width", () => expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 }));
  it("never produces a zero side", () => expect(fitWithin(10_000, 1, 2000)).toEqual({ width: 2000, height: 1 }));
  it("never scales up", () => expect(fitWithin(100, 50, 5000)).toEqual({ width: 100, height: 50 }));
});

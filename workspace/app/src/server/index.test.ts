import { describe, it, expect } from "vitest";
import { summarizeSearchSummary } from "./index";
import type { SearchSummary } from "../shared/types";

describe("summarizeSearchSummary", () => {
  it("should summarize a full SearchSummary", () => {
    const summary = {
      inspectedOptions: 100,
      evaluatedDatePairs: [{ departureDate: "2023-12-01" }, { departureDate: "2023-12-02" }],
      departureDatePrices: [{ date: "2023-12-01", price: 100 }, { date: "2023-12-02", price: 200 }],
      returnDatePrices: [{ date: "2023-12-10", price: 150 }],
      cheapestOverall: {
        totalPrice: 250,
        currency: "USD",
        source: "skyscanner",
        outboundDate: "2023-12-01",
        returnDate: "2023-12-10",
      },
    } as unknown as SearchSummary;

    const result = summarizeSearchSummary(summary);

    expect(result).toEqual({
      inspectedOptions: 100,
      evaluatedDatePairs: 2,
      departureDateCandidates: 2,
      returnDateCandidates: 1,
      cheapestOverall: {
        totalPrice: 250,
        currency: "USD",
        source: "skyscanner",
        outboundDate: "2023-12-01",
        returnDate: "2023-12-10",
      },
    });
  });

  it("should handle null cheapestOverall", () => {
    const summary = {
      inspectedOptions: 10,
      evaluatedDatePairs: [{ departureDate: "2023-12-01" }],
      departureDatePrices: [{ date: "2023-12-01", price: 100 }],
      returnDatePrices: [],
      cheapestOverall: null,
    } as unknown as SearchSummary;

    const result = summarizeSearchSummary(summary);

    expect(result).toEqual({
      inspectedOptions: 10,
      evaluatedDatePairs: 1,
      departureDateCandidates: 1,
      returnDateCandidates: 0,
      cheapestOverall: null,
    });
  });

  it("should handle cheapestOverall with missing outbound/return dates", () => {
    const summary = {
      inspectedOptions: 50,
      evaluatedDatePairs: [],
      departureDatePrices: [],
      returnDatePrices: [],
      cheapestOverall: {
        totalPrice: 150,
        currency: "EUR",
        source: "kiwi",
      },
    } as unknown as SearchSummary;

    const result = summarizeSearchSummary(summary);

    expect(result).toEqual({
      inspectedOptions: 50,
      evaluatedDatePairs: 0,
      departureDateCandidates: 0,
      returnDateCandidates: 0,
      cheapestOverall: {
        totalPrice: 150,
        currency: "EUR",
        source: "kiwi",
        outboundDate: null,
        returnDate: null,
      },
    });
  });
});

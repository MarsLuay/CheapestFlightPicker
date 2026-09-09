import { describe, it, expect } from "vitest";
import { parseSearchJobPayload } from "./index";

describe("parseSearchJobPayload", () => {
  it("should return requestInput as input if input is null", () => {
    const result = parseSearchJobPayload(null);
    expect(result).toEqual({ requestInput: null });
  });

  it("should return requestInput as input if input is a primitive", () => {
    const result = parseSearchJobPayload("test string");
    expect(result).toEqual({ requestInput: "test string" });
  });

  it("should return requestInput as input if input is an object without 'request' property", () => {
    const input = { someOtherKey: "value" };
    const result = parseSearchJobPayload(input);
    expect(result).toEqual({ requestInput: input });
  });

  it("should return requestInput as payload.request if input has 'request' property but no resumeFromJobId", () => {
    const requestData = { from: "NYC", to: "LAX" };
    const input = { request: requestData };
    const result = parseSearchJobPayload(input);
    expect(result).toEqual({ requestInput: requestData, resumeFromJobId: undefined });
  });

  it("should return resumeFromJobId if it is a valid string", () => {
    const requestData = { from: "NYC", to: "LAX" };
    const input = { request: requestData, resumeFromJobId: "job123" };
    const result = parseSearchJobPayload(input);
    expect(result).toEqual({ requestInput: requestData, resumeFromJobId: "job123" });
  });

  it("should trim resumeFromJobId string", () => {
    const requestData = { from: "NYC", to: "LAX" };
    const input = { request: requestData, resumeFromJobId: "  job123  " };
    const result = parseSearchJobPayload(input);
    expect(result).toEqual({ requestInput: requestData, resumeFromJobId: "job123" });
  });

  it("should return resumeFromJobId as undefined if it is an empty string after trimming", () => {
    const requestData = { from: "NYC", to: "LAX" };
    const input = { request: requestData, resumeFromJobId: "   " };
    const result = parseSearchJobPayload(input);
    expect(result).toEqual({ requestInput: requestData, resumeFromJobId: undefined });
  });

  it("should return resumeFromJobId as undefined if it is not a string", () => {
    const requestData = { from: "NYC", to: "LAX" };
    const input = { request: requestData, resumeFromJobId: 12345 };
    const result = parseSearchJobPayload(input);
    expect(result).toEqual({ requestInput: requestData, resumeFromJobId: undefined });
  });
});

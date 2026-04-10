import type {
  FlightOption,
  SearchProgress,
  SearchRequest
} from "../../../src/shared/types";

export type {
  TimeWindow,
  BookingSourceType,
  BookingSource,
  AirportRecord,
  AirlineRecord,
  DatePrice,
  FlightLeg,
  FlightSlice,
  FlightOption,
  TimingRecommendation,
  TimingConfidence,
  TimingTrend,
  TimingPricePosition,
  TimingGuidance,
  PriceAlertKind,
  PriceAlert,
  HackerFareInsight,
  SearchRequest,
  SearchSummary,
  SearchProgressPreview,
  SearchProgress,
  SearchJobStatus,
  SearchResponse
} from "../../../src/shared/types";

export type UpgradeFareCardState = {
  title: string;
  targetCabinClass: SearchRequest["cabinClass"];
  request: SearchRequest;
  option: FlightOption | null;
  progress: SearchProgress | null;
  status: "searching" | "ready" | "mirrored" | "failed";
  summaryNote?: string;
  emptyMessage: string;
};

export type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "error";
  message: string;
  details?: Record<string, unknown>;
};

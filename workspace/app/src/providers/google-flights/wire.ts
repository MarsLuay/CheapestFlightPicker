/**
 * Detect Google Flights HTTP-200 wire envelopes that carry no result payload.
 *
 * Shape: `)]}'\n[["wrb.fr", null, null, null, null, [13]], ...]`
 * where row[5][0] is a gRPC status (13 = INTERNAL). Treating these as empty
 * result sets poisons the local cache and shows a false "no flights" UI.
 */

const wirePrefixPattern = /^\)\]\}'/u;

/** gRPC codes that are worth retrying before surfacing to the user. */
const transientWireErrorCodes = new Set([
  4, // DEADLINE_EXCEEDED
  8, // RESOURCE_EXHAUSTED
  10, // ABORTED
  13, // INTERNAL
  14 // UNAVAILABLE
]);

export function stripGoogleFlightsWirePrefix(input: string): string {
  return input.replace(wirePrefixPattern, "").trim();
}

export function getGoogleFlightsWireErrorCode(input: string): number | null {
  try {
    const outer = JSON.parse(stripGoogleFlightsWirePrefix(input));
    if (!Array.isArray(outer)) {
      return null;
    }

    for (const row of outer) {
      if (!Array.isArray(row) || row[0] !== "wrb.fr") {
        continue;
      }

      if (typeof row[2] === "string" && row[2].length > 0) {
        return null;
      }

      const codeNode = row[5];
      if (Array.isArray(codeNode) && typeof codeNode[0] === "number") {
        return codeNode[0];
      }

      if (row[2] == null) {
        return -1;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function isTransientGoogleFlightsWireErrorCode(code: number): boolean {
  return transientWireErrorCodes.has(code);
}

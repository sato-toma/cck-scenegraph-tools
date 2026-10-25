import {
  ComponentRequirementRequest,
  ComponentRequirementStatusCounts,
} from "../../domain/types";

export const COMPONENT_REQUIREMENT_STATUSES = [
  "satisfied",
  "missing",
  "ambiguous",
  "unsupported",
  "unverified",
] as const;

export function summarizeComponentRequirements(
  requests: Pick<
    ComponentRequirementRequest,
    "verificationStatus" | "kind"
  >[],
): ComponentRequirementStatusCounts {
  const counts: ComponentRequirementStatusCounts = {
    satisfied: 0,
    missing: 0,
    ambiguous: 0,
    unsupported: 0,
    unverified: 0,
    optionalLookupMissing: 0,
  };

  for (const request of requests) {
    if (
      request.kind === "optional-lookup" &&
      request.verificationStatus === "missing"
    ) {
      counts.optionalLookupMissing += 1;
      continue;
    }
    counts[request.verificationStatus] += 1;
  }

  return counts;
}

export function formatComponentRequirementStatusCounts(
  counts: ComponentRequirementStatusCounts,
  indentation = "",
): string {
  const total = COMPONENT_REQUIREMENT_STATUSES.reduce(
    (sum, status) => sum + counts[status],
    0,
  ) + counts.optionalLookupMissing;
  const lines = [`${indentation}Component requirements: ${total}`];

  for (const status of COMPONENT_REQUIREMENT_STATUSES) {
    lines.push(`${indentation}  ${status}: ${counts[status]}`);
  }
  lines.push(
    `${indentation}  optional lookup missing: ${counts.optionalLookupMissing}`,
  );

  return lines.join("\n");
}

export function hasMissingComponentRequirements(
  requests: Pick<
    ComponentRequirementRequest,
    "verificationStatus" | "kind"
  >[],
): boolean {
  return requests.some(
    (request) =>
      request.verificationStatus === "missing" &&
      request.kind !== "optional-lookup",
  );
}

export function hasUnverifiedComponentRequirements(
  requests: Pick<
    ComponentRequirementRequest,
    "verificationStatus" | "kind"
  >[],
): boolean {
  return requests.some(
    (request) =>
      request.verificationStatus === "ambiguous" ||
      request.verificationStatus === "unsupported" ||
      request.verificationStatus === "unverified",
  );
}

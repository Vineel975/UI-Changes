"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ConditionTestCheck,
  ConditionTestStatus,
  PdfAnalysis,
} from "@/src/types";

interface MedicalAdmissibilityTabProps {
  fileName: string;
  medicalAdmissibility?: PdfAnalysis["medicalAdmissibility"] | null;
  onScrollToPage?: (pageNumber: number) => void;
}

type ConditionKey = string;

type TestRule = {
  key: string;
  label: string;
  expected: string;
  concern: string;
  evaluate: (input: {
    rawValue?: string;
    numericValue?: number;
    source?: ConditionTestCheck;
  }) => { status: ConditionTestStatus; reason?: string };
  matchers?: string[];
};

type ConditionRule = {
  key: ConditionKey;
  label: string;
  diagnosisKeywords: string[];
  tests: TestRule[];
  icdCode?: string;
};

type ConditionRow = {
  condition: string;
  test: string;
  reported: "Yes" | "No";
  icdCode?: string;
  pageNumber?: number;
  conditionKey?: string; // Added to identify which condition this row belongs to
};

function inferDefaultCataractIcdCode(
  medicalAdmissibility?: PdfAnalysis["medicalAdmissibility"] | null
): string {
  const diagnosis = (medicalAdmissibility?.diagnosis || "").toLowerCase();
  const doctorNotes = (medicalAdmissibility?.doctorNotes || "").toLowerCase();
  const conditionTestsText = (
    ((medicalAdmissibility as { conditionTests?: ConditionTestCheck[] })
      ?.conditionTests || []) as ConditionTestCheck[]
  )
    .map((ct) => {
      return `${ct.condition || ""} ${ct.matchedDiagnosis || ""} ${ct.testName || ""} ${ct.reportValue || ""} ${ct.sourceText || ""}`.toLowerCase();
    })
    .join(" ");

  const combined = `${diagnosis} ${doctorNotes} ${conditionTestsText}`.trim();

  if (
    combined.includes("secondary cataract") ||
    combined.includes("after cataract")
  ) {
    return "H26.40";
  }
  if (combined.includes("cortical")) {
    return "H25.9";
  }

  // Safe default starting point for cataract, user can change from dropdown.
  return "H25.9";
}

function matchesTestName(testName: string, rule: TestRule): boolean {
  const normalized = testName.toLowerCase();
  if (normalized.includes(rule.label.toLowerCase())) return true;
  if (rule.matchers) {
    return rule.matchers.some((matcher) => normalized.includes(matcher));
  }
  return false;
}

function matchesConditionName(
  condition: string | undefined,
  rule: ConditionRule
): boolean {
  if (!condition) return false;
  const normalized = condition.toLowerCase();
  return (
    normalized.includes(rule.label.toLowerCase()) ||
    normalized.includes(rule.key)
  );
}

/**
 * Fetches ICD-10-CM code for a medical condition using NLM API
 * Extracts the base condition name (removes parenthetical test info) for better search results
 */
async function fetchICDCode(condition: string): Promise<string | undefined> {
  try {
    const baseCondition = condition.split("(")[0].trim();
    const searchTerm = baseCondition.toLowerCase();
    const response = await fetch(
      `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(searchTerm)}&maxList=15`
    );
    const result = await response.json();
    if (result && Array.isArray(result) && result.length >= 2 && result[1].length > 0) {
      if (searchTerm.includes("cataract")) {
        const ageRelatedIndex = result[1].findIndex((code: string) => code.startsWith("H25"));
        if (ageRelatedIndex !== -1) return result[1][ageRelatedIndex];
      }
      return result[1][0];
    }
    return undefined;
  } catch (error) {
    console.error(`Error fetching ICD code for ${condition}:`, error);
    return undefined;
  }
}

/** Fetches multiple ICD code options for a condition — used to populate dropdowns */
async function fetchICDOptions(condition: string): Promise<{ code: string; description: string }[]> {
  try {
    const searchTerm = condition.split("(")[0].trim().toLowerCase();
    const response = await fetch(
      `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(searchTerm)}&maxList=10`
    );
    const result = await response.json();
    // result[1] = [codes], result[3] = [[code, name], ...]
    if (result && Array.isArray(result) && result[1]?.length > 0) {
      return (result[1] as string[]).map((code: string, i: number) => {
        const namePair = result[3]?.[i];
        const description = Array.isArray(namePair) ? (namePair[1] ?? code) : code;
        return { code, description };
      });
    }
    return [];
  } catch {
    return [];
  }
}

const conditionRules: ConditionRule[] = [
  {
    key: "cataract",
    label: "Cataract (A-scan)",
    diagnosisKeywords: ["cataract"],
    icdCode: "H25.9", // Valid dropdown default (can be overridden by API/user)
    tests: [
      {
        key: "a_scan",
        label: "A-scan",
        expected: "",
        concern: "",
        evaluate: ({ rawValue }) => {
          // Check if A-scan is reported (Yes) or not (No)
          if (!rawValue) {
            return { status: "missing" };
          }
          const value = rawValue.toLowerCase();
          if (
            value === "yes" ||
            value.includes("a-scan") ||
            value.includes("ascan") ||
            value.includes("axial length")
          ) {
            return { status: "expected" };
          }
          return { status: "missing" };
        },
        matchers: ["a-scan", "ascan", "axial length", "axl"],
      },
    ],
  },
];

// Cataract ICD-10-CM codes with descriptions (2026)
const cataractICDCodes = [
  { code: "H26.9", description: "Unspecified cataract" },
  { code: "H25.9", description: "Unspecified age-related (senile) cataract" },
  { code: "H25.011", description: "Cortical age-related cataract, right eye" },
  { code: "H25.012", description: "Cortical age-related cataract, left eye" },
  { code: "H25.013", description: "Cortical age-related cataract, bilateral" },
  { code: "H26.40", description: "Secondary cataract, unspecified eye" },
  { code: "H26.41", description: "Secondary cataract, right eye" },
  { code: "H26.42", description: "Secondary cataract, left eye" },
  { code: "H26.43", description: "Secondary cataract, bilateral" },
];

function buildConditionRows(
  diagnosisText: string,
  conditionTests?: ConditionTestCheck[],
  icdCodeMap?: Map<string, string>
): ConditionRow[] {
  const rows: ConditionRow[] = [];

  for (const rule of conditionRules) {
    const aiCondition = conditionTests?.find((condition) =>
      matchesConditionName(condition.condition, rule)
    );
    const matchedByDiagnosis = rule.diagnosisKeywords.some((keyword) =>
      diagnosisText.includes(keyword)
    );

    if (!aiCondition && !matchedByDiagnosis) {
      continue;
    }

    // Get ICD code from map or rule
    const icdCode = icdCodeMap?.get(rule.key) || rule.icdCode || undefined;

    for (const testRule of rule.tests) {
      const fallbackConditionByTest = conditionTests?.find((condition) =>
        matchesTestName(condition.testName || "", testRule)
      );
      const aiTest =
        (aiCondition &&
        matchesTestName(aiCondition.testName || "", testRule)
          ? aiCondition
          : undefined) || fallbackConditionByTest;
      const selectedCondition = aiTest || aiCondition || fallbackConditionByTest;
      const rawValue = aiTest?.reportValue || aiTest?.sourceText;

      const evaluation = testRule.evaluate({
        rawValue,
        numericValue: undefined,
        source: aiTest,
      });

      // Determine if reported (Yes) or not (No)
      const reported: "Yes" | "No" =
        evaluation.status === "expected" ||
        (rawValue && rawValue.toLowerCase() === "yes") ||
        (aiTest && aiTest.status === "expected")
          ? "Yes"
          : "No";

      // Get page number from condition
      const conditionPageNumber = selectedCondition?.pageNumber;

      rows.push({
        condition: rule.label,
        test: testRule.label,
        reported,
        icdCode,
        pageNumber: conditionPageNumber,
        conditionKey: rule.key, // Add condition key for dropdown
      });
    }
  }

  return rows;
}

/**
 * Builds rows for AI-extracted conditions that don't match any hardcoded rule.
 * Handles any condition — maternity, glaucoma, diabetes, etc.
 */
function buildDynamicConditionRows(
  conditionTests: ConditionTestCheck[],
  icdCodeMap?: Map<string, string>,
): ConditionRow[] {
  const rows: ConditionRow[] = [];
  for (const ct of conditionTests) {
    const matchesRule = conditionRules.some((r) =>
      matchesConditionName(ct.condition, r)
    );
    if (matchesRule) continue; // already handled by buildConditionRows

    const conditionKey = (ct.condition || ct.matchedDiagnosis || "")
      .toLowerCase()
      .trim();
    if (!conditionKey) continue;

    const icdCode = icdCodeMap?.get(conditionKey) || undefined;
    const reported: "Yes" | "No" =
      ct.status === "expected" ||
      (ct.reportValue || "").toLowerCase() === "yes"
        ? "Yes"
        : "No";

    rows.push({
      condition: ct.condition || ct.matchedDiagnosis || "—",
      test: ct.testName || "—",
      reported,
      icdCode,
      pageNumber: ct.pageNumber,
      conditionKey,
    });
  }
  return rows;
}

export function MedicalAdmissibilityTab({
  fileName,
  medicalAdmissibility,
  onScrollToPage,
}: MedicalAdmissibilityTabProps) {
  const [icdCodeMap, setIcdCodeMap] = useState<Map<string, string>>(new Map());
  const [selectedICDCodes, setSelectedICDCodes] = useState<Map<string, string>>(new Map());
  const [selectedICDCodes2, setSelectedICDCodes2] = useState<Map<string, string>>(new Map());
  const [selectedICDCodes3, setSelectedICDCodes3] = useState<Map<string, string>>(new Map());
  // conditionKey -> array of {code, description} options fetched from NLM
  const [icdOptionsMap, setIcdOptionsMap] = useState<Map<string, { code: string; description: string }[]>>(new Map());

  // Fetch ICD codes for conditions that appear in the data
  useEffect(() => {
    const fetchICDCodes = async () => {
      if (!medicalAdmissibility) return;

      const diagnosisText = (
        medicalAdmissibility.diagnosis || ""
      ).toLowerCase();
      const conditionTests =
        (medicalAdmissibility as { conditionTests?: ConditionTestCheck[] })
          .conditionTests || [];

      const newIcdCodeMap = new Map<string, string>();
      const fallbackCataractIcd = inferDefaultCataractIcdCode(medicalAdmissibility);

      // Find which hardcoded-rule conditions are present
      const presentConditions = new Set<string>();
      for (const rule of conditionRules) {
        const aiCondition = conditionTests.find((condition) =>
          matchesConditionName(condition.condition, rule)
        );
        const matchedByDiagnosis = rule.diagnosisKeywords.some((keyword) =>
          diagnosisText.includes(keyword)
        );
        if (aiCondition || matchedByDiagnosis) {
          presentConditions.add(rule.key);
        }
      }

      // Also fetch ICD for any AI-extracted conditions not in conditionRules
      for (const ct of conditionTests) {
        const matchesRule = conditionRules.some((r) =>
          matchesConditionName(ct.condition, r)
        );
        if (!matchesRule) {
          const key = (ct.condition || ct.matchedDiagnosis || "").toLowerCase().trim();
          if (key) presentConditions.add(key);
        }
      }

      // Fetch ICD codes for present conditions (always fetch, but use hardcoded as fallback)
      await Promise.all(
        Array.from(presentConditions).map(async (conditionKey) => {
          const rule = conditionRules.find((r) => r.key === conditionKey);
          const searchLabel = rule?.label || conditionKey;

          const fetchedIcdCode = await fetchICDCode(searchLabel);
          const icdCode =
            fetchedIcdCode ||
            (rule?.key === "cataract" ? fallbackCataractIcd : undefined) ||
            rule?.icdCode;

          if (icdCode) {
            newIcdCodeMap.set(conditionKey, icdCode);
          }
        })
      );

      // Initialize with best available defaults so ICD is never blank at start.
      setIcdCodeMap(newIcdCodeMap);
      setSelectedICDCodes(new Map(newIcdCodeMap));

      // Fetch dropdown options for all present conditions and seed codes 2 & 3
      const newOptionsMap = new Map<string, { code: string; description: string }[]>();
      const newSelectedCodes2 = new Map<string, string>();
      const newSelectedCodes3 = new Map<string, string>();

      await Promise.all(
        Array.from(presentConditions).map(async (conditionKey) => {
          const rule = conditionRules.find((r) => r.key === conditionKey);
          // For cataract use the existing hardcoded list, others fetch from API
          if (conditionKey === "cataract") {
            newOptionsMap.set(conditionKey, cataractICDCodes);
          } else {
            const searchLabel = rule?.label || conditionKey;
            const options = await fetchICDOptions(searchLabel);
            if (options.length) newOptionsMap.set(conditionKey, options);
          }
          // Seed code-2 and code-3 from AI-extracted fields if available
          const aiCode2 = (medicalAdmissibility as { icdCode2?: string })?.icdCode2;
          const aiCode3 = (medicalAdmissibility as { icdCode3?: string })?.icdCode3;
          if (aiCode2) newSelectedCodes2.set(conditionKey, aiCode2);
          if (aiCode3) newSelectedCodes3.set(conditionKey, aiCode3);
        })
      );

      setIcdOptionsMap(newOptionsMap);
      setSelectedICDCodes2(newSelectedCodes2);
      setSelectedICDCodes3(newSelectedCodes3);
    };

    fetchICDCodes();
  }, [medicalAdmissibility]);

  const conditionTests = medicalAdmissibility
    ? ((medicalAdmissibility as { conditionTests?: ConditionTestCheck[] }).conditionTests || [])
    : [];

  const conditionRows = medicalAdmissibility
    ? [
        ...buildConditionRows(
          (medicalAdmissibility.diagnosis || "").toLowerCase(),
          conditionTests,
          icdCodeMap,
        ),
        ...buildDynamicConditionRows(conditionTests, icdCodeMap),
      ]
    : [];

  // Handle ICD code selection for cataract
  const handleICDCodeChange = (conditionKey: string, code: string) => {
    setSelectedICDCodes((prev) => { const m = new Map(prev); m.set(conditionKey, code); return m; });
  };
  const handleICDCode2Change = (conditionKey: string, code: string) => {
    setSelectedICDCodes2((prev) => { const m = new Map(prev); m.set(conditionKey, code); return m; });
  };
  const handleICDCode3Change = (conditionKey: string, code: string) => {
    setSelectedICDCodes3((prev) => { const m = new Map(prev); m.set(conditionKey, code); return m; });
  };

  // Get display ICD code (prefer selected, fall back to fetched)
  const getDisplayICDCode = (conditionKey: string, fetchedCode?: string) =>
    selectedICDCodes.get(conditionKey) || fetchedCode;
  const getDisplayICDCode2 = (conditionKey: string) =>
    selectedICDCodes2.get(conditionKey) || "";
  const getDisplayICDCode3 = (conditionKey: string) =>
    selectedICDCodes3.get(conditionKey) || "";

  /** Shared dropdown renderer — same style for all three ICD columns */
  const renderICDDropdown = (
    conditionKey: string,
    value: string,
    onChange: (code: string) => void,
    fallbackOptions?: { code: string; description: string }[],
  ) => {
    const options = icdOptionsMap.get(conditionKey) ?? fallbackOptions ?? [];
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-full min-w-[120px]">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {options.map((icd) => (
            <SelectItem key={icd.code} value={icd.code}>
              <span className="font-mono text-sm font-medium text-blue-700">
                {icd.code}
              </span>
            </SelectItem>
          ))}
          {options.length === 0 && (
            <SelectItem value="_loading" disabled>
              Loading...
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Medical Admissibility Check</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!medicalAdmissibility ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground">
            No medical admissibility data available for this file.
          </div>
        ) : (
          <div className="space-y-4">
              {medicalAdmissibility.diagnosis && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700">
                    Diagnosis
                  </div>
                  <div className="text-sm text-gray-900 bg-gray-50 rounded-md p-3 border">
                    {medicalAdmissibility.diagnosis}
                  </div>
                </div>
              )}
              {medicalAdmissibility.doctorNotes && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700">
                    Doctor Notes
                  </div>
                  <div
                    className={`text-sm text-gray-900 bg-gray-50 rounded-md p-3 border whitespace-pre-wrap ${
                      onScrollToPage &&
                      medicalAdmissibility.doctorNotesPageNumber
                        ? "cursor-pointer hover:bg-gray-100 transition-colors"
                        : ""
                    }`}
                    onClick={() => {
                      if (
                        onScrollToPage &&
                        medicalAdmissibility.doctorNotesPageNumber
                      ) {
                        onScrollToPage(
                          medicalAdmissibility.doctorNotesPageNumber
                        );
                      }
                    }}
                  >
                    {medicalAdmissibility.doctorNotes}
                  </div>
                </div>
              )}
              {conditionRows.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700">
                    Diagnosis-Linked Test Checks
                  </div>
                  <div className="rounded-md border bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Condition</TableHead>
                          <TableHead>Test</TableHead>
                          <TableHead>ICD Code-1</TableHead>
                          <TableHead>ICD Code-2</TableHead>
                          <TableHead>ICD Code-3</TableHead>
                          <TableHead>ICD Description</TableHead>
                          <TableHead>Reported</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conditionRows.map((row, idx) => (
                          <TableRow
                            key={`condition-row-${idx}`}
                            className={`${
                              onScrollToPage && row.pageNumber
                                ? "cursor-pointer hover:bg-gray-50 transition-colors"
                                : ""
                            }`}
                          >
                            <TableCell
                              className="align-top text-sm font-medium text-gray-800"
                              onClick={(e) => {
                                if (onScrollToPage && row.pageNumber) {
                                  onScrollToPage(row.pageNumber);
                                }
                              }}
                            >
                              {row.condition}
                            </TableCell>
                            <TableCell
                              className="align-top"
                              onClick={(e) => {
                                if (onScrollToPage && row.pageNumber) {
                                  onScrollToPage(row.pageNumber);
                                }
                              }}
                            >
                              {row.test}
                            </TableCell>
                            {/* ICD Code-1 */}
                            <TableCell className="align-top">
                              {renderICDDropdown(
                                row.conditionKey!,
                                getDisplayICDCode(row.conditionKey!, row.icdCode) ?? "",
                                (code) => handleICDCodeChange(row.conditionKey!, code),
                                row.conditionKey === "cataract" ? cataractICDCodes : undefined,
                              )}
                            </TableCell>
                            {/* ICD Code-2 */}
                            <TableCell className="align-top">
                              {renderICDDropdown(
                                row.conditionKey!,
                                getDisplayICDCode2(row.conditionKey!),
                                (code) => handleICDCode2Change(row.conditionKey!, code),
                                row.conditionKey === "cataract" ? cataractICDCodes : undefined,
                              )}
                            </TableCell>
                            {/* ICD Code-3 */}
                            <TableCell className="align-top">
                              {renderICDDropdown(
                                row.conditionKey!,
                                getDisplayICDCode3(row.conditionKey!),
                                (code) => handleICDCode3Change(row.conditionKey!, code),
                                row.conditionKey === "cataract" ? cataractICDCodes : undefined,
                              )}
                            </TableCell>
                            {/* ICD Description — from selected Code-1 */}
                            <TableCell className="align-top">
                              <span className="text-sm text-gray-700">
                                {(icdOptionsMap.get(row.conditionKey!) ?? cataractICDCodes).find(
                                  (icd) => icd.code === getDisplayICDCode(row.conditionKey!, row.icdCode)
                                )?.description || "-"}
                              </span>
                            </TableCell>
                            <TableCell
                              className="align-top"
                              onClick={(e) => {
                                if (onScrollToPage && row.pageNumber) {
                                  onScrollToPage(row.pageNumber);
                                }
                              }}
                            >
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  row.reported === "Yes"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {row.reported}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {!medicalAdmissibility.diagnosis &&
                !medicalAdmissibility.doctorNotes &&
                conditionRows.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No diagnosis or doctor notes available.
                  </div>
                )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

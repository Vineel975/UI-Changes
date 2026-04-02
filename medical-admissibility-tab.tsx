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
import type {
  ConditionTestCheck,
  PdfAnalysis,
} from "@/src/types";

interface MedicalAdmissibilityTabProps {
  fileName: string;
  medicalAdmissibility?: PdfAnalysis["medicalAdmissibility"] | null;
  onScrollToPage?: (pageNumber: number) => void;
}

type ConditionRow = {
  condition: string;
  test: string;
  reported: "Yes" | "No";
  icdCode?: string;
  icdDescription?: string;
  pageNumber?: number;
  conditionKey: string;
};

/** Fetches the best-matching ICD-10-CM code and description for any condition via NLM API. */
async function fetchICDCode(
  condition: string,
): Promise<{ code: string; description: string } | undefined> {
  try {
    const searchTerm = condition.split("(")[0].trim().toLowerCase();
    // API returns [numFound, [codes], extra, [[code, description], ...]]
    const response = await fetch(
      `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(searchTerm)}&maxList=10`,
    );
    const result = await response.json() as [number, string[], unknown, string[][]];
    if (Array.isArray(result) && result[1]?.length > 0) {
      const code = result[1][0];
      const namePair = result[3]?.[0];
      const description = Array.isArray(namePair) ? (namePair[1] ?? "") : "";
      return { code, description };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function buildConditionRows(
  conditionTests: ConditionTestCheck[],
  icdCodeMap: Map<string, { code: string; description: string }>,
): ConditionRow[] {
  if (!conditionTests.length) return [];

  return conditionTests.map((ct) => {
    const conditionKey = (ct.condition || ct.matchedDiagnosis || "")
      .toLowerCase()
      .replace(/\s+/g, "_");

    const icdEntry = icdCodeMap.get(conditionKey);

    const reported: "Yes" | "No" =
      ct.status === "expected" ||
      (ct.reportValue || "").toLowerCase() === "yes"
        ? "Yes"
        : "No";

    return {
      condition: ct.condition || ct.matchedDiagnosis || "—",
      test: ct.testName || "—",
      reported,
      icdCode: icdEntry?.code,
      icdDescription: icdEntry?.description,
      pageNumber: ct.pageNumber,
      conditionKey,
    };
  });
}
): ConditionRow[] {
  if (!conditionTests.length) return [];

  return conditionTests.map((ct) => {
    const conditionKey = (ct.condition || ct.matchedDiagnosis || "")
      .toLowerCase()
      .replace(/\s+/g, "_");

    const icdCode = icdCodeMap.get(conditionKey) || undefined;

    const reported: "Yes" | "No" =
      ct.status === "expected" ||
      (ct.reportValue || "").toLowerCase() === "yes"
        ? "Yes"
        : "No";

    return {
      condition: ct.condition || ct.matchedDiagnosis || "—",
      test: ct.testName || "—",
      reported,
      icdCode,
      pageNumber: ct.pageNumber,
      conditionKey,
    };
  });
}

export function MedicalAdmissibilityTab({
  fileName,
  medicalAdmissibility,
  onScrollToPage,
}: MedicalAdmissibilityTabProps) {
  const [icdCodeMap, setIcdCodeMap] = useState<Map<string, { code: string; description: string }>>(new Map());

  // Fetch ICD-10-CM codes and descriptions for all AI-extracted conditions via NLM API
  useEffect(() => {
    const fetchICDCodes = async () => {
      if (!medicalAdmissibility) return;

      const conditionTests =
        (medicalAdmissibility as { conditionTests?: ConditionTestCheck[] })
          .conditionTests || [];

      if (!conditionTests.length) return;

      const newIcdCodeMap = new Map<string, { code: string; description: string }>();

      await Promise.all(
        conditionTests.map(async (ct) => {
          const conditionKey = (ct.condition || ct.matchedDiagnosis || "")
            .toLowerCase()
            .replace(/\s+/g, "_");
          if (!conditionKey || newIcdCodeMap.has(conditionKey)) return;

          const conditionLabel = ct.condition || ct.matchedDiagnosis || "";
          const fetched = await fetchICDCode(conditionLabel);
          if (fetched) {
            newIcdCodeMap.set(conditionKey, fetched);
          }
        }),
      );

      setIcdCodeMap(newIcdCodeMap);
    };

    void fetchICDCodes();
  }, [medicalAdmissibility]);

  const conditionRows = medicalAdmissibility
    ? buildConditionRows(
        (medicalAdmissibility as { conditionTests?: ConditionTestCheck[] })
          .conditionTests || [],
        icdCodeMap,
      )
    : [];

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
                              {row.icdCode ? (
                                <span className="text-sm font-mono text-blue-700">
                                  {row.icdCode}
                                </span>
                              ) : medicalAdmissibility?.icdCode1 ? (
                                <span className="text-sm font-mono text-blue-700">
                                  {medicalAdmissibility.icdCode1}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {/* ICD Code-2 */}
                            <TableCell className="align-top">
                              {medicalAdmissibility?.icdCode2 ? (
                                <span className="text-sm font-mono text-blue-700">
                                  {medicalAdmissibility.icdCode2}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {/* ICD Code-3 */}
                            <TableCell className="align-top">
                              {medicalAdmissibility?.icdCode3 ? (
                                <span className="text-sm font-mono text-blue-700">
                                  {medicalAdmissibility.icdCode3}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {/* ICD Description — from NLM API lookup */}
                            <TableCell className="align-top">
                              {row.icdDescription ? (
                                <span className="text-sm text-gray-700">
                                  {row.icdDescription}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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

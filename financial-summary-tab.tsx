"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClaimCalculationResult } from "@/src/claim-calculation";
import type {
  BSIData,
  EyeType,
  HospitalBillBreakdownItem,
  LensTypeApproval,
  TariffBreakdownItem,
} from "@/src/types";

interface FinancialSummaryTabProps {
  fileName: string;
  claimCalculation?: ClaimCalculationResult | null;
  financialSummaryTotals: {
    hospitalBillAfterDiscount: number;
    hospitalBillBeforeDiscount: number;
    discount: number;
    insurerPayable: number;
  };
  finalInsurerPayable?: number | null;
  finalInsurerPayableNotes?: string | null;
  formatAmountValue: (amount?: number | null) => string;
  benefitAmount?: number | null;
  lensType?: string | null;
  lensTypePageNumber?: number | null;
  lensTypeApproved?: LensTypeApproval;
  eyeType?: EyeType | null;
  isAllInclusivePackage: boolean;
  tariffPageNumber?: number | null;
  tariffNotes?: string | null;
  tariffClarificationNote?: string | null;
  tariffExtractionItem?: TariffBreakdownItem[] | null;
  hospitalBillBreakdown?: HospitalBillBreakdownItem[] | null;
  hospitalBillPageNumber?: number | null;
  onHospitalAmountClick?: (pageNumber?: number | null) => void;
  onTariffAmountClick?: (pageNumber?: number | null, highlightText?: string, highlightName?: string) => void;
  /** Passed from result-view — same claimId used by benefit-plan and patient-info tabs */
  claimId?: string;
}

export function FinancialSummaryTab({
  claimCalculation,
  financialSummaryTotals,
  finalInsurerPayable,
  finalInsurerPayableNotes,
  formatAmountValue,
  benefitAmount,
  lensType,
  lensTypePageNumber,
  lensTypeApproved,
  isAllInclusivePackage,
  tariffNotes,
  tariffClarificationNote,
  tariffExtractionItem,
  hospitalBillBreakdown,
  hospitalBillPageNumber,
  onHospitalAmountClick,
  tariffPageNumber,
  onTariffAmountClick,
  claimId,
}: FinancialSummaryTabProps) {

  // ── BSI state — fetched client-side via /api/bsi (runs on localhost:3000) ──
  const [bsiData, setBsiData] = useState<BSIData | null>(null);
  const [bsiLoading, setBsiLoading] = useState(false);
  const [bsiError, setBsiError] = useState<string | null>(null);

  const loadBsi = useCallback(async () => {
    const trimmed = claimId?.trim();
    if (!trimmed) {
      setBsiData(null);
      setBsiError("Claim ID is not available for this job.");
      return;
    }

    setBsiLoading(true);
    setBsiError(null);

    try {
      const response = await fetch("/api/bsi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: trimmed }),
      });

      const payload = (await response.json()) as { bsiData?: BSIData; error?: string };

      if (!response.ok || !payload.bsiData) {
        throw new Error(payload.error ?? "Failed to fetch BSI data");
      }

      setBsiData(payload.bsiData);
    } catch (err) {
      setBsiData(null);
      setBsiError(err instanceof Error ? err.message : "Failed to fetch BSI data");
    } finally {
      setBsiLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    void loadBsi();
  }, [loadBsi]);
  // ───────────────────────────────────────────────────────────────────────────

  const normalizeAmount = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  const isLensComponent = (name?: string | null, code?: string | null) =>
    /lens|iol|implant/i.test(`${name || ""} ${code || ""}`);
  const sumLensAmountFromTariff = (items?: TariffBreakdownItem[] | null) => {
    if (!Array.isArray(items)) return null;
    return items.reduce((sum, item) => {
      const amount = normalizeAmount(item.amount);
      if (amount === null) return sum;
      return isLensComponent(item.name, item.code) ? sum + amount : sum;
    }, 0);
  };
  const sumLensAmountFromHospital = (items?: HospitalBillBreakdownItem[] | null) => {
    if (!Array.isArray(items)) return null;
    return items.reduce((sum, item) => {
      const amount = normalizeAmount(item.amount);
      if (amount === null) return sum;
      return isLensComponent(item.name) ? sum + amount : sum;
    }, 0);
  };

  const hospitalAmount = normalizeAmount(financialSummaryTotals.hospitalBillAfterDiscount);
  const benefitTotal = normalizeAmount(benefitAmount);
  const tariffItems = Array.isArray(tariffExtractionItem) ? tariffExtractionItem : [];
  const tariffItemsTotal = tariffItems.reduce(
    (sum, item) => sum + (normalizeAmount(item.amount) ?? 0), 0,
  );
  const effectiveTariffTotal = tariffItems.length > 0 ? tariffItemsTotal : null;
  const tariffLensAmount = sumLensAmountFromTariff(tariffItems);
  const hospitalLensAmount = sumLensAmountFromHospital(hospitalBillBreakdown);
  const tariffWithoutLens =
    tariffLensAmount !== null && effectiveTariffTotal !== null
      ? Math.max(effectiveTariffTotal - tariffLensAmount, 0) : null;
  const hospitalWithoutLens =
    hospitalAmount !== null && hospitalLensAmount !== null
      ? Math.max(hospitalAmount - hospitalLensAmount, 0) : null;

  const completePackage = isAllInclusivePackage;

  const totalAmountApproved =
    claimCalculation?.totalAmountApproved ??
    normalizeAmount(finalInsurerPayable) ??
    (() => {
      if (completePackage) {
        if (hospitalAmount === null || effectiveTariffTotal === null) return null;
        const packageMin = Math.min(hospitalAmount, effectiveTariffTotal);
        return benefitTotal === null ? packageMin : Math.min(packageMin, benefitTotal);
      }
      if (tariffWithoutLens === null || hospitalWithoutLens === null ||
          tariffLensAmount === null || hospitalLensAmount === null) {
        if (hospitalAmount === null || effectiveTariffTotal === null) return null;
        const fallbackMin = Math.min(hospitalAmount, effectiveTariffTotal);
        return benefitTotal === null ? fallbackMin : Math.min(fallbackMin, benefitTotal);
      }
      const baseAmount = Math.min(tariffWithoutLens, hospitalWithoutLens);
      const lensAmount = Math.min(tariffLensAmount, 10000, hospitalLensAmount);
      const nonPackageTotal = baseAmount + lensAmount;
      return benefitTotal === null ? nonPackageTotal : Math.min(nonPackageTotal, benefitTotal);
    })();

  // ── BSI derived values ──────────────────────────────────────────────────────
  const bsiBaseSI =
    bsiData?.Suminsured?.find((r) => r.SICategery === 69) ??
    bsiData?.Suminsured?.[0] ?? null;
  const bsiEffectiveBalance: number | null =
    typeof bsiBaseSI?.EffectiveBalance === "number" ? bsiBaseSI.EffectiveBalance : null;
  const bsiCappedPayable: number | null =
    totalAmountApproved !== null && bsiEffectiveBalance !== null
      ? Math.min(totalAmountApproved, bsiEffectiveBalance)
      : totalAmountApproved;
  const bsiCapApplied: boolean =
    bsiCappedPayable !== null && totalAmountApproved !== null &&
    bsiCappedPayable < totalAmountApproved;
  // ───────────────────────────────────────────────────────────────────────────

  const lensTypeValue = lensType?.trim() || null;
  const lensApproved: LensTypeApproval | null = lensTypeApproved ?? null;

  const formatBoolean = (value: boolean) => (value ? "Yes" : "No");
  const formatLensTypeApproved = (value: LensTypeApproval | null) =>
    value === null ? "—" : value === "cant determine" ? "cant determine" : value ? "Yes" : "No";
  const formatDisplayAmount = (value: number | null) =>
    value === null ? "—" : `INR ${formatAmountValue(value)}`;
  const formatAppliedRule = (value?: string | null) => {
    switch (value) {
      case "policy_limit_or_hospital_package_lower": return "Lower of policy cataract limit and hospital package/R&C";
      case "no_policy_limit_use_hospital_package": return "No policy limit, so hospital package selected";
      case "no_policy_limit_package_excludes_lens": return "No policy limit and package excludes lens, so procedure package plus lens R&C applied";
      case "niac_no_policy_limit_lens_excluded": return "NIAC rule with no policy limit and package excludes lens, capped at INR 50,000";
      case "niac_flexi_floater_cap_24000": return "NIAC Flexi Floater cataract cap applied at INR 24,000";
      case "psu_retail_upto_5l_package_plus_lens": return "PSU retail up to 5L: package plus monofocal lens";
      case "psu_corporate_above_5l_package_plus_lens": return "PSU corporate above 5L: package plus monofocal lens";
      case "psu_corporate_above_5l_no_cataract_limit_cap_45000": return "PSU corporate above 5L with no cataract limit: capped at INR 45,000";
      case "psu_no_policy_limit_package_plus_lens": return "PSU no policy limit: package plus monofocal lens";
      case "no_policy_limit_no_package_lens_rc_only": return "No policy limit or package, so lens R&C only applied";
      case "policy_limit_without_package": return "Policy cataract limit applied without package reference";
      case "billed_amount_only": return "Billed amount applied";
      case "standard_billed_or_tariff": return "Standard billed/tariff calculation";
      default: return "—";
    }
  };

  const lensTypeLinkable = !!lensTypePageNumber && !!onTariffAmountClick;
  const goToLensTypePage = () => { if (lensTypePageNumber && onTariffAmountClick) onTariffAmountClick(lensTypePageNumber); };
  const hospitalLinkable = !!hospitalBillPageNumber && !!onHospitalAmountClick;
  const tariffLinkable = !!tariffPageNumber && !!onTariffAmountClick;
  const goToHospitalPage = () => { if (hospitalBillPageNumber && onHospitalAmountClick) onHospitalAmountClick(hospitalBillPageNumber); };
  const goToTariffPage = () => { if (tariffPageNumber && onTariffAmountClick) onTariffAmountClick(tariffPageNumber); };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4">

          {/* Hospital bill extraction */}
          <Card className="bg-white border-2">
            <CardContent>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Hospital bill extraction</span>
                {hospitalLinkable && (
                  <button type="button" onClick={goToHospitalPage} className="normal-case text-xs font-medium text-blue-600">
                    Page {hospitalBillPageNumber}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {Array.isArray(hospitalBillBreakdown) && hospitalBillBreakdown.length > 0 ? (
                  hospitalBillBreakdown.map((item, idx) => (
                    <div key={`hospital-breakdown-${idx}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{item.name}</span>
                      <span className="font-medium text-gray-900">{formatAmountValue(item.amount)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-700">Amount: {formatDisplayAmount(hospitalAmount)}</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tariff extraction */}
          <Card className="bg-green-50 border-2 border-green-200">
            <CardContent>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold uppercase tracking-wide text-green-700">
                <span>Tariff extraction</span>
                {tariffLinkable && (
                  <button type="button" onClick={goToTariffPage} className="normal-case text-xs font-medium text-blue-600">
                    Page {tariffPageNumber}
                  </button>
                )}
              </div>
              <div className="space-y-1 border-t border-green-200 pt-2">
                {tariffItems.length > 0 ? (
                  tariffItems.map((item, idx) => {
                    const amountStr = formatAmountValue(item.amount);
                    const clickable = tariffLinkable && item.amount != null;
                    return (
                      <div
                        key={`tariff-breakdown-${idx}`}
                        className={`flex items-center justify-between text-sm rounded px-1 py-0.5 ${
                          clickable
                            ? "cursor-pointer hover:bg-green-100 transition-colors"
                            : ""
                        }`}
                        onClick={() => {
                          if (clickable && onTariffAmountClick) {
                            onTariffAmountClick(tariffPageNumber, amountStr, item.name);
                          }
                        }}
                      >
                        <span className="text-green-700">{item.name}</span>
                        <span className={`font-medium text-green-900 ${clickable ? "underline decoration-dotted" : ""}`}>
                          {amountStr}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-green-700">—</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Benefit extraction */}
          <Card className="bg-purple-50 border-2 border-purple-200">
            <CardContent>
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-purple-700">
                Benefit extraction
              </div>
              <div className="text-sm text-gray-700">{formatDisplayAmount(benefitTotal)}</div>
            </CardContent>
          </Card>

          {/* Balance Sum Insured */}
          <Card className="border-2 border-slate-300 bg-slate-50">
            <CardContent className="pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  Balance Sum Insured
                </div>
                <div className="text-[10px] font-medium text-slate-400">Live · McarePlus DB</div>
              </div>

              {bsiLoading && (
                <div className="text-xs text-slate-500 animate-pulse">
                  Fetching live SI balance...
                </div>
              )}

              {bsiError && !bsiLoading && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <span className="font-semibold">BSI not available: </span>{bsiError}
                </div>
              )}

              {bsiData && !bsiLoading && (
                <div className="space-y-3">
                  {/* Main SI table */}
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-700 text-white">
                          <th className="px-2 py-1.5 text-left font-semibold">BPSI ID</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Sum Insured</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Utilized</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Blocked</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Reserved</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-emerald-300">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bsiData.Suminsured.map((row, idx) => (
                          <tr
                            key={`bsi-${row.BPSIID}-${idx}`}
                            className={row.SICategery === 69 ? "bg-white font-semibold" : "bg-slate-50 text-slate-600"}
                          >
                            <td className="border-t border-slate-100 px-2 py-1.5">
                              {row.BPSIID}
                              {row.SICategery === 69 && <span className="ml-1 text-[9px] text-slate-400">base</span>}
                            </td>
                            <td className="border-t border-slate-100 px-2 py-1.5 text-right">{formatAmountValue(row.Suminsured)}</td>
                            <td className="border-t border-slate-100 px-2 py-1.5 text-right text-red-600">{formatAmountValue(row.Utilized)}</td>
                            <td className="border-t border-slate-100 px-2 py-1.5 text-right text-orange-600">{formatAmountValue(row.Blocked)}</td>
                            <td className="border-t border-slate-100 px-2 py-1.5 text-right text-amber-600">{formatAmountValue(row.Reserved)}</td>
                            <td className={`border-t border-slate-100 px-2 py-1.5 text-right font-bold ${row.EffectiveBalance <= 0 ? "text-red-600" : "text-emerald-700"}`}>
                              {formatAmountValue(row.EffectiveBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Effective balance highlight */}
                  {bsiBaseSI && (
                    <div className={`flex items-center justify-between rounded-md px-3 py-2 ${bsiEffectiveBalance !== null && bsiEffectiveBalance > 0 ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                      <span className="text-xs font-semibold text-slate-700">
                        Effective SI balance available for this claim
                      </span>
                      <span className={`text-sm font-bold ${bsiEffectiveBalance !== null && bsiEffectiveBalance > 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {formatDisplayAmount(bsiEffectiveBalance)}
                      </span>
                    </div>
                  )}

                  {/* Other benefits / sub-limits */}
                  {bsiData.OtherBenefits.length > 0 && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Other benefits / sub-limits
                      </div>
                      <div className="overflow-x-auto rounded-md border border-slate-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600">
                              <th className="px-2 py-1 text-left">BPSI ID</th>
                              <th className="px-2 py-1 text-right">Limit</th>
                              <th className="px-2 py-1 text-right">Utilized</th>
                              <th className="px-2 py-1 text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bsiData.OtherBenefits.map((ob, idx) => (
                              <tr key={`ob-${idx}`} className="border-t border-slate-100">
                                <td className="px-2 py-1">{ob.BPSIID}</td>
                                <td className="px-2 py-1 text-right">{formatAmountValue(ob.Suminsured)}</td>
                                <td className="px-2 py-1 text-right text-red-500">{formatAmountValue(ob.Utilized)}</td>
                                <td className="px-2 py-1 text-right font-semibold text-emerald-700">{formatAmountValue(ob.EffectiveBalance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Approvals */}
        <section className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">APPROVALS</h3>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-bold text-gray-900">Total Amount Approved</span>
              <div className="flex flex-col items-end gap-0.5">
                {bsiCapApplied && (
                  <span className="text-xs text-gray-400 line-through">{formatDisplayAmount(totalAmountApproved)}</span>
                )}
                <span className="text-sm font-bold text-gray-900">{formatDisplayAmount(bsiCappedPayable)}</span>
                {bsiCapApplied && (
                  <span className="text-[10px] font-medium text-amber-600">Capped by live SI balance</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Notes */}
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>NOTES</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="font-semibold text-gray-800">Applied Rule</div>
              <div className="text-gray-700 whitespace-pre-wrap">{formatAppliedRule(claimCalculation?.appliedRule)}</div>
            </div>
            <div>
              <div className="font-semibold text-gray-800">Tariff Notes</div>
              <div className="text-gray-700 whitespace-pre-wrap">{tariffNotes?.trim() ? tariffNotes : "—"}</div>
            </div>
            <div>
              <div className="font-semibold text-gray-800">Tariff Clarification Note</div>
              <div className="text-gray-700 whitespace-pre-wrap">{tariffClarificationNote?.trim() ? tariffClarificationNote : "—"}</div>
            </div>
            <div>
              <div className="font-semibold text-gray-800">Policy Wording Notes</div>
              <div className="text-gray-700 whitespace-pre-wrap">{finalInsurerPayableNotes?.trim() ? finalInsurerPayableNotes : "—"}</div>
            </div>
            {bsiCapApplied && bsiEffectiveBalance !== null && (
              <div>
                <div className="font-semibold text-amber-700">SI Balance Cap Applied</div>
                <div className="text-xs text-amber-600">
                  AI-calculated payable of {formatDisplayAmount(totalAmountApproved)} was
                  reduced to {formatDisplayAmount(bsiCappedPayable)} because the
                  member&apos;s effective SI balance ({formatDisplayAmount(bsiEffectiveBalance)})
                  is less than the approved amount.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

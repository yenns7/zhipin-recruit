import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import type { BiStaffMember } from '../../types';
import { Button, ErrorState, Spinner } from '../ui';
import { DataQualityWarningsPanel } from './DataQualityWarningsPanel';
import { StaffDrilldownHeader } from './StaffDrilldownHeader';
import { StaffFunnelPanel } from './StaffFunnelPanel';
import { StaffKpiGrid } from './StaffKpiGrid';
import { safeNum } from './biMetrics';

interface StaffDrilldownProps {
  hrId: number;
  days: number;
  staffMember: BiStaffMember | null;
  teamAvgConv: number | null;
  onBack: () => void;
}

export function StaffDrilldown({
  hrId,
  days,
  staffMember,
  teamAvgConv,
  onBack,
}: StaffDrilldownProps) {
  const { data, loading, error, reload } = useAsync(
    () => api.biStaff(hrId, days),
    [hrId, days],
  );

  const name = staffMember?.name ?? `专员 #${hrId}`;
  const conv = staffMember ? safeNum(staffMember.conversion_rate) : null;

  return (
    <div className="animate-fade-in space-y-6">
      <StaffDrilldownHeader
        name={name}
        days={days}
        conversionRate={conv}
        teamAvgConv={teamAvgConv}
        onBack={onBack}
      />

      {staffMember && <StaffKpiGrid staffMember={staffMember} />}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <ErrorState message={error.message} onRetry={reload} />
      )}

      {!loading && !error && (
        <DataQualityWarningsPanel warnings={data?.data_quality_warnings ?? []} />
      )}

      {!loading && !error && data && <StaffFunnelPanel funnel={data.funnel} />}

      <div className="pt-2">
        <Button variant="secondary" size="sm" onClick={onBack}>
          ← 返回团队总览
        </Button>
      </div>
    </div>
  );
}

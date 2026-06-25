type TalentMapOption = {
  id: number;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function resolveActiveTalentMapId(
  maps: readonly TalentMapOption[],
  activeMapId: unknown,
): number | null {
  if (maps.length === 0) return null;

  if (isPositiveInteger(activeMapId) && maps.some((item) => item.id === activeMapId)) {
    return activeMapId;
  }

  return maps[0].id;
}

export function parseTalentMapSelectValue(value: string): number | null {
  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : null;
}

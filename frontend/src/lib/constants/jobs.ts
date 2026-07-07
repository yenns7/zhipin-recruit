export const COMMON_JOB_DEPARTMENT_OPTIONS = [
  '技术研发部',
  '产品部',
  '数据部',
  '设计部',
  '测试部',
  '财务总部',
  '人力资源部',
  '市场部',
  '销售部',
  '运营部',
  '客服部',
] as const;

export function mergePresetOptions(presets: readonly string[], dynamicValues: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of [
    ...presets,
    ...dynamicValues.filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN')),
  ]) {
    if (seen.has(value)) continue;
    result.push(value);
    seen.add(value);
  }

  return result;
}

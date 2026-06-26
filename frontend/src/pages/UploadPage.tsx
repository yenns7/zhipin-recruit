// 简历上传页面（HR 操作视角）— 拖拽或点击选择 PDF/DOCX 文件或 ZIP 压缩包，支持批量上传。
// 调用 api.uploadResumes(files) → 一次性 POST 多文件，后端同步解析（zip 自动解压逐份解析）。
// 展示已选文件列表、上传/解析进度、以及每条结果（含 zip 展开的多条）。

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
  ErrorState,
  Input,
  Select,
} from '../components/ui';
import { RESUME_SOURCE_CHANNEL_OPTIONS } from '../lib/sourceChannels';
import type { ResumeUploadResultItem } from '../types';

const ACCEPTED = ['.pdf', '.docx', '.zip'];
const ACCEPT_MIME =
  'application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/zip,application/x-zip-compressed,.zip,.pdf,.docx';

function isAccepted(file: File): boolean {
  return ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function isZip(name: string): boolean {
  return name.toLowerCase().endsWith('.zip');
}

// 友好的文件大小展示
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// 文档图标（pdf/docx）
function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M8.5 13h7M8.5 16.5h7" />
    </svg>
  );
}

// 压缩包图标（zip）
function ZipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3v2m0 2v2m0 2v2m1-9v2m-1 2h1m-1 4h1m-1-2h-1m1-4h-1" />
    </svg>
  );
}

export function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ResumeUploadResultItem[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceChannel, setSourceChannel] = useState('');
  const [customSourceChannel, setCustomSourceChannel] = useState('');
  const [referrer, setReferrer] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // 计数器追踪 drag 状态，防止指针移过子元素时闪烁
  const dragCounter = useRef(0);

  function mergeFiles(incoming: File[]) {
    const accepted = incoming.filter(isAccepted);
    setSelectedFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const newOnes = accepted.filter((f) => !names.has(f.name));
      return [...prev, ...newOnes];
    });
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    mergeFiles(Array.from(e.target.files ?? []));
    // 重置，允许重复选择同一文件
    e.target.value = '';
  }

  function handleDragEnter(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDragOver(true);
  }

  function handleDragOver(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    mergeFiles(Array.from(e.dataTransfer.files));
  }

  function removeFile(name: string) {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function reset() {
    setSelectedFiles([]);
    setResults(null);
    setUploadError(null);
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setResults(null);
    const resolvedSourceChannel =
      sourceChannel === '其他' ? customSourceChannel.trim() : sourceChannel.trim();
    try {
      const res = await api.uploadResumes(selectedFiles, {
        source_channel: resolvedSourceChannel,
        referrer: referrer.trim(),
        source_note: sourceNote.trim(),
      });
      setResults(res.results);
      setSelectedFiles([]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  const hasFiles = selectedFiles.length > 0;
  const canUpload = hasFiles && !uploading;
  const zipCount = useMemo(() => selectedFiles.filter((f) => isZip(f.name)).length, [selectedFiles]);

  // 结果汇总：成功 / 失败 / 跳过
  const summary = useMemo(() => {
    if (!results) return null;
    return results.reduce(
      (acc, r) => {
        if (r.status === 'ok') acc.ok += 1;
        else if (r.status === 'skipped') acc.skipped += 1;
        else acc.error += 1;
        return acc;
      },
      { ok: 0, skipped: 0, error: 0 }
    );
  }, [results]);

  return (
    <div>
      {/* 页头 */}
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-display text-ink">简历上传</h1>
        <p className="text-sm text-muted">
          拖拽或选择 PDF / DOCX 简历，或上传 ZIP 压缩包批量导入，AI 自动解析并提取技能标签。
        </p>
      </div>

      {/* 上传设置：只负责把简历保存到简历库，岗位分配在简历库完成 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>上传后会保存到简历库</CardTitle>
              <p className="mt-1 text-xs text-muted-soft">
                后续可在简历库筛选后再加入招聘需求流程
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSourceOpen((v) => !v)}
            >
              {sourceOpen ? '收起选填信息' : '来源信息（选填）'}
            </Button>
          </div>
        </CardHeader>
        {sourceOpen && (
          <CardBody className="border-t border-hairline">
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="候选人来源"
                name="source_channel"
                value={sourceChannel}
                onChange={(e) => {
                  setSourceChannel(e.target.value);
                  if (e.target.value !== '其他') setCustomSourceChannel('');
                }}
              >
                <option value="">请选择来源渠道</option>
                {RESUME_SOURCE_CHANNEL_OPTIONS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </Select>
              {sourceChannel === '其他' && (
                <Input
                  label="自定义来源"
                  name="custom_source_channel"
                  placeholder="填写其他渠道名称"
                  value={customSourceChannel}
                  onChange={(e) => setCustomSourceChannel(e.target.value)}
                />
              )}
              <Input
                label="内推人 / 猎头联系人（选填）"
                name="referrer"
                placeholder="例如：张三、某猎头顾问"
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-muted-soft">
              用于后续统计哪个渠道更有效，不确定可以先不填。
            </p>
            <label className="mt-3 block text-xs font-medium text-muted" htmlFor="source_note">
              本次上传备注（选填）
            </label>
            <textarea
              id="source_note"
              className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              rows={2}
              placeholder="例如搜索关键词、沟通背景、批次说明"
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
            />
          </CardBody>
        )}
      </Card>

      {/* 拖拽上传区 */}
      <Card className="mb-6">
        <CardBody className="p-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={[
              'flex w-full flex-col items-center justify-center rounded-xl px-6 py-14 text-center transition-colors',
              dragOver
                ? 'border-2 border-dashed border-ink bg-surface-soft'
                : 'border-2 border-dashed border-hairline hover:border-brand-400 hover:bg-surface-soft',
            ].join(' ')}
            aria-label="点击或拖拽文件到此处上传简历"
          >
            <svg
              className={['mb-3 h-10 w-10', dragOver ? 'text-ink' : 'text-muted-soft'].join(' ')}
              fill="none"
              viewBox="0 0 48 48"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M28 4H12a4 4 0 0 0-4 4v32a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V20L28 4z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M28 4v16h16" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M24 34v-8m0 0-3 3m3-3 3 3" />
            </svg>
            <p className="text-sm font-medium text-ink">
              拖拽简历文件到此处，或{' '}
              <span className="underline decoration-dotted underline-offset-2">点击选择</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              支持 PDF / DOCX 简历，或上传 ZIP 压缩包批量导入，可一次选择多个文件
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_MIME}
            multiple
            className="hidden"
            onChange={handleInputChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </CardBody>
      </Card>

      {/* 提示信息 */}
      <div className="mb-6 rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-xs text-muted">
        <ul className="space-y-1">
          <li>· 上传成功后先进入简历库，后续可按城市、技能、来源筛选后再加入招聘需求流程。</li>
          <li>· 支持格式：PDF、Word（.docx）以及 ZIP 压缩包；旧版 .doc 存在宏风险，请先转换。</li>
          <li>· ZIP 压缩包会自动解压，逐份解析其中的简历（自动跳过非简历文件）。</li>
          <li>· 简历解析由 AI 完成，文件较多或较大时可能需要一些时间，请耐心等待。</li>
          <li>· 个别文件解析失败不影响其他文件，可针对失败项重新上传。</li>
        </ul>
      </div>

      {/* 已选文件列表（上传前） */}
      {hasFiles && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              已选文件（{selectedFiles.length}
              {zipCount > 0 ? `，含 ${zipCount} 个压缩包` : ''}）
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <ul role="list">
              {selectedFiles.map((f, i) => {
                const zip = isZip(f.name);
                return (
                  <li
                    key={f.name}
                    className={[
                      'flex items-center justify-between gap-4 px-5 py-3 text-sm',
                      i < selectedFiles.length - 1 ? 'border-b border-hairline' : '',
                    ].join(' ')}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {zip ? (
                        <ZipIcon className="h-5 w-5 shrink-0 text-muted" />
                      ) : (
                        <DocIcon className="h-5 w-5 shrink-0 text-muted" />
                      )}
                      <span className="truncate text-ink">{f.name}</span>
                      {zip && <Badge tone="brand">压缩包</Badge>}
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-xs text-muted-soft">{formatSize(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.name)}
                        className="text-xs text-muted hover:text-danger-600"
                        aria-label={`移除 ${f.name}`}
                      >
                        移除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* 操作按钮 */}
      {hasFiles && (
        <div className="mb-6 flex items-center gap-3">
          <Button onClick={handleUpload} loading={uploading} disabled={!canUpload}>
            {uploading ? '正在上传并解析…' : `开始上传（${selectedFiles.length} 个文件）`}
          </Button>
          {!uploading && (
            <Button variant="secondary" onClick={reset}>
              清空
            </Button>
          )}
        </div>
      )}

      {/* 上传中状态 */}
      {uploading && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-surface-soft px-4 py-3 text-sm text-body">
          <Spinner size="sm" />
          <span>
            正在上传并解析 {selectedFiles.length} 个文件
            {zipCount > 0 ? '（含压缩包）' : ''}，请稍候…
          </span>
        </div>
      )}

      {/* 上传错误 */}
      {uploadError && (
        <div className="mb-6">
          <ErrorState message={uploadError} onRetry={handleUpload} />
        </div>
      )}

      {/* 上传结果 */}
      {results !== null && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>上传结果</CardTitle>
              <Button variant="secondary" size="sm" onClick={reset}>
                继续上传
              </Button>
            </div>
            {/* 汇总统计 */}
	            {summary && (
	              <div className="mt-3 flex flex-wrap items-center gap-2">
	                <Badge tone="success">成功 {summary.ok}</Badge>
                {summary.skipped > 0 && <Badge tone="warning">跳过 {summary.skipped}</Badge>}
                {summary.error > 0 && <Badge tone="danger">失败 {summary.error}</Badge>}
	                <span className="text-xs text-muted-soft">共 {results.length} 条</span>
	              </div>
	            )}
          </CardHeader>
          <CardBody className="p-0">
            {results.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-soft">没有可处理的文件</p>
            ) : (
              <ul role="list">
                {results.map((r, i) => {
                  return (
                    <li
                      key={`${r.file}-${i}`}
                      className={[
                        'flex items-start justify-between gap-4 px-5 py-3.5',
                        i < results.length - 1 ? 'border-b border-hairline' : '',
                      ].join(' ')}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={[
                            'truncate text-sm font-medium',
                            r.status === 'error' ? 'text-danger-700' : r.status === 'skipped' ? 'text-muted' : 'text-ink',
                          ].join(' ')}
                        >
                          {r.file}
                        </p>
                        {r.reason && <p className="mt-0.5 text-xs text-muted">{r.reason}</p>}
                      </div>
                      <div className="shrink-0">
                        {r.status === 'ok' && r.candidate_id != null ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Badge tone="success">解析成功</Badge>
                            <Badge tone="neutral">已入简历库</Badge>
                            <Link
                              to={`/candidates/${r.candidate_id}`}
                              className="text-xs font-medium text-ink hover:underline"
                            >
                              查看档案
                            </Link>
                            <Link
                              to="/candidates"
                              className="text-xs font-medium text-ink hover:underline"
                            >
                              去简历库分配岗位
                            </Link>
                          </div>
                        ) : r.status === 'skipped' ? (
                          <Badge tone="warning">已跳过</Badge>
                        ) : (
                          <Badge tone="danger">解析失败</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

const QN_LABEL_KEYS: Record<number, string> = {
  80: 'qualitySmooth',
  150: 'qualityHigh',
  250: 'qualitySuper',
  400: 'qualityBluRay',
  10000: 'qualityOriginal',
  20000: 'quality4k',
  30000: 'qualityDolby',
}

const STREAM_FORMAT_LABELS: Record<string, string> = {
  flv: 'FLV',
  fmp4: 'FMP4',
  ts: 'TS',
}

export function getRecordQualityLabelKey(qn: number | undefined): string | undefined {
  if (qn === undefined || qn <= 0) {
    return undefined
  }
  return QN_LABEL_KEYS[qn]
}

export function getRecordStreamFormatLabel(
  format: string | undefined,
): string | undefined {
  if (!format) {
    return undefined
  }
  return STREAM_FORMAT_LABELS[format]
}

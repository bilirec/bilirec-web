const QN_LABEL_KEYS: Record<number, string> = {
  80: 'qualitySmooth',
  150: 'qualityHigh',
  250: 'qualitySuper',
  400: 'qualityBluRay',
  10000: 'qualityOriginal',
  20000: 'quality4k',
  30000: 'qualityDolby',
}

export function getRecordQualityLabelKey(qn: number | undefined): string | undefined {
  if (qn === undefined || qn <= 0) {
    return undefined
  }
  return QN_LABEL_KEYS[qn]
}

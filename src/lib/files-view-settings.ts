const ONLY_MEDIA_KEY = 'bilirec.files.onlyMedia'

export function loadOnlyMediaFiles(): boolean {
  try {
    const raw = localStorage.getItem(ONLY_MEDIA_KEY)
    if (raw === null) return false
    return raw === 'true'
  } catch {
    return false
  }
}

export function saveOnlyMediaFiles(value: boolean): void {
  try {
    localStorage.setItem(ONLY_MEDIA_KEY, String(value))
  } catch {
    // private mode / quota
  }
}

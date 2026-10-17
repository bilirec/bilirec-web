import axios, { AxiosInstance, isAxiosError } from "axios";
import type {
  LoginRequest,
  PresignedMediaUrl,
  RecordTask,
  StartRecordRequest,
  RecordInfo,
  ConvertQueue,
  ShareFileInfo,
  RoomInfo,
  RoomConfig,
  SubscriptionStatus,
  SubscribedRooms,
  DiskUsage,
  LoginResponse,
  UpdateRoomConfigRequest,
  WebPushPublicKeyResponse,
  WebPushSubscriptionRequest,
  WebPushUnsubscribeRequest,
  RecordFileListResponse,
  RecordStatus,
  RecorderStats,
  BilibiliAuthStatus,
  BilibiliAuthInitResponse,
  ServerVersionResult
} from "./types";
import { sharedStore } from "./shared-store";
import {
  BackendUnreachableError,
  isLoginResponse,
  isMissingVersionEndpoint,
  isRoomIdList,
  isServerVersionResult
} from "./backend";
import { danmakuSidecarCandidatesForVideo } from "./utils";

/** Encode each path segment for /files/* routes. */
export function encodeFilePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

class ApiClient {
  private client: AxiosInstance;
  private baseURL: string = "";
  private unauthorizedSuppressed = 0;

  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        "Content-Type": "application/json"
      },
      // Send cookies for cross-origin requests (server must set cookie with HttpOnly)
      withCredentials: true
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Only 401 clears the app session. Bilirec uses 403 for RBAC (e.g. viewer on admin routes).
        if (this.unauthorizedSuppressed === 0 && error.response?.status === 401) {
          window.dispatchEvent(new Event("api:unauthorized"));
        }
        return Promise.reject(error);
      }
    );
  }

  async runWithoutUnauthorizedEvent<T>(fn: () => Promise<T>): Promise<T> {
    this.unauthorizedSuppressed += 1;
    try {
      return await fn();
    } finally {
      this.unauthorizedSuppressed -= 1;
    }
  }

  setBaseURL(url: string) {
    const trimmed = url.trim();
    this.baseURL = trimmed;
    this.client.defaults.baseURL = trimmed;
    // Persist to IndexedDB so the service worker can use the correct origin for push endpoints
    sharedStore.set("server-url", trimmed).catch(() => {});
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  /** Absolute origin without trailing slash (empty when same-origin / relative). */
  private originBase(): string {
    return this.baseURL ? this.baseURL.replace(/\/$/, "") : "";
  }

  getPlaybackUrl(path: string): string {
    return `${this.originBase()}/files/playback/${encodeFilePath(path)}`;
  }

  getDanmakuUrl(path: string): string {
    return `${this.originBase()}/files/danmaku/${encodeFilePath(path)}`;
  }

  // Token is handled by an HttpOnly cookie set by the server. We don't store it client-side.

  clearAuth() {
    // no-op for cookie auth; server must clear cookie on logout
  }

  async login(data: LoginRequest): Promise<LoginResponse | null> {
    try {
      // withCredentials:true makes browser include cookies and accept Set-Cookie from server
      const response = await this.client.post("/login", data);
      return isLoginResponse(response.data) ? response.data : null;
    } catch (error) {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.post("/logout");
    } catch (error) {
      console.warn("Logout request failed:", error);
    }
  }

  // Server returns an array of room IDs at /record/list per swagger.
  async getRecords(): Promise<number[]> {
    const response = await this.client.get<number[]>("/record/list");
    if (!isRoomIdList(response.data)) {
      throw new BackendUnreachableError();
    }
    return response.data;
  }

  /**
   * Confirms the configured URL is a working bilirec API before treating the
   * session as authenticated. GET /version fingerprints the backend; GET
   * /record/list proves the session can call a protected JSON endpoint.
   * Older builds without /version are accepted if /record/list is a number[].
   */
  async probeBackend(): Promise<ServerVersionResult | null> {
    return this.runWithoutUnauthorizedEvent(async () => {
      let version: ServerVersionResult | null = null;
      try {
        version = await this.getVersion();
      } catch (error) {
        if (!isMissingVersionEndpoint(error)) {
          throw error;
        }
      }
      await this.getRecords();
      return version;
    });
  }

  async getRecordStats(roomIds: number[]): Promise<Record<string, RecorderStats>> {
    const uniqueRoomIds = Array.from(new Set(roomIds.filter((id) => Number.isFinite(id))));
    if (uniqueRoomIds.length === 0) {
      return {};
    }
    const response = await this.client.post<Record<string, RecorderStats> | { stats: Record<string, RecorderStats> }>(`/record/stats`, { room_ids: uniqueRoomIds });
    if (this.isRecordStatsWithField(response.data)) {
      return response.data.stats ?? {};
    } else {
      return response.data ?? {};
    }
  }

  isRecordStatsWithField(data: Record<string, RecorderStats> | { stats: Record<string, RecorderStats> }): data is { stats: Record<string, RecorderStats> } {
    return "stats" in data;
  }

  async getRecordTasks(): Promise<RecordTask[]> {
    const ids = await this.getRecords();

    // Fetch all statuses and stats in parallel
    const [statuses, stats] = await Promise.all([
      this.getRecordStatuses(ids),
      this.getRecordStats(ids)
    ]);

    // Combine statuses and stats into RecordTask objects
    const tasks = ids.map((id) => {
      const status = statuses[id.toString()] ?? "idle";
      const roomStats = stats[id.toString()];
      return {
        roomId: id,
        status,
        fileSize: roomStats?.bytes_written,
        bytesRead: roomStats?.bytes_read,
        recordDanmaku: roomStats?.record_danmaku,
        danmakuFileSize: roomStats?.danmaku_bytes_written,
        recordedTime: roomStats?.elapsed_seconds,
        startTime: roomStats?.start_time,
        actualQn: roomStats?.actual_qn,
        actualStreamFormat: roomStats?.actual_stream_format,
        isAudioOnly: roomStats?.is_audio_only,
        sessionTitle: roomStats?.room_title,
      } as RecordTask;
    });

    return tasks;
  }

  async startRecord(data: StartRecordRequest): Promise<void> {
    const roomId = data.roomId;
    const params: Record<string, number | boolean | string> = {};
    if (data.durationMinutes !== undefined) {
      params.duration_minutes = data.durationMinutes;
    }
    if (data.qn !== undefined) {
      params.qn = data.qn;
    }
    if (data.onlyAudio) {
      params.only_audio = true;
    }
    if (data.recordDanmaku) {
      params.record_danmaku = true;
    }
    if (data.deleteOldestOnLowDisk) {
      params.delete_oldest_on_low_disk = true;
    }
    if (data.streamProfiles?.length) {
      params.stream_profile = data.streamProfiles.join(',')
    }
    // undefined omits the request body; null would send the literal "null" (HasBody true).
    await this.client.post(`/record/${roomId}/start`, undefined, { params });
  }

  async stopRecord(roomId: number): Promise<void> {
    await this.client.post(`/record/${roomId}/stop`, {});
  }

  async getFiles(
    path: string = "",
    offset: number = 0,
    limit: number = 200,
    search: string = "",
    onlyMedia: boolean = false,
  ): Promise<RecordFileListResponse> {
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    const url = encodedPath ? `/files/browse/${encodedPath}` : "/files/browse";
    const params: { offset: number; limit: number; search: string; only_media?: boolean } = {
      offset,
      limit,
      search,
    };
    if (onlyMedia) {
      params.only_media = true;
    }
    const response = await this.client.get<RecordFileListResponse>(url, { params });
    return response.data;
  }

  /**
   * Request a URL and stream the response, reporting progress.
   * Supports arbitrary HTTP methods and optional request body.
   */
  public async requestAsStream(
    method: string,
    urlPath: string,
    options?: { body?: any; onProgress?: (loaded: number, total?: number) => void; signal?: AbortSignal }
  ): Promise<Blob> {
    const requestUrl = (this.baseURL ? this.baseURL.replace(/\/$/, "") : "") + urlPath;

    const init: RequestInit = {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    };

    if (options?.signal) init.signal = options.signal;

    // Only set a JSON body for non-GET requests
    if (method.toUpperCase() !== "GET" && options?.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(requestUrl, init);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const contentLength = res.headers.get("content-length");
    const total = contentLength ? Number(contentLength) : undefined;

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Readable stream not supported by the environment");

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        try {
          options?.onProgress?.(received, total);
        } catch (e) {
          // ignore errors from user-provided progress callback
        }
      }
    }

    // Convert each Uint8Array into an ArrayBuffer of the exact bytes to satisfy type checks
    const parts = chunks.map((c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength));
    // Normalize buffers to concrete ArrayBuffer copies to avoid SharedArrayBuffer in some environments
    const normalized = parts.map((buf) => {
      const u = new Uint8Array(buf as ArrayBuffer);
      return u.slice().buffer;
    });
    return new Blob(normalized);
  }


  async downloadFile(
    path: string,
    _options?: { onProgress?: (loaded: number, total?: number) => void; signal?: AbortSignal; suggestedName?: string }
  ): Promise<void> {
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    // Prefer a presigned download URL so retries and external download
    // managers can replay the link without cookies. Older backends reply
    // with a tempdownload link (or 404) and we fall back to the cookie URL.
    let url: string;
    try {
      const minted = await this.mintPresignedMediaUrl(path, "download");
      url = minted?.url ?? `${this.originBase()}/files/download/${encodedPath}`;
    } catch {
      url = `${this.originBase()}/files/download/${encodedPath}`;
    }

    // Use an in-page anchor click so the download is handled in the same tab.
    try {
      const a = document.createElement('a')
      a.href = url
      // `download` is a hint; if the browser ignores it the resource will open/navigate in the same tab
      a.download = (_options?.suggestedName ?? path.split("/").pop() ?? '')
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      // propagate error so callers can show an appropriate message
      throw e
    }

    return
  }

  async deleteFiles(paths: string[]): Promise<void> {
    // Swagger: DELETE /files/batch with body = array of paths
    await this.client.delete("/files/batch", { data: paths });
    return;
  }

  /**
   * Resolve paired danmaku sidecar path via HEAD /files/danmaku (session cookie).
   * Do not use /files/download — that route requires a presigned token only.
   */
  async findDanmakuSidecarPath(videoPath: string): Promise<string | null> {
    const encodedVideo = encodeFilePath(videoPath);
    try {
      const response = await this.client.head(`/files/danmaku/${encodedVideo}`);
      const cd = response.headers["content-disposition"];
      const disposition = typeof cd === "string" ? cd : undefined;
      const match = disposition?.match(/filename="([^"]+)"/i);
      const basename = match?.[1];
      if (basename) {
        const slash = videoPath.lastIndexOf("/");
        const dir = slash >= 0 ? videoPath.slice(0, slash + 1) : "";
        return `${dir}${basename}`;
      }
      return danmakuSidecarCandidatesForVideo(videoPath)[0] ?? null;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      return null;
    }
  }

  async shareFile(path: string, ttl: number = 3600): Promise<ShareFileInfo> {
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    const url = `/files/presigned/${encodedPath}`;
    const response = await this.client.post<ShareFileInfo>(url, undefined, {
      params: { ttl, purpose: "share" }
    });
    return response.data;
  }

  /** Prefix relative API URLs with the configured API origin. */
  resolveMediaUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    return this.originBase() + url;
  }

  /**
   * Mint a presigned media URL via POST /files/presigned.
   * Returns null when the backend predates the `purpose` parameter (it
   * replies with a /files/tempdownload link) or lacks the endpoint entirely;
   * callers then fall back to cookie-authenticated media URLs. Path errors
   * (400) and expired sessions (401) are rethrown.
   */
  async mintPresignedMediaUrl(
    path: string,
    purpose: "playback" | "download",
    ttl: number = 86400
  ): Promise<PresignedMediaUrl | null> {
    let info: ShareFileInfo;
    try {
      const encodedPath = encodeFilePath(path);
      const response = await this.client.post<ShareFileInfo>(`/files/presigned/${encodedPath}`, undefined, {
        params: { ttl, purpose }
      });
      info = response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return null; // mint endpoint missing on old backends
      }
      throw error;
    }
    const rawUrl = info?.url;
    if (typeof rawUrl !== "string" || rawUrl === "") return null;
    // Old backends ignore `purpose` and answer with a tempdownload link.
    const parsed = new URL(rawUrl, window.location.href);
    const expectedPrefix = purpose === "playback" ? "/files/playback/" : "/files/download/";
    if (!parsed.pathname.startsWith(expectedPrefix)) return null;
    const expiresIn = Number(info.expires_in);
    return {
      url: this.resolveMediaUrl(rawUrl),
      expiresAtMs: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 0)
    };
  }

  /**
   * Mint a presigned playback URL for <video src>; null means the backend
   * does not support presigned playback and getPlaybackUrl should be used.
   */
  async mintPlaybackUrl(path: string, ttl: number = 86400): Promise<PresignedMediaUrl | null> {
    return this.mintPresignedMediaUrl(path, "playback", ttl);
  }

  async deleteDir(path: string): Promise<void> {
    // Encode each segment to avoid issues with slashes or special characters in path
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    const url = `/files/${encodedPath}`;
    await this.client.delete(url);
    return;
  }

  async getConvertTasks(): Promise<ConvertQueue[]> {
    const response = await this.client.get<ConvertQueue[]>("/convert/tasks");
    return response.data;
  }
  
  async enqueueConvertTask(path: string, deleteSource: boolean = false, format?: string): Promise<ConvertQueue> {
    const encodedPath = path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    const params: any = { delete: deleteSource };
    if (format) params.format = format;
    const response = await this.client.post<ConvertQueue>(`/convert/tasks/${encodedPath}`, {}, { params });
    return response.data;
  }

  async deleteConvertTask(taskId: string): Promise<void> {
    await this.client.delete(`/convert/tasks/${encodeURIComponent(taskId)}`);
  }

  // Room info methods
  async getRoomInfo(roomId: number): Promise<RoomInfo> {
    const response = await this.client.get<RoomInfo>(`/room/${roomId}/info`, {
      timeout: 15_000,
    });
    return response.data;
  }

  async getRoomInfos(roomIds: number[]): Promise<Record<string, RoomInfo>> {
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return {};
    }
    const uniqueRoomIds = Array.from(new Set(roomIds.filter((id) => Number.isFinite(id))));
    const response = await this.client.post<Record<string, RoomInfo>>(`/room/infos`, { room_ids: uniqueRoomIds });
    return response.data ?? {};
  }

  async getRecordStatus(roomId: number): Promise<RecordInfo> {
    const response = await this.client.get<RecordInfo>(`/record/${roomId}/status`);
    return response.data;
  }

  async getRecordStatuses(roomIds: number[]): Promise<Record<string, RecordStatus>> {
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return {};
    }
    const uniqueRoomIds = Array.from(new Set(roomIds.filter((id) => Number.isFinite(id))));
    const response = await this.client.post<Record<string, RecordStatus> | { statuses: Record<string, RecordStatus> }>(`/record/statuses`, { room_ids: uniqueRoomIds });
    if (this.isRecordStatusWithField(response.data)) {
      return response.data.statuses ?? {};
    } else {
      return response.data ?? {};
    }
  }

  isRecordStatusWithField(data: Record<string, RecordStatus> | { statuses: Record<string, RecordStatus> }): data is { statuses: Record<string, RecordStatus> } {
    return "statuses" in data;
  }

  // Room subscription methods
  async subscribeRoom(roomId: number): Promise<void> {
    await this.client.post(`/room/${roomId}`);
  }

  async unsubscribeRoom(roomId: number): Promise<void> {
    await this.client.delete(`/room/${roomId}`);
  }

  async checkSubscription(roomId: number): Promise<SubscriptionStatus> {
    const response = await this.client.get<SubscriptionStatus>(`/room/subscribe/${roomId}`);
    return response.data;
  }

  async getSubscribedRooms(): Promise<number[]> {
    const response = await this.client.get<SubscribedRooms>('/room/subscribe');
    return response.data.room_ids ?? [];
  }

  async getAutoRecordRooms(): Promise<number[]> {
    const response = await this.client.get<SubscribedRooms>('/room/subscribe/auto-record');
    return response.data.room_ids ?? [];
  }

  async getDiskUsage(): Promise<DiskUsage> {
    const response = await this.client.get<DiskUsage>('/files/disk-space');
    return response.data;
  }

  async getRoomConfig(roomId: number): Promise<RoomConfig> {
    const response = await this.client.get<RoomConfig>(`/room/${roomId}/config`);
    return response.data;
  }

  async updateRoomConfig(roomId: number, data: UpdateRoomConfigRequest): Promise<RoomConfig> {
    const response = await this.client.put<RoomConfig>(`/room/${roomId}/config`, data);
    return response.data;
  }

  async getWebPushPublicKey(): Promise<WebPushPublicKeyResponse> {
    const response = await this.client.get<WebPushPublicKeyResponse>('/notify/public-key');
    return response.data;
  }

  async registerWebPushSubscription(data: WebPushSubscriptionRequest): Promise<void> {
    await this.client.post('/notify/subscribe', data);
  }

  async removeWebPushSubscription(data: WebPushUnsubscribeRequest): Promise<void> {
    await this.client.delete('/notify/subscribe', { data });
  }

  async getBilibiliAuthStatus(): Promise<BilibiliAuthStatus> {
    const response = await this.client.get<BilibiliAuthStatus>('/auth/bilibili/status');
    return response.data;
  }

  async initBilibiliAuth(): Promise<BilibiliAuthInitResponse> {
    const response = await this.client.post<BilibiliAuthInitResponse>('/auth/bilibili/init');
    return response.data;
  }

  async getVersion(): Promise<ServerVersionResult> {
    const response = await this.client.get<ServerVersionResult>("/version");
    if (!isServerVersionResult(response.data)) {
      throw new BackendUnreachableError();
    }
    return response.data;
  }

  async checkVersion(): Promise<ServerVersionResult> {
    const response = await this.client.post<ServerVersionResult>("/version/check");
    return response.data;
  }

}

export function parseVersionError(err: unknown): ServerVersionResult | null {
  if (!isAxiosError(err)) {
    return null;
  }
  const data = err.response?.data;
  if (data && typeof data === "object" && "current" in data) {
    return data as ServerVersionResult;
  }
  return null;
}

export const apiClient = new ApiClient();

import { useEffect, useRef, useState, type RefObject } from "react"
import { useVideoPlaybackTime } from "@/hooks/use-video-playback-time"
import type { OverlayEvent } from "@/lib/danmaku"

const SC_FALLBACK_SEC = 4.5
const GUARD_LIFE_SEC = 10
const GIFT_LIFE_SEC = 3
/** Exit animation length in wall-clock ms (CSS-driven, rate-independent). */
const EXIT_MS = 280
/** Visible hang-lane cap; the overflow parks until a slot frees up. */
const MAX_HANG = 3
/** Lower lane: one shared pool of slot units. Guards permanently claim
 *  GUARD_SLOT_UNITS units each (a guard card is about two toast lines tall);
 *  gifts only ever use whatever units are left, so the lane height stays
 *  constant regardless of the guard/gift mix. */
const MAX_TOAST = 5
const GUARD_SLOT_UNITS = 2

function lifeSecFor(ev: OverlayEvent): number {
  if (ev.kind === "gift") return GIFT_LIFE_SEC
  if (ev.kind === "guard") return GUARD_LIFE_SEC
  // super_chat: JSONL `time` is bilibili hang duration in seconds
  if (ev.lifeSec != null && ev.lifeSec > 0) return ev.lifeSec
  return SC_FALLBACK_SEC
}

export interface ActiveItem {
  event: OverlayEvent
  /** Video-time seconds when the event entered the overlay. */
  startAtSec: number
  /** Video-time seconds at which the item should start its exit animation. */
  hideAtSec: number
  /** Wall-clock ms at which to remove the DOM after entering exit. Undefined until exiting. */
  removeAtWall?: number
  exiting: boolean
}

function activate(ev: OverlayEvent, videoSec: number, startAtSec = videoSec): ActiveItem {
  return {
    event: ev,
    startAtSec,
    hideAtSec: startAtSec + lifeSecFor(ev),
    exiting: false,
  }
}

/** Remaining TTL as 0..1, for the card countdown bar. */
export function remainingRatio(item: ActiveItem, videoSec: number): number {
  const duration = item.hideAtSec - item.startAtSec
  if (duration <= 0) return 0
  return Math.max(0, Math.min(1, (item.hideAtSec - videoSec) / duration))
}

function pruneActive(items: ActiveItem[], videoSec: number, wallMs: number): ActiveItem[] {
  let changed = false
  const next: ActiveItem[] = []
  for (const item of items) {
    if (item.exiting) {
      if (item.removeAtWall != null && wallMs >= item.removeAtWall) {
        changed = true
        continue
      }
      next.push(item)
      continue
    }
    if (videoSec >= item.hideAtSec) {
      changed = true
      next.push({ ...item, exiting: true, removeAtWall: wallMs + EXIT_MS })
      continue
    }
    next.push(item)
  }
  return changed ? next : items
}

/** Hang lane beyond its visible cap: active cards on screen + parked cards that
 *  were evicted but still within TTL (restored when a slot frees up). */
interface HangLaneState {
  active: ActiveItem[]
  parked: ActiveItem[]
}

/** Lower lane: guards and gifts share one pool of MAX_TOAST slot units. Each
 *  guard claims GUARD_SLOT_UNITS units (about two toast lines tall) until its
 *  TTL expires, using the guard-vs-guard SC settle mechanics; gifts only ever
 *  occupy the leftover units. */
interface LowerLaneState {
  guards: HangLaneState
  gifts: ActiveItem[]
}

/** Lane priority: SC by price; guards by bilibili tier price (总督 19999 >
 *  提督 1999 > 舰长 198) so guard-vs-guard reuses the same ordering mechanics.
 *  Gifts never enter priority lanes. */
const GUARD_TIER_PRICE = [198, 1999, 19999]
function hangPriority(ev: OverlayEvent): number {
  if (ev.kind === "super_chat") return ev.price ?? 0
  if (ev.kind === "guard") {
    const level = ev.level ?? 1
    return GUARD_TIER_PRICE[Math.min(3, Math.max(1, level)) - 1] ?? 0
  }
  return 0
}

/** Order the lane by priority; ties keep arrival order with the OLDEST card on
 *  top (deterministic regardless of parking/restoring history). Returns the
 *  same array reference when already ordered, so per-frame settle calls do not
 *  trigger pointless re-renders. */
function orderHangLane(active: ActiveItem[]): ActiveItem[] {
  let ordered = true
  for (let i = 1; i < active.length; i += 1) {
    const prevPriority = hangPriority(active[i - 1].event)
    const curPriority = hangPriority(active[i].event)
    if (
      prevPriority < curPriority ||
      (prevPriority === curPriority &&
        active[i - 1].startAtSec > active[i].startAtSec)
    ) {
      ordered = false
      break
    }
  }
  if (ordered) return active
  return [...active].sort(
    (a, b) =>
      hangPriority(b.event) - hangPriority(a.event) || a.startAtSec - b.startAtSec
  )
}

/** Freed slots go to the highest-priority parked cards still within TTL
 *  (red SC back before cheap ones). Equal priority restores the NEWER card
 *  first — it was displaced more recently, so it comes back first. Display
 *  position is decided by orderHangLane (oldest on top within a price group). */
function promoteParked(lane: HangLaneState, maxActive: number): HangLaneState {
  const freeSlots = maxActive - lane.active.length
  if (freeSlots <= 0 || lane.parked.length === 0) return lane
  const sorted = [...lane.parked].sort(
    (a, b) =>
      hangPriority(b.event) - hangPriority(a.event) || b.startAtSec - a.startAtSec
  )
  const promoted = sorted.slice(0, freeSlots)
  const promotedIds = new Set(promoted.map((item) => item.event.id))
  return {
    active: [...lane.active, ...promoted],
    parked: lane.parked.filter((item) => !promotedIds.has(item.event.id)),
  }
}

function settleHangLane(
  prev: HangLaneState,
  videoSec: number,
  incoming: ActiveItem[],
  maxActive: number
): HangLaneState {
  // Drop parked cards whose TTL ran out while waiting.
  const parkedAlive = prev.parked.filter((item) => videoSec < item.hideAtSec)
  const combined = incoming.length ? [...prev.active, ...incoming] : prev.active

  let active: ActiveItem[]
  let parked: ActiveItem[]
  const ordered = orderHangLane(combined)
  if (ordered.length > maxActive) {
    // Lane full: the newcomer slides in from the bottom and the cover wave
    // shoves the whole stack upward — the top (highest-priority) incumbents
    // fall off and park until the newcomers expire and free their slots.
    const incomingIds = new Set(incoming.map((item) => item.event.id))
    const incumbents = ordered.filter((item) => !incomingIds.has(item.event.id))
    // A burst wider than the lane keeps only the newest arrivals (the earliest
    // ones get shoved off the top by their own successors).
    const keptNewcomers = incoming.slice(-maxActive)
    const keepIncumbentCount = Math.max(0, maxActive - keptNewcomers.length)
    parked = [
      ...parkedAlive,
      ...incumbents.slice(0, incumbents.length - keepIncumbentCount),
      ...incoming.slice(0, incoming.length - keptNewcomers.length),
    ]
    active = orderHangLane([
      ...incumbents.slice(incumbents.length - keepIncumbentCount),
      ...keptNewcomers,
    ])
  } else {
    active = ordered
    parked = parkedAlive
  }

  const settled = promoteParked({ active, parked }, maxActive)
  const result: HangLaneState = {
    active: orderHangLane(settled.active),
    parked: settled.parked,
  }
  const unchanged =
    result.active.length === prev.active.length &&
    result.active.every((item, idx) => item.event.id === prev.active[idx]?.event.id) &&
    result.parked.length === prev.parked.length &&
    result.parked.every((item, idx) => item.event.id === prev.parked[idx]?.event.id)
  return unchanged ? prev : result
}

function useWallClock() {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    let raf = 0
    const loop = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return now
}

export interface OverlayEventQueueOptions {
  events: OverlayEvent[]
  videoRef: RefObject<HTMLVideoElement | null>
  hidden: boolean
  seekEpoch: number
}

export interface OverlayEventQueue {
  /** Current video time in seconds (drives countdown bars in the renderer). */
  currentTime: number
  /** Hang-lane SC cards currently on screen (price-ordered, parked/restored). */
  hangActive: ActiveItem[]
  /** Guard cards in the lower lane: guard-vs-guard reuses the SC mechanism
   *  (covering wave + parking/restoring), and they always sit above gifts. */
  guardActive: ActiveItem[]
  /** Gift toasts: plain rotation; they can only ever cover other gifts. */
  gifts: ActiveItem[]
}

/**
 * Overlay event queue state machine: ingests events as playback reaches them,
 * prunes expired cards, caps the visible hang lane, and parks the overflow.
 * Parked cards still within TTL are restored into freed slots (price first).
 */
export function useOverlayEventQueue({
  events,
  videoRef,
  hidden,
  seekEpoch,
}: OverlayEventQueueOptions): OverlayEventQueue {
  const currentTime = useVideoPlaybackTime(videoRef)
  const cursorRef = useRef(0)
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  const [hangLane, setHangLane] = useState<HangLaneState>({ active: [], parked: [] })
  const [lowerLane, setLowerLane] = useState<LowerLaneState>({
    guards: { active: [], parked: [] },
    gifts: [],
  })
  const now = useWallClock()

  useEffect(() => {
    const t0 = currentTimeRef.current
    const activeAtCurrentTime = hidden
      ? []
      : events.filter((ev) => ev.ts <= t0 && ev.ts + lifeSecFor(ev) > t0)
    const hangItems = activeAtCurrentTime
      .filter((ev) => ev.kind === "super_chat")
      .map((ev) => activate(ev, t0, ev.ts))
    setHangLane({
      active: hangItems.slice(-MAX_HANG),
      parked: hangItems.length > MAX_HANG ? hangItems.slice(0, -MAX_HANG) : [],
    })
    const guardItems = activeAtCurrentTime
      .filter((ev) => ev.kind === "guard")
      .map((ev) => activate(ev, t0, ev.ts))
    const giftItems = activeAtCurrentTime
      .filter((ev) => ev.kind === "gift")
      .map((ev) => activate(ev, t0, ev.ts))
    // Each guard claims GUARD_SLOT_UNITS units of the shared pool.
    const maxGuards = Math.floor(MAX_TOAST / GUARD_SLOT_UNITS)
    setLowerLane({
      guards: {
        active: guardItems.slice(-maxGuards),
        parked: guardItems.length > maxGuards ? guardItems.slice(0, -maxGuards) : [],
      },
      gifts: giftItems.slice(
        -Math.max(
          0,
          MAX_TOAST - Math.min(maxGuards, guardItems.length) * GUARD_SLOT_UNITS
        )
      ),
    })
    let i = 0
    while (i < events.length && events[i].ts <= t0) i += 1
    cursorRef.current = i
  }, [seekEpoch, events, hidden])

  useEffect(() => {
    if (hidden) return
    const videoSec = currentTime

    // Ingest events that have come due since the last frame.
    const incomingHang: ActiveItem[] = []
    const incomingGuard: ActiveItem[] = []
    const incomingGift: ActiveItem[] = []
    let i = cursorRef.current
    while (i < events.length && events[i].ts <= currentTime + 0.05) {
      const ev = events[i]
      i += 1
      // Anchor the TTL to the event's own video time, NOT the ingest moment:
      // after a seek the cursor catches up in one batch, and anchoring to
      // `currentTime` would resurrect long-expired events for a fresh TTL.
      const item = activate(ev, ev.ts)
      if (item.hideAtSec <= videoSec) continue // expired while we were away
      if (ev.kind === "super_chat") {
        // SC: price-ordered hang lane with parking/restoring.
        incomingHang.push(item)
      } else if (ev.kind === "guard") {
        // Guard: lower lane, but guard-vs-guard reuses the SC mechanism.
        incomingGuard.push(item)
      } else {
        // Gifts rotate among themselves only; they can never cover a guard.
        incomingGift.push(item)
      }
    }
    cursorRef.current = i

    // Lower lane: guards settle with the SC mechanics and permanently claim
    // GUARD_SLOT_UNITS units each; gifts only ever occupy the leftover units
    // (covered by guards, no restoring). Single functional update keeps the
    // unit split consistent.
    // NOTE: the unchanged check compares ARRAY REFERENCES, not ids — prune's
    // exit-marking keeps ids identical, so an id-based check would discard the
    // prune result every frame and overdue cards would never be removed.
    setLowerLane((prev) => {
      const prunedGuardsActive = pruneActive(prev.guards.active, videoSec, now)
      const prunedGifts = pruneActive(prev.gifts, videoSec, now)
      const maxGuards = Math.floor(MAX_TOAST / GUARD_SLOT_UNITS)
      const guards = settleHangLane(
        { active: prunedGuardsActive, parked: prev.guards.parked },
        videoSec,
        incomingGuard,
        maxGuards
      )
      const giftUnits = Math.max(
        0,
        MAX_TOAST - guards.active.length * GUARD_SLOT_UNITS
      )
      let gifts = prunedGifts
      if (incomingGift.length) gifts = [...gifts, ...incomingGift]
      if (gifts.length > giftUnits) gifts = gifts.slice(-giftUnits)
      const unchanged =
        prunedGuardsActive === prev.guards.active &&
        guards.active === prunedGuardsActive &&
        guards.parked === prev.guards.parked &&
        gifts === prunedGifts
      return unchanged ? prev : { guards, gifts }
    })

    // Prune expired cards, park the lane overflow, then restore evicted cards
    // (price first) into freed slots. Reference-stable unchanged check: the
    // prune result must always be persisted (see the note above).
    setHangLane((prev) => {
      const prunedActive = pruneActive(prev.active, videoSec, now)
      const settled = settleHangLane(
        { active: prunedActive, parked: prev.parked },
        videoSec,
        incomingHang,
        MAX_HANG
      )
      const unchanged =
        prunedActive === prev.active &&
        settled.active === prunedActive &&
        settled.parked === prev.parked
      return unchanged ? prev : { active: settled.active, parked: settled.parked }
    })
  }, [now, currentTime, hidden, events])

  return {
    currentTime,
    hangActive: hidden ? [] : hangLane.active,
    guardActive: hidden ? [] : lowerLane.guards.active,
    gifts: hidden ? [] : lowerLane.gifts,
  }
}
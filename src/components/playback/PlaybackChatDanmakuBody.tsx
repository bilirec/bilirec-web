import { chatDanmakuParts, loadEmoteMap, type EmoteMap } from "@/lib/danmaku-emote"
import { useEffect, useState } from "react"

const chatStickerClass =
  "inline-block h-8 max-w-[4.5rem] w-auto shrink-0 align-middle object-contain pointer-events-none"
const chatInlineEmoteClass =
  "inline-block h-[1.15em] w-auto align-text-bottom object-contain pointer-events-none"

export function PlaybackChatDanmakuBody({
  text,
  color,
  emoticonUrl,
  emotes: emotesProp,
}: {
  text: string
  color?: string
  emoticonUrl?: string
  emotes?: EmoteMap | null
}) {
  const [emotesLocal, setEmotesLocal] = useState<EmoteMap | null>(emotesProp ?? null)

  useEffect(() => {
    if (emotesProp !== undefined) {
      setEmotesLocal(emotesProp)
      return
    }
    let cancelled = false
    void loadEmoteMap().then((map) => {
      if (!cancelled) setEmotesLocal(map)
    })
    return () => {
      cancelled = true
    }
  }, [emotesProp])

  const parts = chatDanmakuParts(text, emoticonUrl, emotesLocal)
  const stickerOnly =
    parts.length === 1 &&
    parts[0]?.kind === "image" &&
    (Boolean(emoticonUrl) || /^\[[^\[\]]+\]$/.test(text.trim()))

  if (stickerOnly && parts[0]?.kind === "image") {
    return (
      <img
        src={parts[0].url}
        alt={parts[0].alt}
        className={chatStickerClass}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
      />
    )
  }

  return (
    <span style={color ? { color } : undefined}>
      {parts.map((part, index) =>
        part.kind === "image" ? (
          <img
            key={`${index}-${part.url}`}
            src={part.url}
            alt={part.alt}
            className={chatInlineEmoteClass}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <span key={`${index}-t`}>{part.value}</span>
        )
      )}
    </span>
  )
}

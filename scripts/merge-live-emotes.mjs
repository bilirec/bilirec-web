/**
 * Merge Bilibili live-room emoticon API JSON into public/emotes.json.
 * Only entries whose `emoji` field is already `[token]` (matches danmaku-emote lookup).
 *
 * Usage: node scripts/merge-live-emotes.mjs <api-response.json>
 *
 * Accepts full API body (`{ data: { data: [...] } }`) or a bare package array.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "..", "public", "emotes.json")
const BRACKET_TOKEN = /^\[[^\[\]]+\]$/

function normalizeUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) return null
  return url.replace(/^http:\/\//, "https://")
}

function packagesFromPayload(body) {
  if (Array.isArray(body)) return body
  const d = body?.data
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d)) return d
  if (Array.isArray(body?.data)) return body.data
  throw new Error("Unrecognized JSON shape: expected data.data[] or package array")
}

function flattenBracketEmotes(packages) {
  const emotes = {}
  let skipped = 0
  for (const pkg of packages) {
    const list = pkg.emoticons ?? pkg.emoticon ?? []
    for (const item of list) {
      const token = item.emoji ?? item.text
      if (!token || !BRACKET_TOKEN.test(String(token))) {
        skipped++
        continue
      }
      const url = normalizeUrl(item.url ?? item.gif_url)
      if (!url) {
        skipped++
        continue
      }
      emotes[token] = url
    }
  }
  return { emotes, skipped }
}

const inputPath = process.argv[2]
if (!inputPath) {
  console.error("Usage: node scripts/merge-live-emotes.mjs <api-response.json>")
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"))
const packages = packagesFromPayload(raw)
const { emotes: incoming, skipped } = flattenBracketEmotes(packages)

let existing = { version: 1, emotes: {} }
if (fs.existsSync(OUT)) {
  existing = JSON.parse(fs.readFileSync(OUT, "utf8"))
}
const merged = { ...existing.emotes }
let added = 0
let updated = 0
for (const [k, v] of Object.entries(incoming)) {
  if (!(k in merged)) added++
  else if (merged[k] !== v) updated++
  merged[k] = v
}

const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]))
fs.writeFileSync(OUT, JSON.stringify({ version: 1, emotes: sorted }, null, 4) + "\n", "utf8")
console.log(
  `Merged ${Object.keys(incoming).length} bracket tokens (${skipped} skipped non-[xxx] or no url); ` +
    `+${added} new, ${updated} url updates; total ${Object.keys(sorted).length} in ${OUT}`
)

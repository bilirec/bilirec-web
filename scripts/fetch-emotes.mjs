/**
 * Streams Bmoji download.json until the 颜文字 package, then writes a flat
 * token → url map for the three free emoji packs (小黄脸, tv_小电视, 喵).
 */
import https from "node:https"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "..", "public", "emotes.json")
const URL =
  "https://raw.githubusercontent.com/SomeOvO/Bmoji/refs/heads/main/back/download.json"
const PACKAGE_TEXT = "颜文字"

function fetchUntilYanwenzi() {
  return new Promise((resolve, reject) => {
    let buf = ""
    const req = https.get(URL, { headers: { "User-Agent": "bilirec-web-fetch-emotes" } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        res.resume()
        return
      }
      res.setEncoding("utf8")
      res.on("data", (chunk) => {
        buf += chunk
        const key = `"text":"${PACKAGE_TEXT}"`
        const k = buf.indexOf(key)
        if (k === -1) return
        const objStart = buf.lastIndexOf('{"id":', k)
        if (objStart <= 0) {
          reject(new Error("Could not find package object start before 颜文字"))
          res.destroy()
          return
        }
        let slice = buf.slice(0, objStart).replace(/,\s*$/, "")
        if (!slice.endsWith("]")) slice += "]"
        res.destroy()
        resolve(slice)
      })
      res.on("end", () => {
        if (!buf.includes(PACKAGE_TEXT)) {
          reject(new Error("颜文字 marker not found in download.json"))
        }
      })
      res.on("error", reject)
    })
    req.on("error", reject)
  })
}

function flattenPackages(packages) {
  const emotes = {}
  for (const pkg of packages) {
    for (const e of pkg.emote ?? []) {
      const token = e.text
      const url = (e.gif_url && String(e.gif_url).trim()) || e.url
      if (!token || !url || !String(url).startsWith("http")) continue
      emotes[token] = String(url).replace(/^http:\/\//, "https://")
    }
  }
  return emotes
}

const raw = await fetchUntilYanwenzi()
const packages = JSON.parse(raw)
const emotes = flattenPackages(packages)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ version: 1, emotes }, null, 0), "utf8")
console.log(`Wrote ${Object.keys(emotes).length} emotes to ${OUT}`)

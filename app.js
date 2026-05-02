const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const multer = require("multer");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "replace-this-with-a-long-random-secret";
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "storage", "voting.sqlite");
const STORAGE_DIR = path.dirname(DB_PATH);
const MEDIA_DIR = path.join(STORAGE_DIR, "media");
const TMP_UPLOAD_DIR = path.join(STORAGE_DIR, "tmp-uploads");
const execFileAsync = promisify(execFile);
const CHROMIUM_EXECUTABLE_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const SMULE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const SMULE_DECODE_KEY = decodeBase64String(
  "TT18WlV5TXVeLXFXYn1WTF5qSmR9TXYpOHklYlFXWGY+SUZCRGNKPiU0emcyQ2l8dGVsamBkVlpA",
);

fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    redirect_url TEXT,
    is_visible INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telegram_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    username TEXT,
    photo_url TEXT,
    phone_number TEXT,
    raw_profile_json TEXT,
    voting_state_json TEXT,
    voting_completed_at TEXT,
    final_winner_participant_id INTEGER,
    login_count INTEGER NOT NULL DEFAULT 0,
    first_login_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    embed_html TEXT,
    audio_file_path TEXT,
    audio_source_url TEXT,
    audio_source_type TEXT,
    witcher_choice INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (poll_id) REFERENCES polls(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER,
    voter_user_id INTEGER NOT NULL,
    winner_participant_id INTEGER NOT NULL,
    loser_participant_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (poll_id) REFERENCES polls(id),
    FOREIGN KEY (voter_user_id) REFERENCES telegram_users(id),
    FOREIGN KEY (winner_participant_id) REFERENCES participants(id),
    FOREIGN KEY (loser_participant_id) REFERENCES participants(id)
  );

  CREATE TABLE IF NOT EXISTS user_poll_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    poll_id INTEGER NOT NULL,
    voting_state_json TEXT,
    completed_at TEXT,
    final_winner_participant_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, poll_id),
    FOREIGN KEY (user_id) REFERENCES telegram_users(id),
    FOREIGN KEY (poll_id) REFERENCES polls(id),
    FOREIGN KEY (final_winner_participant_id) REFERENCES participants(id)
  );

  CREATE TABLE IF NOT EXISTS participant_listens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    participant_id INTEGER NOT NULL,
    listener_user_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (poll_id) REFERENCES polls(id),
    FOREIGN KEY (participant_id) REFERENCES participants(id),
    FOREIGN KEY (listener_user_id) REFERENCES telegram_users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired_at INTEGER NOT NULL
  );
`);

const participantColumns = db
  .prepare("PRAGMA table_info(participants)")
  .all()
  .map((column) => column.name);

const pollColumns = db
  .prepare("PRAGMA table_info(polls)")
  .all()
  .map((column) => column.name);

if (!pollColumns.includes("is_visible")) {
  db.exec("ALTER TABLE polls ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1");
}

if (!pollColumns.includes("image_url")) {
  db.exec("ALTER TABLE polls ADD COLUMN image_url TEXT");
}

if (!participantColumns.includes("embed_html")) {
  db.exec("ALTER TABLE participants ADD COLUMN embed_html TEXT");
}

if (!participantColumns.includes("audio_file_path")) {
  db.exec("ALTER TABLE participants ADD COLUMN audio_file_path TEXT");
}

if (!participantColumns.includes("audio_source_url")) {
  db.exec("ALTER TABLE participants ADD COLUMN audio_source_url TEXT");
}

if (!participantColumns.includes("audio_source_type")) {
  db.exec("ALTER TABLE participants ADD COLUMN audio_source_type TEXT");
}

if (!participantColumns.includes("poll_id")) {
  db.exec("ALTER TABLE participants ADD COLUMN poll_id INTEGER");
}

if (!participantColumns.includes("witcher_choice")) {
  db.exec("ALTER TABLE participants ADD COLUMN witcher_choice INTEGER NOT NULL DEFAULT 0");
}

const userColumns = db
  .prepare("PRAGMA table_info(telegram_users)")
  .all()
  .map((column) => column.name);

if (!userColumns.includes("voting_state_json")) {
  db.exec("ALTER TABLE telegram_users ADD COLUMN voting_state_json TEXT");
}

if (!userColumns.includes("voting_completed_at")) {
  db.exec("ALTER TABLE telegram_users ADD COLUMN voting_completed_at TEXT");
}

if (!userColumns.includes("final_winner_participant_id")) {
  db.exec("ALTER TABLE telegram_users ADD COLUMN final_winner_participant_id INTEGER");
}

const voteColumns = db
  .prepare("PRAGMA table_info(votes)")
  .all()
  .map((column) => column.name);

if (!voteColumns.includes("poll_id")) {
  db.exec("ALTER TABLE votes ADD COLUMN poll_id INTEGER");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ensureDefaultPoll() {
  const existing = db.prepare("SELECT id FROM polls ORDER BY id ASC LIMIT 1").get();
  if (existing) return existing.id;

  const timestamp = nowIso();
  const result = db.prepare(`
    INSERT INTO polls (title, slug, description, redirect_url, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(
    "Этап 1",
    "stage-1",
    "Первое голосование",
    "https://dsipsmule.one",
    timestamp,
    timestamp,
  );

  return Number(result.lastInsertRowid);
}

const defaultPollId = ensureDefaultPoll();

db.prepare("UPDATE participants SET poll_id = ? WHERE poll_id IS NULL").run(defaultPollId);
db.prepare("UPDATE votes SET poll_id = ? WHERE poll_id IS NULL").run(defaultPollId);

const participantCount = db
  .prepare("SELECT COUNT(*) AS count FROM participants")
  .get().count;

if (participantCount === 0) {
  const seed = db.prepare(`
    INSERT INTO participants (poll_id, name, description, image_url, embed_html, created_at, updated_at)
    VALUES (@poll_id, @name, @description, @image_url, @embed_html, @created_at, @updated_at)
  `);

  const now = new Date().toISOString();
  [
    {
      name: "Участник 1",
      description: "Замените на реального участника в админке.",
      image_url:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
      embed_html: "",
      poll_id: defaultPollId,
    },
    {
      name: "Участник 2",
      description: "Замените на реального участника в админке.",
      image_url:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
      embed_html: "",
      poll_id: defaultPollId,
    },
    {
      name: "Участник 3",
      description: "Замените на реального участника в админке.",
      image_url:
        "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80",
      embed_html: "",
      poll_id: defaultPollId,
    },
  ].forEach((row) => seed.run({ ...row, created_at: now, updated_at: now }));
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/media", express.static(MEDIA_DIR));

const upload = multer({
  dest: TMP_UPLOAD_DIR,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

function nowIso() {
  return new Date().toISOString();
}

class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.getStmt = this.db.prepare(`
      SELECT sess
      FROM sessions
      WHERE sid = ? AND expired_at >= ?
    `);
    this.setStmt = this.db.prepare(`
      INSERT INTO sessions (sid, sess, expired_at)
      VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET
        sess = excluded.sess,
        expired_at = excluded.expired_at
    `);
    this.destroyStmt = this.db.prepare("DELETE FROM sessions WHERE sid = ?");
    this.touchStmt = this.db.prepare("UPDATE sessions SET expired_at = ? WHERE sid = ?");
    this.clearExpiredStmt = this.db.prepare("DELETE FROM sessions WHERE expired_at < ?");
  }

  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      if (!row) {
        return callback(null, null);
      }

      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expiresAt = this.getExpiresAt(sess);
      this.setStmt.run(sid, JSON.stringify(sess), expiresAt);
      this.clearExpiredStmt.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStmt.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      this.touchStmt.run(this.getExpiresAt(sess), sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  getExpiresAt(sess) {
    return sess?.cookie?.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + 1000 * 60 * 60 * 24 * 7;
  }
}

app.use(
  session({
    secret: SESSION_SECRET,
    store: new SQLiteSessionStore(db),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.isAdmin = Boolean(req.session.isAdmin);
  next();
});

function buildFullName(profile) {
  if (profile.name) return profile.name;
  return [profile.given_name, profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sanitizeReturnPath(value) {
  const pathValue = String(value || "").trim();
  if (!pathValue.startsWith("/") || pathValue.startsWith("//")) {
    return "/";
  }
  return pathValue;
}

function buildTelegramAuthUrl(returnToPath = "/") {
  const safeReturnPath = sanitizeReturnPath(returnToPath);
  return `${BASE_URL}/auth/telegram/widget?next=${encodeURIComponent(safeReturnPath)}`;
}

function parsePageParam(value) {
  const page = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function paginateItems(items, page, perPage) {
  const safePerPage = Math.max(1, Number(perPage) || 1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * safePerPage;

  return {
    items: items.slice(startIndex, startIndex + safePerPage),
    pagination: {
      currentPage,
      totalPages,
      totalItems,
      perPage: safePerPage,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
  };
}

function buildPageHref(query, pageParam, page) {
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          params.append(key, String(item));
        }
      });
      return;
    }

    params.set(key, String(value));
  });

  if (page <= 1) {
    params.delete(pageParam);
  } else {
    params.set(pageParam, String(page));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function normalizeMediaSourceUrl(value) {
  return String(value || "").trim();
}

function decodeBase64String(value) {
  return Buffer.from(String(value || ""), "base64").toString("latin1");
}

function detectAudioSourceType(sourceUrl, fallbackType = "") {
  const url = normalizeMediaSourceUrl(sourceUrl).toLowerCase();
  if (fallbackType === "upload") return "upload";
  if (url.includes("smule.com")) return "smule";
  if (url.includes("bandlab.com")) return "bandlab";
  return fallbackType || "";
}

function participantAudioBaseName(participantId) {
  return `participant-${participantId}`;
}

function normalizeSmuleSourceUrl(sourceUrl) {
  const normalizedUrl = normalizeMediaSourceUrl(sourceUrl);

  try {
    const parsed = new URL(normalizedUrl);
    if (!/smule\.com$/i.test(parsed.hostname)) {
      return normalizedUrl;
    }

    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/frame(?:\/box)?\/?$/i, "");
    return parsed.toString();
  } catch (error) {
    return normalizedUrl.replace(/[?#].*$/g, "").replace(/\/frame(?:\/box)?\/?$/i, "");
  }
}

function extractBandLabPostId(sourceUrl) {
  const normalizedUrl = normalizeMediaSourceUrl(sourceUrl);

  try {
    const parsed = new URL(normalizedUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const postIndex = pathParts.findIndex((part) => part === "post");

    if (postIndex !== -1 && pathParts[postIndex + 1]) {
      return pathParts[postIndex + 1];
    }
  } catch (error) {
    const match = normalizedUrl.match(/bandlab\.com\/post\/([a-f0-9-]+)/i);
    if (match) {
      return match[1];
    }
  }

  return "";
}

function pollImageBaseName(pollId) {
  return `poll-${pollId}`;
}

function getParticipantAudioAbsolutePath(participantId) {
  return path.join(MEDIA_DIR, `${participantAudioBaseName(participantId)}.m4a`);
}

function clearFilesByPrefix(prefix) {
  fs.readdirSync(MEDIA_DIR).forEach((fileName) => {
    if (fileName.startsWith(prefix)) {
      fs.rmSync(path.join(MEDIA_DIR, fileName), { force: true });
    }
  });
}

function clearParticipantAudioFiles(participantId) {
  clearFilesByPrefix(`${participantAudioBaseName(participantId)}.`);
}

function clearPollImageFiles(pollId) {
  clearFilesByPrefix(`${pollImageBaseName(pollId)}.`);
}

function buildParticipantAudioUrl(audioFilePath) {
  const fileName = path.basename(String(audioFilePath || "").trim());
  return fileName ? `/media/${encodeURIComponent(fileName)}` : "";
}

function buildPollImageUrl(imagePath) {
  const normalized = String(imagePath || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("/media/")) {
    return normalized;
  }

  const fileName = path.basename(normalized);
  return fileName ? `/media/${encodeURIComponent(fileName)}` : "";
}

function savePollImageFile(pollId, file) {
  const originalName = String(file?.originalname || "").toLowerCase();
  const extension = path.extname(originalName);
  const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

  if (!file) {
    throw new Error("No uploaded image provided.");
  }

  if (!allowedExtensions.has(extension) && String(file.mimetype || "").indexOf("image/") !== 0) {
    fs.rmSync(file.path, { force: true });
    throw new Error("Only JPG, PNG, WEBP, and GIF images are supported.");
  }

  clearPollImageFiles(pollId);

  const safeExtension = allowedExtensions.has(extension) ? extension : ".jpg";
  const finalPath = path.join(MEDIA_DIR, `${pollImageBaseName(pollId)}${safeExtension}`);
  fs.renameSync(file.path, finalPath);
  return buildPollImageUrl(finalPath);
}

function extractSmuleEncodedMediaUrl(pageHtml) {
  const rawHtml = String(pageHtml || "");
  const patterns = [
    /"media_url":"([^"]+)"/,
    /\\"media_url\\":\\"([^"]+)\\"/,
    /&quot;media_url&quot;:&quot;([^"&]+)&quot;/,
    /media_url["']?\s*:\s*["']([^"']+)["']/,
  ];

  for (const pattern of patterns) {
    const match = rawHtml.match(pattern);
    if (match && match[1]) {
      return match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\\"/g, '"');
    }
  }

  return "";
}

function extractSmuleDirectAudioUrl(responseText) {
  const rawText = String(responseText || "");
  const patterns = [
    /https:\/\/[^"'\\\s]+\.m4a(?:\?[^"'\\\s]*)?/i,
    /https:\/\/[^"'\\\s]+\/rendered\/[^"'\\\s]+\.m4a(?:\?[^"'\\\s]*)?/i,
    /"audio_url":"(https:\/\/[^"]+\.m4a[^"]*)"/i,
    /"file":"(https:\/\/[^"]+\.m4a[^"]*)"/i,
    /"mediaUrl":"(https:\/\/[^"]+\.m4a[^"]*)"/i,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) {
      return String(match[1] || match[0] || "").replace(/\\"/g, '"').replace(/&amp;/g, "&");
    }
  }

  return "";
}

function extractSmulePerformanceKey(sourceUrl) {
  const normalizedUrl = normalizeSmuleSourceUrl(sourceUrl);
  const match = normalizedUrl.match(/\/(\d+_\d+)(?:$|[/?#])/);
  return match ? match[1] : "";
}

function summarizeSmuleResponse(label, responseText) {
  const rawText = String(responseText || "");
  const compactText = rawText.replace(/\s+/g, " ").trim();
  const preview = compactText.slice(0, 220) || "empty";
  const flags = [];

  if (rawText.includes("media_url")) flags.push("has_media_url");
  if (rawText.includes(".m4a")) flags.push("has_m4a");
  if (rawText.includes("Just a moment")) flags.push("cloudflare");
  if (rawText.includes("<html")) flags.push("html");
  if (rawText.trim().startsWith("{")) flags.push("json");

  return `${label}: ${flags.join(",") || "no_markers"} | ${preview}`;
}

function buildSmuleLookupUrls(sourceUrl) {
  const recordingUrl = normalizeSmuleSourceUrl(sourceUrl);
  const performanceKey = extractSmulePerformanceKey(recordingUrl);
  const urls = [recordingUrl];

  if (performanceKey) {
    urls.unshift(`https://www.smule.com/api/performance/${performanceKey}`);
  }

  return Array.from(new Set(urls));
}

function buildSmuleFrameUrls(sourceUrl) {
  const recordingUrl = normalizeSmuleSourceUrl(sourceUrl).replace(/\/+$/g, "");
  return [`${recordingUrl}/frame`, `${recordingUrl}/frame/box`];
}

function decodeSmuleMediaUrl(encodedMediaUrl) {
  const rawValue = String(encodedMediaUrl || "");
  if (!rawValue.startsWith("e:")) {
    return rawValue;
  }

  const input = decodeBase64String(rawValue.slice(2));
  const key = SMULE_DECODE_KEY;
  const state = Array.from({ length: 256 }, (_, index) => index);
  let swapIndex = 0;

  for (let index = 0; index < 256; index += 1) {
    swapIndex = (swapIndex + state[index] + key.charCodeAt(index % key.length)) % 256;
    const current = state[index];
    state[index] = state[swapIndex];
    state[swapIndex] = current;
  }

  let i = 0;
  let j = 0;
  let decoded = "";

  for (let position = 0; position < input.length; position += 1) {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    const current = state[i];
    state[i] = state[j];
    state[j] = current;
    decoded += String.fromCharCode(input.charCodeAt(position) ^ state[(state[i] + state[j]) % 256]);
  }

  if (!decoded.startsWith("http")) {
    throw new Error("Smule returned an unreadable media URL.");
  }

  return decoded;
}

async function resolveSmuleAudioUrlFromBrowser(sourceUrl) {
  let chromiumLib;

  try {
    chromiumLib = require("playwright-core");
  } catch (error) {
    return "";
  }

  const { chromium } = chromiumLib;
  const performanceKey = extractSmulePerformanceKey(sourceUrl) || "unknown";
  const browserHomePath = path.join(TMP_UPLOAD_DIR, `chromium-home-${performanceKey}`);
  const browserRuntimePath = path.join(TMP_UPLOAD_DIR, `chromium-runtime-${performanceKey}`);
  const frameUrls = buildSmuleFrameUrls(sourceUrl);

  fs.mkdirSync(browserHomePath, { recursive: true });
  fs.mkdirSync(browserRuntimePath, { recursive: true });

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROMIUM_EXECUTABLE_PATH,
      env: {
        ...process.env,
        HOME: browserHomePath,
        XDG_CONFIG_HOME: browserHomePath,
        XDG_CACHE_HOME: browserHomePath,
        XDG_RUNTIME_DIR: browserRuntimePath,
      },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-crash-reporter",
        "--disable-crashpad",
        "--no-crash-upload",
      ],
    });

    const context = await browser.newContext({
      userAgent: SMULE_USER_AGENT,
    });

    for (const frameUrl of frameUrls) {
      const page = await context.newPage();
      let directAudioUrl = "";

      const captureCandidate = (candidateUrl) => {
        const normalized = String(candidateUrl || "").trim();
        if (!directAudioUrl && normalized.startsWith("https://") && normalized.includes(".m4a")) {
          directAudioUrl = normalized;
        }
      };

      page.on("request", (request) => captureCandidate(request.url()));
      page.on("response", (response) => captureCandidate(response.url()));

      try {
        await page.goto(frameUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(6000);
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      } catch (error) {
        // Try the next frame variant below.
      }

      if (!directAudioUrl) {
        const resourceUrls = await page.evaluate(() => {
          return performance
            .getEntriesByType("resource")
            .map((entry) => entry && entry.name)
            .filter(Boolean);
        }).catch(() => []);

        for (const resourceUrl of resourceUrls) {
          captureCandidate(resourceUrl);
          if (directAudioUrl) {
            break;
          }
        }
      }

      await page.close().catch(() => {});

      if (directAudioUrl) {
        await context.close().catch(() => {});
        return directAudioUrl;
      }
    }

    await context.close().catch(() => {});
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return "";
}

async function resolveSmuleAudioUrl(sourceUrl) {
  const recordingUrl = normalizeSmuleSourceUrl(sourceUrl);
  const performanceKey = extractSmulePerformanceKey(recordingUrl);
  if (!performanceKey) {
    throw new Error("Smule performance key was not found in the provided URL.");
  }

  const browserAudioUrl = await resolveSmuleAudioUrlFromBrowser(recordingUrl).catch(() => "");
  if (browserAudioUrl) {
    return browserAudioUrl;
  }

  const cookieJarPath = path.join(TMP_UPLOAD_DIR, `smule-${performanceKey}.cookies.txt`);
  let pageHtml = "";
  let apiResponse = "";

  try {
    const pageResult = await execFileAsync("curl", [
      "-s",
      "-L",
      "-A",
      SMULE_USER_AGENT,
      "--compressed",
      "-c",
      cookieJarPath,
      "-b",
      cookieJarPath,
      "-H",
      "accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "-H",
      "accept-language: en-US,en;q=0.9",
      "-H",
      "cache-control: no-cache",
      recordingUrl,
    ]);
    pageHtml = pageResult.stdout;

    const apiResult = await execFileAsync("curl", [
      "-s",
      "-L",
      "-A",
      SMULE_USER_AGENT,
      "--compressed",
      "-c",
      cookieJarPath,
      "-b",
      cookieJarPath,
      "-H",
      "accept: application/json,text/plain,*/*",
      "-H",
      "accept-language: en-US,en;q=0.9",
      "-H",
      "x-requested-with: XMLHttpRequest",
      "-H",
      `referer: ${recordingUrl}`,
      `https://www.smule.com/api/performance/${performanceKey}`,
    ]);
    apiResponse = apiResult.stdout;
  } finally {
    fs.rmSync(cookieJarPath, { force: true });
  }

  const apiDirectAudioUrl = extractSmuleDirectAudioUrl(apiResponse);
  if (apiDirectAudioUrl) {
    return apiDirectAudioUrl;
  }

  const pageDirectAudioUrl = extractSmuleDirectAudioUrl(pageHtml);
  if (pageDirectAudioUrl) {
    return pageDirectAudioUrl;
  }

  let encodedMediaUrl = extractSmuleEncodedMediaUrl(apiResponse);
  if (!encodedMediaUrl) {
    try {
      const payload = JSON.parse(apiResponse);
      encodedMediaUrl = String(payload?.media_url || payload?.performance?.media_url || "").trim();
    } catch (error) {
      encodedMediaUrl = "";
    }
  }

  if (!encodedMediaUrl) {
    encodedMediaUrl = extractSmuleEncodedMediaUrl(pageHtml);
  }

  if (!encodedMediaUrl) {
    const debugBasePath = path.join(TMP_UPLOAD_DIR, `smule-debug-${performanceKey}`);
    const apiDumpPath = `${debugBasePath}-api.txt`;
    const pageDumpPath = `${debugBasePath}-page.html`;

    fs.writeFileSync(apiDumpPath, apiResponse || "", "utf8");
    fs.writeFileSync(pageDumpPath, pageHtml || "", "utf8");

    throw new Error(
      `Smule audio URL was not found in the API or page response. ${summarizeSmuleResponse("api", apiResponse)} | ${summarizeSmuleResponse("page", pageHtml)} | dumps: ${path.basename(apiDumpPath)}, ${path.basename(pageDumpPath)}`,
    );
  }

  return decodeSmuleMediaUrl(encodedMediaUrl);
}

async function resolveBandLabAudioUrl(sourceUrl) {
  const postId = extractBandLabPostId(sourceUrl);

  if (!postId) {
    throw new Error("BandLab post ID was not found in the provided URL.");
  }

  const { stdout } = await execFileAsync("curl", [
    "-s",
    "-L",
    "-A",
    SMULE_USER_AGENT,
    "--compressed",
    `https://www.bandlab.com/api/v1.3/posts/${postId}`,
  ]);

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error("BandLab returned an unreadable API response.");
  }

  const audioUrl = String(payload?.revision?.mixdown?.file || "").trim();
  if (!audioUrl) {
    throw new Error("BandLab mixdown file was not found for this post.");
  }

  return audioUrl;
}

async function downloadSmuleAudio(participantId, sourceUrl) {
  const decodedAudioUrl = await resolveSmuleAudioUrl(sourceUrl);
  const finalAudioPath = getParticipantAudioAbsolutePath(participantId);

  clearParticipantAudioFiles(participantId);

  await execFileAsync("curl", [
    "-s",
    "-L",
    decodedAudioUrl,
    "-o",
    finalAudioPath,
  ]);

  if (!fs.existsSync(finalAudioPath)) {
    throw new Error("Smule audio file was not created.");
  }

  return finalAudioPath;
}

async function downloadBandLabAudio(participantId, sourceUrl) {
  const audioUrl = await resolveBandLabAudioUrl(sourceUrl);
  const finalAudioPath = getParticipantAudioAbsolutePath(participantId);

  clearParticipantAudioFiles(participantId);

  await execFileAsync("curl", [
    "-s",
    "-L",
    audioUrl,
    "-o",
    finalAudioPath,
  ]);

  if (!fs.existsSync(finalAudioPath)) {
    throw new Error("BandLab audio file was not created.");
  }

  return finalAudioPath;
}

async function downloadAudioFromUrl(participantId, sourceUrl) {
  const normalizedUrl = normalizeMediaSourceUrl(sourceUrl);
  const outputTemplate = path.join(MEDIA_DIR, `${participantAudioBaseName(participantId)}.%(ext)s`);
  const finalAudioPath = getParticipantAudioAbsolutePath(participantId);

  const sourceType = detectAudioSourceType(normalizedUrl);
  if (sourceType === "smule") {
    return downloadSmuleAudio(participantId, normalizedUrl);
  }

  if (sourceType === "bandlab") {
    return downloadBandLabAudio(participantId, normalizedUrl);
  }

  clearParticipantAudioFiles(participantId);

  await execFileAsync("yt-dlp", [
    "--no-playlist",
    "--extract-audio",
    "--audio-format",
    "m4a",
    "--output",
    outputTemplate,
    normalizedUrl,
  ]);

  if (!fs.existsSync(finalAudioPath)) {
    const candidates = fs
      .readdirSync(MEDIA_DIR)
      .filter((fileName) => fileName.startsWith(`${participantAudioBaseName(participantId)}.`));

    const firstCandidate = candidates[0] ? path.join(MEDIA_DIR, candidates[0]) : "";
    if (firstCandidate && fs.existsSync(firstCandidate)) {
      fs.renameSync(firstCandidate, finalAudioPath);
    }
  }

  if (!fs.existsSync(finalAudioPath)) {
    throw new Error("Downloaded audio file was not created.");
  }

  return finalAudioPath;
}

function saveUploadedAudioFile(participantId, file) {
  if (!file) {
    throw new Error("No uploaded file provided.");
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  const acceptedMimeTypes = new Set(["audio/mp4", "audio/m4a", "audio/x-m4a"]);
  if (extension !== ".m4a" && !acceptedMimeTypes.has(String(file.mimetype || "").toLowerCase())) {
    fs.rmSync(file.path, { force: true });
    throw new Error("Only M4A files are supported.");
  }

  const finalPath = getParticipantAudioAbsolutePath(participantId);
  clearParticipantAudioFiles(participantId);
  fs.renameSync(file.path, finalPath);
  return finalPath;
}

function normalizeEmbedHtml(embedHtml) {
  const rawValue = String(embedHtml || "").trim();

  if (!rawValue) {
    return "";
  }

  if (/<iframe[\s>]/i.test(rawValue)) {
    return rawValue;
  }

  if (/^https?:\/\/(www\.)?smule\.com\//i.test(rawValue)) {
    const smuleUrl = /\/frame\/box(?:[/?#]|$)/i.test(rawValue)
      ? rawValue
      : `${rawValue.replace(/\/+$/g, "")}/frame/box`;

    return `<iframe frameborder="0" width="500" height="500" src="${escapeAttribute(smuleUrl)}"></iframe>`;
  }

  if (/^https?:\/\/(www\.)?bandlab\.com\//i.test(rawValue)) {
    return `<iframe width="560" height="202" src="${escapeAttribute(rawValue)}" allowfullscreen></iframe>`;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return `<iframe frameborder="0" width="100%" height="320" src="${escapeAttribute(rawValue)}"></iframe>`;
  }

  return rawValue;
}

function decorateParticipant(participant) {
  return {
    ...participant,
    embed_html: normalizeEmbedHtml(participant.embed_html),
    audio_url: buildParticipantAudioUrl(participant.audio_file_path),
  };
}

function resolvePollImageUrl(imageUrl) {
  return buildPollImageUrl(imageUrl);
}

function canViewPollReport(poll, isAdmin) {
  return Boolean(poll) && (Boolean(isAdmin) || (poll.is_visible && !poll.is_active));
}

function renderPollReportExcel(report) {
  const participantRows = report.participants
    .map(
      (participant, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(participant.name)}</td>
          <td>${participant.voteCount}</td>
          <td>${participant.uniqueVoterCount}</td>
          <td>${participant.listenCount}</td>
          <td>${participant.uniqueListenerCount}</td>
          <td>${participant.is_active ? "Активен" : "Скрыт"}</td>
        </tr>`,
    )
    .join("");

  const voteRows = report.participants
    .flatMap((participant) =>
      participant.voteDetails.map(
        (vote, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(participant.name)}</td>
            <td>${escapeHtml(formatDate(vote.created_at))}</td>
            <td>${escapeHtml(vote.telegram_id)}</td>
            <td>${escapeHtml(vote.full_name || "")}</td>
            <td>${escapeHtml(vote.username ? `@${vote.username}` : "")}</td>
            <td>${escapeHtml(vote.loser_name || "")}</td>
          </tr>`,
      ),
    )
    .join("");

  const safeTitle = escapeHtml(report.poll.title);
  const safeDescription = escapeHtml(report.poll.description || "");
  const generatedAt = escapeHtml(formatDate(nowIso()));

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle}</title>
  </head>
  <body>
    <table border="1">
      <tr><th colspan="2">Отчет по голосованию</th></tr>
      <tr><td>Этап</td><td>${safeTitle}</td></tr>
      <tr><td>Описание</td><td>${safeDescription}</td></tr>
      <tr><td>Статус</td><td>${report.poll.is_active ? "Открыт" : "Закрыт"}</td></tr>
      <tr><td>Участников</td><td>${report.totals.participants}</td></tr>
      <tr><td>Голосов</td><td>${report.totals.votes}</td></tr>
      <tr><td>Людей</td><td>${report.totals.voters}</td></tr>
      <tr><td>Прослушиваний</td><td>${report.totals.listens}</td></tr>
      <tr><td>Сформирован</td><td>${generatedAt}</td></tr>
    </table>
    <br />
    <table border="1">
      <tr>
        <th>#</th>
        <th>Участник</th>
        <th>Голосов</th>
        <th>Людей</th>
        <th>Прослушиваний</th>
        <th>Слушателей</th>
        <th>Статус</th>
      </tr>
      ${participantRows}
    </table>
    <br />
    <table border="1">
      <tr>
        <th>#</th>
        <th>За кого</th>
        <th>Когда</th>
        <th>Telegram ID</th>
        <th>Пользователь</th>
        <th>Username</th>
        <th>Против кого</th>
      </tr>
      ${voteRows}
    </table>
  </body>
</html>`;
}

function ensureUser(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/");
  }
  next();
}

function ensureAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.redirect("/admin/login");
  }
  next();
}

function shuffleIds(ids) {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createVotingState(participantIds) {
  return {
    remainingIds: shuffleIds(participantIds),
    currentChoices: [],
    history: [],
    totalParticipants: participantIds.length,
    stepNumber: 1,
  };
}

function parseVotingState(rawState) {
  if (!rawState) return null;
  try {
    return JSON.parse(rawState);
  } catch {
    return null;
  }
}

function getPolls() {
  return db
    .prepare(`
      SELECT id, title, slug, description, redirect_url, is_visible, is_active, created_at
      , image_url
      FROM polls
      ORDER BY created_at ASC, id ASC
    `)
    .all()
    .map((poll) => ({ ...poll, image_url: resolvePollImageUrl(poll.image_url) }));
}

function getPollBySlug(slug) {
  const poll = db
    .prepare(`
      SELECT id, title, slug, description, redirect_url, is_visible, is_active
      , image_url
      FROM polls
      WHERE slug = ?
    `)
    .get(slug);

  return poll ? { ...poll, image_url: resolvePollImageUrl(poll.image_url) } : null;
}

function getActiveParticipants(pollId) {
  return db
    .prepare(`
      SELECT id, name, description, image_url, embed_html, audio_file_path, audio_source_url, audio_source_type
      FROM participants
      WHERE poll_id = ? AND is_active = 1
      ORDER BY id ASC
    `)
    .all(pollId)
    .map(decorateParticipant);
}

function getParticipantsByIds(ids, pollId) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, name, description, image_url, embed_html, audio_file_path, audio_source_url, audio_source_type FROM participants WHERE poll_id = ? AND id IN (${placeholders})`,
    )
    .all(pollId, ...ids);

  const byId = new Map(rows.map((row) => [row.id, decorateParticipant(row)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function completedVotesFilter(alias = "v") {
  return `
    EXISTS (
      SELECT 1
      FROM user_poll_progress upp
      WHERE upp.user_id = ${alias}.voter_user_id
        AND upp.poll_id = ${alias}.poll_id
        AND upp.completed_at IS NOT NULL
    )
  `;
}

function ensureCurrentChoices(state) {
  const normalized = {
    remainingIds: Array.isArray(state.remainingIds) ? state.remainingIds : [],
    currentChoices: Array.isArray(state.currentChoices) ? state.currentChoices : [],
    history: Array.isArray(state.history) ? state.history : [],
    totalParticipants: Number(state.totalParticipants || 0),
    stepNumber: Number(state.stepNumber || 1),
  };

  if (normalized.currentChoices.length === 0 && normalized.remainingIds.length > 0) {
    const choiceSize = normalized.remainingIds.length % 2 === 1 ? 3 : 2;
    normalized.currentChoices = normalized.remainingIds.splice(0, choiceSize);
  }

  return normalized;
}

function getOrCreateUserPollProgress(userId, pollId) {
  const existing = db
    .prepare(`
      SELECT
        id,
        voting_state_json,
        completed_at,
        final_winner_participant_id
      FROM user_poll_progress
      WHERE user_id = ? AND poll_id = ?
    `)
    .get(userId, pollId);

  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO user_poll_progress (user_id, poll_id, voting_state_json, completed_at, final_winner_participant_id, created_at, updated_at)
    VALUES (?, ?, NULL, NULL, NULL, ?, ?)
  `).run(userId, pollId, timestamp, timestamp);

  return db
    .prepare(`
      SELECT
        id,
        voting_state_json,
        completed_at,
        final_winner_participant_id
      FROM user_poll_progress
      WHERE user_id = ? AND poll_id = ?
    `)
    .get(userId, pollId);
}

function getVotingProgress(userId, pollId) {
  const progress = getOrCreateUserPollProgress(userId, pollId);

  if (progress.completed_at) {
    const winner = progress.final_winner_participant_id
      ? db.prepare("SELECT id, name FROM participants WHERE id = ?").get(progress.final_winner_participant_id)
      : null;

    return {
      status: "completed",
      winner,
      canUndo: false,
    };
  }

  const participants = getActiveParticipants(pollId);
  if (participants.length < 2) {
    return { status: "not_enough_participants" };
  }

  let state = parseVotingState(progress.voting_state_json);
  const activeIds = new Set(participants.map((participant) => participant.id));
  const stateIds = state
    ? [...(state.remainingIds || []), ...(state.currentChoices || [])]
    : [];
  const stateIsUsable = state && stateIds.every((id) => activeIds.has(id));

  if (!stateIsUsable) {
    state = createVotingState(participants.map((participant) => participant.id));
  }

  state = ensureCurrentChoices(state);
  db.prepare("UPDATE user_poll_progress SET voting_state_json = ?, updated_at = ? WHERE user_id = ? AND poll_id = ?").run(
    JSON.stringify(state),
    nowIso(),
    userId,
    pollId,
  );

  if (state.currentChoices.length === 0 && state.remainingIds.length === 0) {
    db.prepare(`
      UPDATE user_poll_progress
      SET voting_state_json = NULL, completed_at = ?, final_winner_participant_id = NULL, updated_at = ?
      WHERE user_id = ? AND poll_id = ?
    `).run(nowIso(), nowIso(), userId, pollId);

    return { status: "completed", winner: null };
  }

  return {
    status: "active",
    stageType: state.currentChoices.length === 3 ? "triple" : "pair",
    participants: getParticipantsByIds(state.currentChoices, pollId),
    roundNumber: state.stepNumber,
    totalParticipants: state.totalParticipants,
    canUndo: state.history.length > 0,
  };
}

function getPollReportData(pollId) {
  const poll = db
    .prepare(`
      SELECT id, title, slug, description, redirect_url, is_active, created_at, updated_at
      , image_url
      FROM polls
      WHERE id = ?
    `)
    .get(pollId);

  if (!poll) {
    return null;
  }

  const participants = db
    .prepare(`
      SELECT id, name, embed_html, audio_file_path, audio_source_url, audio_source_type, witcher_choice, is_active, created_at, updated_at
      FROM participants
      WHERE poll_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .all(pollId)
    .map(decorateParticipant);

  const voteRows = db
    .prepare(`
      SELECT
        v.id,
        v.winner_participant_id,
        v.loser_participant_id,
        v.created_at,
        tu.telegram_id,
        tu.full_name,
        tu.username,
        tu.photo_url,
        loser.name AS loser_name
      FROM votes v
      JOIN telegram_users tu ON tu.id = v.voter_user_id
      JOIN participants loser ON loser.id = v.loser_participant_id
      WHERE v.poll_id = ?
        AND ${completedVotesFilter("v")}
      ORDER BY v.created_at DESC
    `)
    .all(pollId);

  const listenRows = db
    .prepare(`
      SELECT
        pl.id,
        pl.participant_id,
        pl.created_at,
        tu.telegram_id,
        tu.full_name,
        tu.username
      FROM participant_listens pl
      JOIN telegram_users tu ON tu.id = pl.listener_user_id
      WHERE pl.poll_id = ?
      ORDER BY pl.created_at DESC
    `)
    .all(pollId);

  const votesByWinnerId = new Map();
  voteRows.forEach((row) => {
    const current = votesByWinnerId.get(row.winner_participant_id) || [];
    current.push(row);
    votesByWinnerId.set(row.winner_participant_id, current);
  });

  const listensByParticipantId = new Map();
  listenRows.forEach((row) => {
    const current = listensByParticipantId.get(row.participant_id) || [];
    current.push(row);
    listensByParticipantId.set(row.participant_id, current);
  });

  const participantsWithVotes = participants.map((participant) => {
    const voteDetails = votesByWinnerId.get(participant.id) || [];
    const listenDetails = listensByParticipantId.get(participant.id) || [];
    const witcherBonus = participant.witcher_choice ? 2 : 0;
    return {
      ...participant,
      rawVoteCount: voteDetails.length,
      witcherBonus,
      voteCount: voteDetails.length + witcherBonus,
      uniqueVoterCount: new Set(voteDetails.map((vote) => vote.telegram_id)).size,
      voteDetails,
      listenCount: listenDetails.length,
      uniqueListenerCount: new Set(listenDetails.map((listen) => listen.telegram_id)).size,
      listenDetails,
    };
  });

  const totalAdjustedVotes = participantsWithVotes.reduce((sum, participant) => sum + participant.voteCount, 0);

  return {
    poll,
    totals: {
      participants: participantsWithVotes.length,
      votes: totalAdjustedVotes,
      rawVotes: voteRows.length,
      voters: new Set(voteRows.map((vote) => vote.telegram_id)).size,
      listens: listenRows.length,
    },
    participants: participantsWithVotes.sort((left, right) => right.voteCount - left.voteCount || left.name.localeCompare(right.name, "ru")),
    recentVotes: voteRows.slice(0, 100),
  };
}

function adminStats() {
  const totals = {
    polls: db.prepare("SELECT COUNT(*) AS count FROM polls").get().count,
    users: db.prepare("SELECT COUNT(*) AS count FROM telegram_users").get().count,
    votes: db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM votes v
        WHERE ${completedVotesFilter("v")}
      `)
      .get().count,
    listens: db.prepare("SELECT COUNT(*) AS count FROM participant_listens").get().count,
    participants: db
      .prepare("SELECT COUNT(*) AS count FROM participants WHERE is_active = 1")
      .get().count,
  };

  const leaderboard = db
    .prepare(`
      SELECT
        p.id,
        p.poll_id,
        p.name,
        p.description,
        p.image_url,
        p.embed_html,
        p.audio_file_path,
        p.audio_source_url,
        p.audio_source_type,
        p.witcher_choice,
        poll.title AS poll_title,
        COUNT(v.id) + CASE WHEN p.witcher_choice = 1 THEN 2 ELSE 0 END AS wins
      FROM participants p
      JOIN polls poll ON poll.id = p.poll_id
      LEFT JOIN votes v
        ON v.winner_participant_id = p.id
       AND ${completedVotesFilter("v")}
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY wins DESC, p.name ASC
    `)
    .all();

  const recentVotes = db
    .prepare(`
      SELECT
        v.id,
        v.created_at,
        poll.title AS poll_title,
        tu.telegram_id,
        tu.full_name,
        tu.username,
        winner.name AS winner_name,
        loser.name AS loser_name
      FROM votes v
      JOIN polls poll ON poll.id = v.poll_id
      JOIN telegram_users tu ON tu.id = v.voter_user_id
      JOIN participants winner ON winner.id = v.winner_participant_id
      JOIN participants loser ON loser.id = v.loser_participant_id
      WHERE ${completedVotesFilter("v")}
      ORDER BY v.created_at DESC
      LIMIT 100
    `)
    .all();

  const recentUsers = db
    .prepare(`
      SELECT
        id,
        telegram_id,
        full_name,
        username,
        raw_profile_json,
        first_login_at,
        last_login_at,
        login_count,
        photo_url
      FROM telegram_users
      ORDER BY last_login_at DESC
      LIMIT 100
    `)
    .all();

  const participants = db
    .prepare(`
      SELECT p.id, p.name, p.description, p.image_url, p.embed_html, p.audio_file_path, p.audio_source_url, p.audio_source_type, p.witcher_choice, p.is_active, p.created_at, p.updated_at, p.poll_id, poll.title AS poll_title, poll.slug AS poll_slug
      FROM participants p
      LEFT JOIN polls poll ON poll.id = p.poll_id
      ORDER BY p.created_at DESC
    `)
    .all()
    .map(decorateParticipant);

  const polls = getPolls();
  const pollsWithParticipants = polls.map((poll) => {
    const report = getPollReportData(poll.id);
    const pollParticipants = report?.participants || [];

    return {
      ...poll,
      participantCount: pollParticipants.length,
      voteCount: report?.totals.votes || 0,
      uniqueVoterCount: report?.totals.voters || 0,
      listenCount: report?.totals.listens || 0,
      participants: pollParticipants,
    };
  });

  return { totals, leaderboard, recentVotes, recentUsers, participants, polls, pollsWithParticipants };
}

async function populateParticipantAudio(participantId, sourceKind, sourceUrl, file) {
  const normalizedSourceUrl = normalizeMediaSourceUrl(sourceUrl);
  const resolvedSourceType = detectAudioSourceType(normalizedSourceUrl, sourceKind);
  let audioFilePath = "";

  if (resolvedSourceType === "upload") {
    if (!file) {
      throw new Error("M4A file is required for manual upload.");
    }
    audioFilePath = saveUploadedAudioFile(participantId, file);
  } else {
    if (!normalizedSourceUrl) {
      throw new Error("Source URL is required.");
    }
    audioFilePath = await downloadAudioFromUrl(participantId, normalizedSourceUrl);
  }

  db.prepare(`
    UPDATE participants
    SET embed_html = ?, audio_file_path = ?, audio_source_url = ?, audio_source_type = ?, updated_at = ?
    WHERE id = ?
  `).run(
    normalizeEmbedHtml(normalizedSourceUrl),
    audioFilePath,
    normalizedSourceUrl,
    resolvedSourceType,
    nowIso(),
    participantId,
  );
}

function verifyTelegramLogin(payload) {
  if (!TELEGRAM_BOT_TOKEN) {
    return false;
  }

  const incomingHash = String(payload.hash || "").toLowerCase();
  if (!incomingHash) {
    return false;
  }

  const dataCheckString = Object.keys(payload)
    .filter((key) => key !== "hash" && payload[key] !== undefined && payload[key] !== null && payload[key] !== "")
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("\n");

  const secretKey = crypto
    .createHash("sha256")
    .update(TELEGRAM_BOT_TOKEN)
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const authDate = Number(payload.auth_date || 0);
  const ageInSeconds = Math.floor(Date.now() / 1000) - authDate;

  if (expectedHash.length !== incomingHash.length) {
    return false;
  }

  return (
    crypto.timingSafeEqual(
      Buffer.from(expectedHash, "utf8"),
      Buffer.from(incomingHash, "utf8"),
    ) &&
    Number.isFinite(authDate) &&
    ageInSeconds >= 0 &&
    ageInSeconds < 60 * 60 * 24
  );
}

function normalizeTelegramAuthPayload(source) {
  return {
    id: source.id ? String(source.id) : "",
    first_name: source.first_name ? String(source.first_name) : "",
    last_name: source.last_name ? String(source.last_name) : "",
    username: source.username ? String(source.username) : "",
    photo_url: source.photo_url ? String(source.photo_url) : "",
    auth_date: source.auth_date ? String(source.auth_date) : "",
    hash: source.hash ? String(source.hash) : "",
  };
}

function upsertTelegramUser(profile) {
  const timestamp = nowIso();
  const telegramId = String(profile.id);

  const existing = db
    .prepare("SELECT id, login_count FROM telegram_users WHERE telegram_id = ?")
    .get(telegramId);

  if (existing) {
    db.prepare(`
      UPDATE telegram_users
      SET
        first_name = @first_name,
        last_name = @last_name,
        full_name = @full_name,
        username = @username,
        photo_url = @photo_url,
        phone_number = @phone_number,
        raw_profile_json = @raw_profile_json,
        login_count = @login_count,
        last_login_at = @last_login_at,
        updated_at = @updated_at
      WHERE telegram_id = @telegram_id
    `).run({
      telegram_id: telegramId,
      first_name: profile.first_name,
      last_name: profile.last_name,
      full_name: profile.full_name,
      username: profile.username,
      photo_url: profile.photo_url,
      phone_number: profile.phone_number,
      raw_profile_json: profile.raw_profile_json,
      login_count: existing.login_count + 1,
      last_login_at: timestamp,
      updated_at: timestamp,
    });
  } else {
    db.prepare(`
      INSERT INTO telegram_users (
        telegram_id,
        first_name,
        last_name,
        full_name,
        username,
        photo_url,
        phone_number,
        raw_profile_json,
        login_count,
        first_login_at,
        last_login_at,
        created_at,
        updated_at
      ) VALUES (
        @telegram_id,
        @first_name,
        @last_name,
        @full_name,
        @username,
        @photo_url,
        @phone_number,
        @raw_profile_json,
        @login_count,
        @first_login_at,
        @last_login_at,
        @created_at,
        @updated_at
      )
    `).run({
      telegram_id: telegramId,
      first_name: profile.first_name,
      last_name: profile.last_name,
      full_name: profile.full_name,
      username: profile.username,
      photo_url: profile.photo_url,
      phone_number: profile.phone_number,
      raw_profile_json: profile.raw_profile_json,
      login_count: 1,
      first_login_at: timestamp,
      last_login_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  return db
    .prepare(
      `SELECT
        id,
        telegram_id,
        full_name,
        username,
        phone_number,
        photo_url,
        voting_completed_at,
        final_winner_participant_id
      FROM telegram_users
      WHERE telegram_id = ?`,
    )
    .get(telegramId);
}

app.get("/", (req, res) => {
  const isAdmin = Boolean(req.session.isAdmin);
  const polls = getPolls().filter((poll) => isAdmin || poll.is_visible);
  const activePolls = polls.filter((poll) => poll.is_active);
  const postLoginReturnTo =
    activePolls.length === 1 ? `/polls/${activePolls[0].slug}` : "/";
  req.session.returnTo = postLoginReturnTo;

  res.render("polls-index", {
    polls,
    telegramConfigured: Boolean(TELEGRAM_BOT_USERNAME && TELEGRAM_BOT_TOKEN),
    telegramBotUsername: TELEGRAM_BOT_USERNAME,
    telegramAuthUrl: buildTelegramAuthUrl(postLoginReturnTo),
  });
});

app.get("/polls/:slug", (req, res) => {
  req.session.returnTo = `/polls/${req.params.slug}`;
  const poll = getPollBySlug(req.params.slug);
  if (!poll || !poll.is_active || (!poll.is_visible && !req.session.isAdmin)) {
    return res.status(404).render("error", {
      title: "Голосование не найдено",
      message: "Проверьте ссылку на голосование.",
    });
  }

  const votingProgress = req.session.user ? getVotingProgress(req.session.user.id, poll.id) : null;
  const telegramStatus =
    req.query.tg_login === "success"
      ? "Вход через Telegram выполнен."
      : req.query.tg_error === "verify_failed"
        ? "Telegram логин не прошел проверку подписи."
        : req.query.tg_error === "config"
          ? "Telegram не настроен на сервере."
          : null;

  res.render("home", {
    poll,
    votingProgress,
    error: null,
    telegramStatus,
    telegramConfigured: Boolean(TELEGRAM_BOT_USERNAME && TELEGRAM_BOT_TOKEN),
    telegramBotUsername: TELEGRAM_BOT_USERNAME,
    telegramAuthUrl: buildTelegramAuthUrl(`/polls/${poll.slug}`),
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: nowIso(),
  });
});

app.get("/polls/:slug/thanks", (req, res) => {
  const poll = getPollBySlug(req.params.slug);
  if (!poll) {
    return res.status(404).render("error", {
      title: "Голосование не найдено",
      message: "Проверьте ссылку на голосование.",
    });
  }

  res.render("thanks", {
    redirectUrl: poll.redirect_url || "https://dsipsmule.one",
  });
});

app.get("/polls/:slug/report", (req, res) => {
  const poll = getPollBySlug(req.params.slug);
  if (!poll) {
    return res.status(404).render("error", {
      title: "Отчет не найден",
      message: "Проверьте ссылку на отчет.",
    });
  }

  if (!canViewPollReport(poll, req.session.isAdmin)) {
    return res.status(403).render("error", {
      title: "Отчет пока закрыт",
      message: "Отчет станет доступен всем после закрытия этапа голосования.",
    });
  }

  const report = getPollReportData(poll.id);
  res.render("report", {
    poll,
    report,
    formatDate,
  });
});

app.get("/polls/:slug/report/export.xls", (req, res) => {
  const poll = getPollBySlug(req.params.slug);
  if (!poll) {
    return res.status(404).render("error", {
      title: "Файл не найден",
      message: "Проверьте ссылку на выгрузку отчета.",
    });
  }

  if (!canViewPollReport(poll, req.session.isAdmin)) {
    return res.status(403).render("error", {
      title: "Файл пока закрыт",
      message: "Выгрузка станет доступна после закрытия этапа голосования.",
    });
  }

  const report = getPollReportData(poll.id);
  const filename = `${slugify(poll.slug || poll.title || "report") || "report"}.xls`;

  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`\uFEFF${renderPollReportExcel(report)}`);
});

function finishTelegramLogin(req, res, payload, mode = "json") {
  const returnTo = sanitizeReturnPath(req.query.next || req.session.returnTo || "/");
  console.log("Telegram auth attempt", {
    mode,
    id: payload.id || null,
    username: payload.username || null,
    auth_date: payload.auth_date || null,
    has_hash: Boolean(payload.hash),
  });

  if (!TELEGRAM_BOT_USERNAME || !TELEGRAM_BOT_TOKEN) {
    if (mode === "redirect") {
      const separator = returnTo.includes("?") ? "&" : "?";
      return res.redirect(`${returnTo}${separator}tg_error=config`);
    }

    return res.status(500).json({
      ok: false,
      error: "Telegram widget не настроен на сервере.",
    });
  }

  if (!verifyTelegramLogin(payload)) {
    console.error("Telegram login verification failed", payload);

    if (mode === "redirect") {
      const separator = returnTo.includes("?") ? "&" : "?";
      return res.redirect(`${returnTo}${separator}tg_error=verify_failed`);
    }

    return res.status(401).json({
      ok: false,
      error: "Не удалось проверить подпись Telegram.",
    });
  }

  const profile = {
    id: payload.id,
    first_name: String(payload.first_name || ""),
    last_name: String(payload.last_name || ""),
    full_name: buildFullName(payload),
    username: String(payload.username || ""),
    photo_url: String(payload.photo_url || ""),
    phone_number: "",
    raw_profile_json: JSON.stringify(payload),
  };

  const user = upsertTelegramUser(profile);
  req.session.user = user;
  req.session.save(() => {
    console.log("Telegram auth success", {
      telegram_id: user.telegram_id,
      username: user.username,
    });

    if (mode === "redirect") {
      const separator = returnTo.includes("?") ? "&" : "?";
      return res.redirect(`${returnTo}${separator}tg_login=success`);
    }

    return res.json({ ok: true });
  });
}

app.get("/auth/telegram/widget", (req, res) => {
  const payload = normalizeTelegramAuthPayload(req.query || {});
  finishTelegramLogin(req, res, payload, "redirect");
});

app.post("/auth/telegram/widget", (req, res) => {
  const payload = normalizeTelegramAuthPayload(req.body || {});
  finishTelegramLogin(req, res, payload, "json");
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.post("/polls/:slug/participants/:id/listen", ensureUser, (req, res) => {
  const participantId = Number(req.params.id);
  const poll = getPollBySlug(req.params.slug);

  if (!poll || !poll.is_active || (!poll.is_visible && !req.session.isAdmin)) {
    return res.status(404).json({ ok: false, error: "Голосование не найдено." });
  }

  const participant = db
    .prepare(`
      SELECT id
      FROM participants
      WHERE id = ? AND poll_id = ? AND is_active = 1
    `)
    .get(participantId, poll.id);

  if (!participant) {
    return res.status(404).json({ ok: false, error: "Запись не найдена." });
  }

  db.prepare(`
    INSERT INTO participant_listens (
      poll_id,
      participant_id,
      listener_user_id,
      ip_address,
      user_agent,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    poll.id,
    participantId,
    req.session.user.id,
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    req.headers["user-agent"] || "",
    nowIso(),
  );

  res.json({ ok: true });
});

app.post("/vote", ensureUser, (req, res) => {
  const pollId = Number(req.body.poll_id);
  const pollSlug = String(req.body.poll_slug || "");
  const winnerId = Number(req.body.winner_id);
  const userId = req.session.user.id;
  const poll = db.prepare("SELECT id, slug FROM polls WHERE id = ?").get(pollId);

  if (!poll) {
    return res.status(400).render("error", {
      title: "Ошибка голосования",
      message: "Голосование не найдено.",
    });
  }

  const progress = getVotingProgress(userId, pollId);

  if (progress.status === "completed") {
    return res.redirect(`/polls/${poll.slug}/thanks`);
  }

  if (progress.status !== "active") {
    return res.status(400).render("error", {
      title: "Ошибка голосования",
      message: "Сейчас голосование недоступно.",
    });
  }

  const choiceIds = progress.participants.map((participant) => participant.id);
  if (!winnerId || !choiceIds.includes(winnerId)) {
    return res.status(400).render("error", {
      title: "Ошибка голосования",
      message: "Неверный выбор для текущего этапа.",
    });
  }

  const rawUserState = db
    .prepare("SELECT voting_state_json FROM user_poll_progress WHERE user_id = ? AND poll_id = ?")
    .get(userId, pollId);
  const state = ensureCurrentChoices(parseVotingState(rawUserState?.voting_state_json) || createVotingState([]));

  const stateChoices = [...state.currentChoices].sort((left, right) => left - right);
  const requestChoices = [...choiceIds].sort((left, right) => left - right);
  if (JSON.stringify(stateChoices) !== JSON.stringify(requestChoices)) {
    return res.status(409).render("error", {
      title: "Голосование изменилось",
      message: "Обновите страницу и попробуйте снова.",
    });
  }

  const voteTimestamp = nowIso();
  const recordedLoserId = choiceIds.find((id) => id !== winnerId) || winnerId;
  db.prepare(`
    INSERT INTO votes (
      poll_id,
      voter_user_id,
      winner_participant_id,
      loser_participant_id,
      ip_address,
      user_agent,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    pollId,
    userId,
    winnerId,
    recordedLoserId,
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    req.headers["user-agent"] || "",
    voteTimestamp,
  );
  const voteId = Number(db.prepare("SELECT last_insert_rowid() AS id").get().id);

  state.history.push({
    currentChoices: [...state.currentChoices],
    remainingIds: [...state.remainingIds],
    stepNumber: Number(state.stepNumber || 1),
    voteId,
  });

  state.currentChoices = [];
  const nextState = ensureCurrentChoices(state);

  if (nextState.currentChoices.length === 0 && nextState.remainingIds.length === 0) {
    db.prepare(`
      UPDATE user_poll_progress
      SET voting_state_json = ?, completed_at = ?, final_winner_participant_id = NULL, updated_at = ?
      WHERE user_id = ? AND poll_id = ?
    `).run(JSON.stringify(nextState), voteTimestamp, voteTimestamp, userId, pollId);

    return res.redirect(`/polls/${pollSlug || poll.slug}/thanks`);
  } else {
    db.prepare("UPDATE user_poll_progress SET voting_state_json = ?, updated_at = ? WHERE user_id = ? AND poll_id = ?").run(
      JSON.stringify({
        ...nextState,
        stepNumber: Number(nextState.stepNumber || 1) + 1,
      }),
      voteTimestamp,
      userId,
      pollId,
    );
  }

  res.redirect(`/polls/${pollSlug || poll.slug}`);
});

app.post("/vote/back", ensureUser, (req, res) => {
  const pollId = Number(req.body.poll_id);
  const pollSlug = String(req.body.poll_slug || "");
  const userId = req.session.user.id;
  const poll = db.prepare("SELECT id, slug FROM polls WHERE id = ?").get(pollId);

  if (!poll) {
    return res.status(400).render("error", {
      title: "Ошибка возврата",
      message: "Голосование не найдено.",
    });
  }

  const progressRow = db
    .prepare(`
      SELECT voting_state_json, completed_at
      FROM user_poll_progress
      WHERE user_id = ? AND poll_id = ?
    `)
    .get(userId, pollId);

  if (progressRow?.completed_at) {
    return res.redirect(`/polls/${pollSlug || poll.slug}/thanks`);
  }

  const state = ensureCurrentChoices(parseVotingState(progressRow?.voting_state_json) || createVotingState([]));
  const lastStep = state.history.pop();

  if (!lastStep) {
    return res.redirect(`/polls/${pollSlug || poll.slug}`);
  }

  db.prepare("DELETE FROM votes WHERE id = ? AND voter_user_id = ? AND poll_id = ?").run(
    Number(lastStep.voteId || 0),
    userId,
    pollId,
  );

  const restoredState = {
    ...state,
    currentChoices: Array.isArray(lastStep.currentChoices) ? lastStep.currentChoices : [],
    remainingIds: Array.isArray(lastStep.remainingIds) ? lastStep.remainingIds : [],
    stepNumber: Number(lastStep.stepNumber || 1),
  };

  db.prepare(`
    UPDATE user_poll_progress
    SET voting_state_json = ?, completed_at = NULL, final_winner_participant_id = NULL, updated_at = ?
    WHERE user_id = ? AND poll_id = ?
  `).run(JSON.stringify(restoredState), nowIso(), userId, pollId);

  res.redirect(`/polls/${pollSlug || poll.slug}`);
});

app.get("/admin/login", (req, res) => {
  res.render("admin-login", { error: null });
});

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }

  res.status(401).render("admin-login", {
    error: "Неверный логин или пароль.",
  });
});

app.post("/admin/logout", ensureAdmin, (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/admin/login");
});

app.get("/admin", ensureAdmin, (req, res) => {
  res.render("admin-dashboard", {
    ...adminStats(),
    formatDate,
    baseUrl: BASE_URL,
  });
});

app.post("/admin/polls", ensureAdmin, upload.single("image_file"), (req, res) => {
  const title = String(req.body.title || "").trim();
  const slugInput = String(req.body.slug || "").trim();
  const description = String(req.body.description || "").trim();
  const imageUrl = String(req.body.image_url || "").trim();
  const redirectUrl = String(req.body.redirect_url || "").trim() || "https://dsipsmule.one";
  const slug = slugify(slugInput || title);

  if (!title || !slug) {
    return res.redirect("/admin");
  }

  const existing = db.prepare("SELECT id FROM polls WHERE slug = ?").get(slug);
  if (existing) {
    return res.redirect("/admin");
  }

  const timestamp = nowIso();
  const result = db.prepare(`
    INSERT INTO polls (title, slug, description, image_url, redirect_url, is_visible, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(title, slug, description, imageUrl, redirectUrl, timestamp, timestamp);

  const pollId = Number(result.lastInsertRowid);

  try {
    if (req.file) {
      const localImageUrl = savePollImageFile(pollId, req.file);
      db.prepare("UPDATE polls SET image_url = ?, updated_at = ? WHERE id = ?").run(
        localImageUrl,
        nowIso(),
        pollId,
      );
    }
  } catch (error) {
    clearPollImageFiles(pollId);
    db.prepare("DELETE FROM polls WHERE id = ?").run(pollId);
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    return res.status(400).render("error", {
      title: "Ошибка картинки этапа",
      message: error.message || "Не удалось сохранить картинку этапа.",
    });
  }

  res.redirect("/admin");
});

app.post("/admin/polls/:id/update", ensureAdmin, upload.single("image_file"), (req, res) => {
  const pollId = Number(req.params.id);
  const poll = db.prepare("SELECT id FROM polls WHERE id = ?").get(pollId);
  const imageUrl = String(req.body.image_url || "").trim();

  if (!poll) {
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    return res.redirect("/admin");
  }

  try {
    let nextImageUrl = imageUrl;

    if (req.file) {
      nextImageUrl = savePollImageFile(pollId, req.file);
    }

    db.prepare("UPDATE polls SET image_url = ?, updated_at = ? WHERE id = ?").run(
      nextImageUrl,
      nowIso(),
      pollId,
    );
    res.redirect("/admin");
  } catch (error) {
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    res.status(400).render("error", {
      title: "Ошибка обновления картинки",
      message: error.message || "Не удалось обновить картинку этапа.",
    });
  }
});

app.post("/admin/polls/:id/visibility", ensureAdmin, (req, res) => {
  const pollId = Number(req.params.id);
  const poll = db
    .prepare("SELECT id, is_visible FROM polls WHERE id = ?")
    .get(pollId);

  if (!poll) {
    return res.redirect("/admin");
  }

  db.prepare("UPDATE polls SET is_visible = ?, updated_at = ? WHERE id = ?").run(
    poll.is_visible ? 0 : 1,
    nowIso(),
    pollId,
  );

  res.redirect("/admin");
});

app.post("/admin/polls/:id/toggle", ensureAdmin, (req, res) => {
  const pollId = Number(req.params.id);
  const poll = db
    .prepare("SELECT id, is_active FROM polls WHERE id = ?")
    .get(pollId);

  if (!poll) {
    return res.redirect("/admin");
  }

  db.prepare("UPDATE polls SET is_active = ?, updated_at = ? WHERE id = ?").run(
    poll.is_active ? 0 : 1,
    nowIso(),
    pollId,
  );

  res.redirect("/admin");
});

app.post("/admin/polls/:id/delete", ensureAdmin, (req, res) => {
  const pollId = Number(req.params.id);
  const poll = db.prepare("SELECT id FROM polls WHERE id = ?").get(pollId);

  if (!poll) {
    return res.redirect("/admin");
  }

  const deletePollTx = db.transaction(() => {
    const participantsToDelete = db.prepare("SELECT id FROM participants WHERE poll_id = ?").all(pollId);
    participantsToDelete.forEach((participant) => {
      clearParticipantAudioFiles(participant.id);
    });
    clearPollImageFiles(pollId);
    db.prepare("DELETE FROM participant_listens WHERE poll_id = ?").run(pollId);
    db.prepare("DELETE FROM votes WHERE poll_id = ?").run(pollId);
    db.prepare("DELETE FROM user_poll_progress WHERE poll_id = ?").run(pollId);
    db.prepare("DELETE FROM participants WHERE poll_id = ?").run(pollId);
    db.prepare("DELETE FROM polls WHERE id = ?").run(pollId);
  });

  deletePollTx();
  res.redirect("/admin");
});

app.post("/admin/participants", ensureAdmin, upload.single("audio_file"), async (req, res) => {
  const pollId = Number(req.body.poll_id);
  const name = String(req.body.name || "").trim();
  const sourceKind = String(req.body.source_kind || "").trim();
  const sourceUrl = String(req.body.source_url || "").trim();

  if (!pollId || !name || !sourceKind) {
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    return res.redirect("/admin");
  }

  const timestamp = nowIso();
  const result = db.prepare(`
    INSERT INTO participants (poll_id, name, description, image_url, embed_html, audio_file_path, audio_source_url, audio_source_type, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(pollId, name, "", "", "", "", "", "", timestamp, timestamp);

  const participantId = Number(result.lastInsertRowid);

  try {
    await populateParticipantAudio(participantId, sourceKind, sourceUrl, req.file);
    if (req.file?.path && sourceKind !== "upload") {
      fs.rmSync(req.file.path, { force: true });
    }
    res.redirect("/admin");
  } catch (error) {
    clearParticipantAudioFiles(participantId);
    db.prepare("DELETE FROM participants WHERE id = ?").run(participantId);
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    res.status(400).render("error", {
      title: "Ошибка загрузки аудио",
      message: error.message || "Не удалось подготовить аудиофайл участника.",
    });
  }
});

app.post("/admin/participants/:id/update", ensureAdmin, upload.single("audio_file"), async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || "").trim();
  const sourceKind = String(req.body.source_kind || "").trim();
  const sourceUrl = String(req.body.source_url || "").trim();

  const participant = db
    .prepare("SELECT id FROM participants WHERE id = ?")
    .get(id);

  if (!participant || !name) {
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    return res.redirect("/admin");
  }

  db.prepare(`
    UPDATE participants
    SET name = ?, updated_at = ?
    WHERE id = ?
  `).run(name, nowIso(), id);

  if (!sourceKind) {
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    return res.redirect("/admin");
  }

  try {
    await populateParticipantAudio(id, sourceKind, sourceUrl, req.file);
    if (req.file?.path && sourceKind !== "upload") {
      fs.rmSync(req.file.path, { force: true });
    }
    res.redirect("/admin");
  } catch (error) {
    if (req.file?.path) {
      fs.rmSync(req.file.path, { force: true });
    }
    res.status(400).render("error", {
      title: "Ошибка обновления аудио",
      message: error.message || "Не удалось обновить аудиофайл участника.",
    });
  }
});

app.post("/admin/participants/:id/toggle", ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const participant = db
    .prepare("SELECT id, is_active FROM participants WHERE id = ?")
    .get(id);

  if (!participant) {
    return res.redirect("/admin");
  }

  db.prepare("UPDATE participants SET is_active = ?, updated_at = ? WHERE id = ?").run(
    participant.is_active ? 0 : 1,
    nowIso(),
    id,
  );

  res.redirect("/admin");
});

app.post("/admin/participants/:id/witcher-toggle", ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const participant = db
    .prepare("SELECT id, witcher_choice FROM participants WHERE id = ?")
    .get(id);

  if (!participant) {
    return res.redirect("/admin");
  }

  db.prepare("UPDATE participants SET witcher_choice = ?, updated_at = ? WHERE id = ?").run(
    participant.witcher_choice ? 0 : 1,
    nowIso(),
    id,
  );

  res.redirect("/admin");
});

app.post("/admin/participants/:id/delete", ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const participant = db
    .prepare("SELECT id, poll_id FROM participants WHERE id = ?")
    .get(id);

  if (!participant) {
    return res.redirect("/admin");
  }

  const deleteParticipantTx = db.transaction(() => {
    clearParticipantAudioFiles(id);
    db.prepare("DELETE FROM participant_listens WHERE participant_id = ?").run(id);
    db.prepare(`
      DELETE FROM votes
      WHERE winner_participant_id = ? OR loser_participant_id = ?
    `).run(id, id);

    db.prepare("DELETE FROM user_poll_progress WHERE poll_id = ?").run(participant.poll_id);
    db.prepare("DELETE FROM participants WHERE id = ?").run(id);
  });

  deleteParticipantTx();
  res.redirect("/admin");
});

app.post("/admin/users/:id/reset-votes", ensureAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const user = db.prepare("SELECT id FROM telegram_users WHERE id = ?").get(userId);

  if (!user) {
    return res.redirect("/admin");
  }

  const resetVotesTx = db.transaction(() => {
    db.prepare("DELETE FROM participant_listens WHERE listener_user_id = ?").run(userId);
    db.prepare("DELETE FROM votes WHERE voter_user_id = ?").run(userId);
    db.prepare("DELETE FROM user_poll_progress WHERE user_id = ?").run(userId);
  });

  resetVotesTx();
  res.redirect("/admin");
});

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Страница не найдена",
    message: "Проверьте адрес или вернитесь на главную.",
    redirectUrl: "/",
    redirectDelay: 5,
  });
});

app.listen(PORT, () => {
  console.log(`Voting service listening on ${BASE_URL}`);
});

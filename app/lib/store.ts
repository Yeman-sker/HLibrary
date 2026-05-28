import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type FileStatus = "active" | "archived" | "trashed";

export type HtmlMeta = {
  tags: string[];
  notes: string;
  favorite: boolean;
  status: FileStatus;
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
  originalPath?: string;
};

export type HtmlFile = {
  id: string;
  name: string;
  title: string;
  project: string;
  relativePath: string;
  directory: string;
  size: number;
  modifiedAt: string;
  wordCount: number;
  headingCount: number;
  linkCount: number;
  snippet: string;
  meta: HtmlMeta;
};

type Catalog = {
  files: Record<string, HtmlMeta>;
};

const root = process.env.HTML_MANAGER_ROOT
  ? path.resolve(process.env.HTML_MANAGER_ROOT)
  : path.resolve(process.cwd(), "..");

const stateDir = path.join(root, ".html-manager");
const catalogPath = path.join(stateDir, "catalog.json");
const trashDir = path.join(stateDir, "trash");

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".codegraph",
  ".html-manager",
  "node_modules",
  "html-manager"
]);

export function workspaceRoot() {
  return root;
}

export function fileId(relativePath: string) {
  return createHash("sha1").update(relativePath).digest("hex").slice(0, 16);
}

function normalizeRelative(input: string) {
  return input.split(path.sep).join("/");
}

function projectFromRelative(relativePath: string) {
  return relativePath.split("/")[0] || "root";
}

function safeRelativePath(input: string) {
  const parts = normalizeRelative(input)
    .split("/")
    .map((part) => part.replace(/[\\:*?"<>|]/g, "-").trim())
    .filter((part) => part && part !== "." && part !== "..");
  const nextPath = parts.join("/");
  if (!nextPath.toLowerCase().endsWith(".html")) throw new Error("Only .html files can be imported");
  return nextPath;
}

function safeProjectName(input: string) {
  const name = input.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!name || name === "." || name === "..") throw new Error("Project name is required");
  if (name.includes("/")) throw new Error("Project name must be a single folder name");
  return name;
}

function assertInsideRoot(target: string) {
  const resolved = path.resolve(root, target);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Path escapes workspace root");
  }
  return resolved;
}

async function ensureState() {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(trashDir, { recursive: true });
}

async function readCatalog(): Promise<Catalog> {
  await ensureState();
  try {
    return JSON.parse(await fs.readFile(catalogPath, "utf8"));
  } catch {
    return { files: {} };
  }
}

async function writeCatalog(catalog: Catalog) {
  await ensureState();
  await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
}

async function relocateMeta(fromId: string, toRelativePath: string) {
  const catalog = await readCatalog();
  const toId = fileId(toRelativePath);
  if (catalog.files[fromId]) {
    catalog.files[toId] = {
      ...catalog.files[fromId],
      updatedAt: new Date().toISOString()
    };
    delete catalog.files[fromId];
    await writeCatalog(catalog);
  }
  return toId;
}

function defaultMeta(): HtmlMeta {
  const now = new Date().toISOString();
  return {
    tags: [],
    notes: "",
    favorite: false,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

async function walkHtmlFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      results.push(...(await walkHtmlFiles(full, base)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      results.push(normalizeRelative(path.relative(base, full)));
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function textFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return textFromHtml(title || h1 || fallback).slice(0, 120) || fallback;
}

async function buildFile(relativePath: string, catalog: Catalog): Promise<HtmlFile> {
  const absolutePath = assertInsideRoot(relativePath);
  const stat = await fs.stat(absolutePath);
  const html = await fs.readFile(absolutePath, "utf8");
  const text = textFromHtml(html);
  const id = fileId(relativePath);
  const meta = catalog.files[id] || defaultMeta();

  return {
    id,
    name: path.basename(relativePath),
    title: titleFromHtml(html, path.basename(relativePath)),
    project: projectFromRelative(relativePath),
    relativePath,
    directory: normalizeRelative(path.dirname(relativePath)),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    wordCount: text ? text.split(/\s+/).length : 0,
    headingCount: (html.match(/<h[1-6][\s>]/gi) || []).length,
    linkCount: (html.match(/<a[\s>]/gi) || []).length,
    snippet: text.slice(0, 220),
    meta
  };
}

export async function listHtmlFiles() {
  const catalog = await readCatalog();
  const paths = await walkHtmlFiles(root);
  const files = await Promise.all(paths.map((filePath) => buildFile(filePath, catalog)));
  return files.filter((file) => file.meta.status !== "trashed");
}

export async function getHtmlFile(id: string) {
  const files = await listHtmlFiles();
  const file = files.find((item) => item.id === id);
  if (!file) throw new Error("HTML file not found");
  return file;
}

export async function getHtmlContent(id: string) {
  const file = await getHtmlFile(id);
  return fs.readFile(assertInsideRoot(file.relativePath), "utf8");
}

export async function updateHtmlContent(id: string, html: string) {
  const file = await getHtmlFile(id);
  await fs.writeFile(assertInsideRoot(file.relativePath), html);
  await updateMeta(id, {});
  return getHtmlFile(id);
}

export async function updateMeta(id: string, patch: Partial<HtmlMeta>) {
  const catalog = await readCatalog();
  const current = catalog.files[id] || defaultMeta();
  catalog.files[id] = {
    ...current,
    ...patch,
    tags: patch.tags ? Array.from(new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))) : current.tags,
    updatedAt: new Date().toISOString()
  };
  await writeCatalog(catalog);
  return catalog.files[id];
}

export async function renameFile(id: string, nextName: string) {
  const file = await getHtmlFile(id);
  const safeName = nextName.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!safeName.toLowerCase().endsWith(".html")) throw new Error("Name must end with .html");
  const from = assertInsideRoot(file.relativePath);
  const toRelative = normalizeRelative(path.join(path.dirname(file.relativePath), safeName));
  const to = assertInsideRoot(toRelative);
  await fs.rename(from, to);
  return { relativePath: toRelative, id: await relocateMeta(id, toRelative) };
}

export async function moveFile(id: string, nextDirectory: string) {
  const file = await getHtmlFile(id);
  const directory = normalizeRelative(nextDirectory || ".");
  const toDir = assertInsideRoot(directory);
  await fs.mkdir(toDir, { recursive: true });
  const toRelative = normalizeRelative(path.join(directory, file.name));
  await fs.rename(assertInsideRoot(file.relativePath), assertInsideRoot(toRelative));
  return { relativePath: toRelative, id: await relocateMeta(id, toRelative) };
}

export async function renameProject(oldName: string, nextName: string) {
  const fromName = safeProjectName(oldName);
  const toName = safeProjectName(nextName);
  if (fromName === toName) return { project: toName, moved: 0 };

  const from = assertInsideRoot(fromName);
  const to = assertInsideRoot(toName);

  try {
    const stat = await fs.stat(from);
    if (!stat.isDirectory()) throw new Error("Project is not a folder");
  } catch {
    throw new Error("Project folder not found");
  }

  try {
    await fs.stat(to);
    throw new Error("Target project already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const oldPaths = await walkHtmlFiles(from, root);
  await fs.rename(from, to);

  const catalog = await readCatalog();
  const now = new Date().toISOString();
  for (const oldPath of oldPaths) {
    const nextPath = normalizeRelative(path.join(toName, path.relative(fromName, oldPath)));
    const oldId = fileId(oldPath);
    const nextId = fileId(nextPath);
    if (catalog.files[oldId]) {
      catalog.files[nextId] = {
        ...catalog.files[oldId],
        updatedAt: now
      };
      delete catalog.files[oldId];
    }
  }
  await writeCatalog(catalog);

  return { project: toName, moved: oldPaths.length };
}

export async function duplicateFile(id: string) {
  const file = await getHtmlFile(id);
  const parsed = path.parse(file.name);
  const copyName = `${parsed.name}.copy-${Date.now()}${parsed.ext}`;
  const toRelative = normalizeRelative(path.join(path.dirname(file.relativePath), copyName));
  await fs.copyFile(assertInsideRoot(file.relativePath), assertInsideRoot(toRelative));
  return { relativePath: toRelative, id: fileId(toRelative) };
}

export async function trashFile(id: string) {
  const file = await getHtmlFile(id);
  const trashedName = `${id}-${file.name}`;
  const trashRelative = normalizeRelative(path.relative(root, path.join(trashDir, trashedName)));
  await fs.rename(assertInsideRoot(file.relativePath), assertInsideRoot(trashRelative));
  await updateMeta(id, { status: "trashed", originalPath: file.relativePath });
  return { trashedPath: trashRelative };
}

export async function importHtml(name: string, html: string, directory = "imports") {
  const safeName = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  const fileName = safeName.toLowerCase().endsWith(".html") ? safeName : `${safeName}.html`;
  const dir = assertInsideRoot(directory);
  await fs.mkdir(dir, { recursive: true });
  const relativePath = normalizeRelative(path.join(directory, fileName));
  await fs.writeFile(assertInsideRoot(relativePath), html);
  return { relativePath, id: fileId(relativePath) };
}

export async function importHtmlAtPath(relativePath: string, html: string) {
  const safePath = safeRelativePath(relativePath);
  await fs.mkdir(path.dirname(assertInsideRoot(safePath)), { recursive: true });
  await fs.writeFile(assertInsideRoot(safePath), html);
  return { relativePath: safePath, id: fileId(safePath) };
}

export async function getStats() {
  const files = await listHtmlFiles();
  const tags = new Map<string, number>();
  for (const file of files) {
    for (const tag of file.meta.tags) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  return {
    root,
    total: files.length,
    favorites: files.filter((file) => file.meta.favorite).length,
    archived: files.filter((file) => file.meta.status === "archived").length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    tags: Array.from(tags.entries()).map(([name, count]) => ({ name, count }))
  };
}

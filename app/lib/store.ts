import { createHash } from "crypto";
import { copy, del, get, list, put, type ListBlobResultBlob } from "@vercel/blob";
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
const blobRoot = "html-manager";
const blobFilesPrefix = `${blobRoot}/files/`;
const blobTrashPrefix = `${blobRoot}/trash/`;
const blobCatalogPath = `${blobRoot}/state/catalog.json`;
const blobAccess = "private";

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".codegraph",
  ".html-manager",
  "node_modules",
  "html-manager"
]);

function workspaceRoot() {
  return isBlobStorageEnabled() ? `vercel-blob://${blobRoot}` : root;
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

function isBlobStorageEnabled() {
  if (process.env.HTML_MANAGER_STORAGE === "fs") return false;
  return process.env.HTML_MANAGER_STORAGE === "blob" || Boolean(process.env.VERCEL);
}

function assertBlobReady() {
  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) return;
  throw new Error("Vercel Blob storage is not configured. Connect a Blob store to this project so BLOB_READ_WRITE_TOKEN is available.");
}

function htmlBlobPath(relativePath: string) {
  return `${blobFilesPrefix}${relativePath}`;
}

function trashBlobPath(id: string, name: string) {
  return `${blobTrashPrefix}${id}-${name}`;
}

async function putBlobText(pathname: string, body: string, contentType: string) {
  assertBlobReady();
  await put(pathname, body, {
    access: blobAccess,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType
  });
}

async function readBlobText(pathname: string) {
  assertBlobReady();
  const result = await get(pathname, { access: blobAccess, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("HTML file not found");
  return new Response(result.stream).text();
}

async function listAllBlobs(prefix: string) {
  assertBlobReady();
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

function relativeFromBlobPath(pathname: string) {
  return pathname.slice(blobFilesPrefix.length);
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

async function readBlobCatalog(): Promise<Catalog> {
  try {
    return JSON.parse(await readBlobText(blobCatalogPath));
  } catch (error) {
    if (error instanceof Error && error.message === "HTML file not found") return { files: {} };
    throw error;
  }
}

async function writeBlobCatalog(catalog: Catalog) {
  await putBlobText(blobCatalogPath, JSON.stringify(catalog, null, 2), "application/json; charset=utf-8");
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
  const nested: Promise<string[]>[] = [];
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      nested.push(walkHtmlFiles(full, base));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      results.push(normalizeRelative(path.relative(base, full)));
    }
  }

  for (const paths of await Promise.all(nested)) results.push(...paths);
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
  const [stat, html] = await Promise.all([fs.stat(absolutePath), fs.readFile(absolutePath, "utf8")]);
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

async function buildBlobFile(blob: ListBlobResultBlob, catalog: Catalog): Promise<HtmlFile> {
  const relativePath = relativeFromBlobPath(blob.pathname);
  const html = await readBlobText(blob.pathname);
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
    size: blob.size,
    modifiedAt: blob.uploadedAt.toISOString(),
    wordCount: text ? text.split(/\s+/).length : 0,
    headingCount: (html.match(/<h[1-6][\s>]/gi) || []).length,
    linkCount: (html.match(/<a[\s>]/gi) || []).length,
    snippet: text.slice(0, 220),
    meta
  };
}

async function listBlobHtmlFiles() {
  const catalog = await readBlobCatalog();
  const blobs = (await listAllBlobs(blobFilesPrefix)).filter((blob) => blob.pathname.toLowerCase().endsWith(".html"));
  const files = await Promise.all(blobs.map((blob) => buildBlobFile(blob, catalog)));
  return files.filter((file) => file.meta.status !== "trashed");
}

async function getBlobHtmlFile(id: string) {
  const files = await listBlobHtmlFiles();
  const file = files.find((item) => item.id === id);
  if (!file) throw new Error("HTML file not found");
  return file;
}

async function relocateBlobMeta(fromId: string, toRelativePath: string) {
  const catalog = await readBlobCatalog();
  const toId = fileId(toRelativePath);
  if (catalog.files[fromId]) {
    catalog.files[toId] = {
      ...catalog.files[fromId],
      updatedAt: new Date().toISOString()
    };
    delete catalog.files[fromId];
    await writeBlobCatalog(catalog);
  }
  return toId;
}

export async function listHtmlFiles() {
  if (isBlobStorageEnabled()) return listBlobHtmlFiles();

  const [catalog, paths] = await Promise.all([readCatalog(), walkHtmlFiles(root)]);
  const files = await Promise.all(paths.map((filePath) => buildFile(filePath, catalog)));
  return files.filter((file) => file.meta.status !== "trashed");
}

async function getHtmlFile(id: string) {
  if (isBlobStorageEnabled()) return getBlobHtmlFile(id);

  const files = await listHtmlFiles();
  const file = files.find((item) => item.id === id);
  if (!file) throw new Error("HTML file not found");
  return file;
}

export async function getHtmlContent(id: string) {
  if (isBlobStorageEnabled()) {
    const file = await getBlobHtmlFile(id);
    return readBlobText(htmlBlobPath(file.relativePath));
  }

  const file = await getHtmlFile(id);
  return fs.readFile(assertInsideRoot(file.relativePath), "utf8");
}

export async function updateHtmlContent(id: string, html: string) {
  if (isBlobStorageEnabled()) {
    const file = await getBlobHtmlFile(id);
    await Promise.all([putBlobText(htmlBlobPath(file.relativePath), html, "text/html; charset=utf-8"), updateMeta(id, {})]);
    return getBlobHtmlFile(id);
  }

  const file = await getHtmlFile(id);
  await Promise.all([fs.writeFile(assertInsideRoot(file.relativePath), html), updateMeta(id, {})]);
  return getHtmlFile(id);
}

export async function updateMeta(id: string, patch: Partial<HtmlMeta>) {
  if (isBlobStorageEnabled()) {
    const catalog = await readBlobCatalog();
    const current = catalog.files[id] || defaultMeta();
    catalog.files[id] = {
      ...current,
      ...patch,
      tags: patch.tags ? Array.from(new Set(patch.tags.flatMap((tag) => {
        const nextTag = tag.trim();
        return nextTag ? [nextTag] : [];
      }))) : current.tags,
      updatedAt: new Date().toISOString()
    };
    await writeBlobCatalog(catalog);
    return catalog.files[id];
  }

  const catalog = await readCatalog();
  const current = catalog.files[id] || defaultMeta();
  catalog.files[id] = {
    ...current,
    ...patch,
    tags: patch.tags ? Array.from(new Set(patch.tags.flatMap((tag) => {
      const nextTag = tag.trim();
      return nextTag ? [nextTag] : [];
    }))) : current.tags,
    updatedAt: new Date().toISOString()
  };
  await writeCatalog(catalog);
  return catalog.files[id];
}

export async function renameFile(id: string, nextName: string) {
  if (isBlobStorageEnabled()) {
    const file = await getBlobHtmlFile(id);
    const safeName = nextName.replace(/[\\/:*?"<>|]/g, "-").trim();
    if (!safeName.toLowerCase().endsWith(".html")) throw new Error("Name must end with .html");
    const toRelative = normalizeRelative(path.join(path.dirname(file.relativePath), safeName));
    await copy(htmlBlobPath(file.relativePath), htmlBlobPath(toRelative), {
      access: blobAccess,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "text/html; charset=utf-8"
    });
    await del(htmlBlobPath(file.relativePath));
    return { relativePath: toRelative, id: await relocateBlobMeta(id, toRelative) };
  }

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
  if (isBlobStorageEnabled()) {
    const file = await getBlobHtmlFile(id);
    const directory = normalizeRelative(nextDirectory || ".");
    const toRelative = safeRelativePath(path.join(directory, file.name));
    await copy(htmlBlobPath(file.relativePath), htmlBlobPath(toRelative), {
      access: blobAccess,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "text/html; charset=utf-8"
    });
    await del(htmlBlobPath(file.relativePath));
    return { relativePath: toRelative, id: await relocateBlobMeta(id, toRelative) };
  }

  const file = await getHtmlFile(id);
  const directory = normalizeRelative(nextDirectory || ".");
  const toDir = assertInsideRoot(directory);
  await fs.mkdir(toDir, { recursive: true });
  const toRelative = normalizeRelative(path.join(directory, file.name));
  await fs.rename(assertInsideRoot(file.relativePath), assertInsideRoot(toRelative));
  return { relativePath: toRelative, id: await relocateMeta(id, toRelative) };
}

export async function renameProject(oldName: string, nextName: string) {
  if (isBlobStorageEnabled()) {
    const fromName = safeProjectName(oldName);
    const toName = safeProjectName(nextName);
    if (fromName === toName) return { project: toName, moved: 0 };

    const [oldBlobs, targetBlobs, catalog] = await Promise.all([
      listAllBlobs(`${blobFilesPrefix}${fromName}/`),
      listAllBlobs(`${blobFilesPrefix}${toName}/`),
      readBlobCatalog()
    ]);
    if (!oldBlobs.length) throw new Error("Project folder not found");

    if (targetBlobs.length) throw new Error("Target project already exists");

    const now = new Date().toISOString();
    for (const blob of oldBlobs) {
      const oldPath = relativeFromBlobPath(blob.pathname);
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
    await Promise.all(
      oldBlobs.map((blob) => {
        const oldPath = relativeFromBlobPath(blob.pathname);
        const nextPath = normalizeRelative(path.join(toName, path.relative(fromName, oldPath)));
        return copy(blob.pathname, htmlBlobPath(nextPath), {
          access: blobAccess,
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          contentType: "text/html; charset=utf-8"
        });
      })
    );
    await Promise.all([del(oldBlobs.map((blob) => blob.pathname)), writeBlobCatalog(catalog)]);

    return { project: toName, moved: oldBlobs.length };
  }

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
  if (isBlobStorageEnabled()) {
    const file = await getBlobHtmlFile(id);
    const parsed = path.parse(file.name);
    const copyName = `${parsed.name}.copy-${Date.now()}${parsed.ext}`;
    const toRelative = normalizeRelative(path.join(path.dirname(file.relativePath), copyName));
    await copy(htmlBlobPath(file.relativePath), htmlBlobPath(toRelative), {
      access: blobAccess,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: "text/html; charset=utf-8"
    });
    return { relativePath: toRelative, id: fileId(toRelative) };
  }

  const file = await getHtmlFile(id);
  const parsed = path.parse(file.name);
  const copyName = `${parsed.name}.copy-${Date.now()}${parsed.ext}`;
  const toRelative = normalizeRelative(path.join(path.dirname(file.relativePath), copyName));
  await fs.copyFile(assertInsideRoot(file.relativePath), assertInsideRoot(toRelative));
  return { relativePath: toRelative, id: fileId(toRelative) };
}

export async function trashFile(id: string) {
  if (isBlobStorageEnabled()) {
    const file = await getBlobHtmlFile(id);
    await Promise.all([
      copy(htmlBlobPath(file.relativePath), trashBlobPath(id, file.name), {
        access: blobAccess,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "text/html; charset=utf-8"
      }),
      del(htmlBlobPath(file.relativePath)),
      updateMeta(id, { status: "trashed", originalPath: file.relativePath })
    ]);
    return { trashedPath: `${blobTrashPrefix}${id}-${file.name}` };
  }

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
  if (isBlobStorageEnabled()) {
    const relativePath = safeRelativePath(path.join(directory, fileName));
    await putBlobText(htmlBlobPath(relativePath), html, "text/html; charset=utf-8");
    return { relativePath, id: fileId(relativePath) };
  }

  const dir = assertInsideRoot(directory);
  await fs.mkdir(dir, { recursive: true });
  const relativePath = normalizeRelative(path.join(directory, fileName));
  await fs.writeFile(assertInsideRoot(relativePath), html);
  return { relativePath, id: fileId(relativePath) };
}

export async function importHtmlAtPath(relativePath: string, html: string) {
  const safePath = safeRelativePath(relativePath);
  if (isBlobStorageEnabled()) {
    await putBlobText(htmlBlobPath(safePath), html, "text/html; charset=utf-8");
    return { relativePath: safePath, id: fileId(safePath) };
  }

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
    root: workspaceRoot(),
    total: files.length,
    favorites: files.filter((file) => file.meta.favorite).length,
    archived: files.filter((file) => file.meta.status === "archived").length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    tags: Array.from(tags.entries()).map(([name, count]) => ({ name, count }))
  };
}

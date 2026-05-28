"use client";

import {
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileDown,
  FilePlus2,
  Heart,
  LayoutGrid,
  ListFilter,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Star,
  Tags,
  Trash2,
  UploadCloud,
  Upload,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type FileStatus = "active" | "archived" | "trashed";

type HtmlFile = {
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
  meta: {
    tags: string[];
    notes: string;
    favorite: boolean;
    status: FileStatus;
    lastOpenedAt?: string;
  };
};

type Stats = {
  root: string;
  total: number;
  favorites: number;
  archived: number;
  totalSize: number;
  tags: { name: string; count: number }[];
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

export default function Home() {
  const [files, setFiles] = useState<HtmlFile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | FileStatus | "favorite">("all");
  const [project, setProject] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState("modified");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(1);
  const [view, setView] = useState<"library" | "reader">("library");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [projectRenameOpen, setProjectRenameOpen] = useState(false);
  const [projectRenameTarget, setProjectRenameTarget] = useState("");
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [directoryDraft, setDirectoryDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [toast, setToast] = useState("");

  async function loadFiles(nextSelected?: string) {
    const [fileResponse, statResponse] = await Promise.all([fetch("/api/files"), fetch("/api/stats")]);
    const fileJson = await fileResponse.json();
    setFiles(fileJson.files);
    setStats(await statResponse.json());
    if (nextSelected) setSelectedId(nextSelected);
    else if (!selectedId && fileJson.files[0]) setSelectedId(fileJson.files[0].id);
  }

  useEffect(() => {
    loadFiles();
  }, []);

  const allTags = useMemo(() => {
    const tags = new Map<string, number>();
    files.forEach((file) => file.meta.tags.forEach((item) => tags.set(item, (tags.get(item) || 0) + 1)));
    return Array.from(tags.entries()).sort((a, b) => b[1] - a[1]);
  }, [files]);

  const projects = useMemo(() => {
    const grouped = new Map<string, number>();
    files.forEach((file) => grouped.set(file.project, (grouped.get(file.project) || 0) + 1));
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [files]);

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files
      .filter((file) => {
        if (status === "favorite" && !file.meta.favorite) return false;
        if (status !== "all" && status !== "favorite" && file.meta.status !== status) return false;
        if (project !== "all" && file.project !== project) return false;
        if (tag !== "all" && !file.meta.tags.includes(tag)) return false;
        if (!needle) return true;
        return [file.title, file.name, file.relativePath, file.snippet, file.meta.notes, file.meta.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "size") return b.size - a.size;
        if (sort === "words") return b.wordCount - a.wordCount;
        return +new Date(b.modifiedAt) - +new Date(a.modifiedAt);
      });
  }, [files, query, status, project, tag, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleFiles.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedFiles = visibleFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = files.find((file) => file.id === selectedId) || visibleFiles[0];

  useEffect(() => {
    setPage(1);
  }, [query, status, project, tag, sort, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selected) return;
    setNameDraft(selected.name);
    setDirectoryDraft(selected.directory === "." ? "" : selected.directory);
    setTagDraft(selected.meta.tags.join(", "));
    setNoteDraft(selected.meta.notes);
  }, [selected?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const measure = () => {
      const list = document.querySelector(".file-list");
      if (!list) return;
      const styles = window.getComputedStyle(list);
      const columnGap = parseFloat(styles.columnGap) || 10;
      const rowGap = parseFloat(styles.rowGap) || 10;
      const columns = Math.max(1, Math.floor((list.clientWidth + columnGap) / (320 + columnGap)));
      const rows = Math.max(1, Math.floor((list.clientHeight + rowGap) / (124 + rowGap)));
      setPageSize(columns * rows);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    const list = document.querySelector(".file-list");
    if (list) resizeObserver.observe(list);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [view]);

  async function mutate(endpoint: string, body?: unknown) {
    setBusy(true);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    setBusy(false);
    if (!response.ok) throw new Error((await response.json()).error || "Request failed");
    return response.json();
  }

  async function patchMeta(patch: Partial<HtmlFile["meta"]>) {
    if (!selected) return;
    setBusy(true);
    await fetch(`/api/files/${selected.id}/metadata`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    setBusy(false);
    await loadFiles(selected.id);
  }

  async function runAction(action: string) {
    if (!selected) return;
    try {
      if (action === "scan") {
        await fetch("/api/scan", { method: "POST" });
        await loadFiles(selected.id);
      }
      if (action === "favorite") {
        await patchMeta({ favorite: !selected.meta.favorite });
      }
      if (action === "archive") {
        await patchMeta({ status: selected.meta.status === "archived" ? "active" : "archived" });
      }
      if (action === "duplicate") {
        const result = await mutate(`/api/files/${selected.id}/duplicate`);
        await loadFiles(result.id);
      }
      if (action === "trash") {
        await mutate(`/api/files/${selected.id}/trash`);
        await loadFiles();
      }
      setToast("已更新");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function saveOrganization(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await patchMeta({
        tags: tagDraft.split(","),
        notes: noteDraft
      });
      if (nameDraft !== selected.name) {
        const result = await mutate(`/api/files/${selected.id}/rename`, { name: nameDraft });
        await loadFiles(result.id);
        setToast("已重命名");
        return;
      }
      if ((directoryDraft || ".") !== selected.directory) {
        const result = await mutate(`/api/files/${selected.id}/move`, { directory: directoryDraft || "." });
        await loadFiles(result.id);
        setToast("已移动");
        return;
      }
      setToast("已保存");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function openSource() {
    if (!selected) return;
    const response = await fetch(`/api/files/${selected.id}/content`);
    setSource(await response.text());
    setSourceOpen(true);
  }

  async function saveSource() {
    if (!selected) return;
    setBusy(true);
    await fetch(`/api/files/${selected.id}/content`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ html: source })
    });
    setBusy(false);
    setSourceOpen(false);
    await loadFiles(selected.id);
    setToast("源码已保存");
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("directory", "imports");
    setBusy(true);
    const response = await fetch("/api/files/import", { method: "POST", body: form });
    const result = await response.json();
    setBusy(false);
    await loadFiles(result.id);
    setToast("已导入");
  }

  async function importFolder(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []).filter((file) => file.name.toLowerCase().endsWith(".html"));
    if (!selectedFiles.length) return;
    const form = new FormData();
    selectedFiles.forEach((file) => {
      form.append("files", file);
      form.append("paths", (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
    });
    setBusy(true);
    const response = await fetch("/api/files/import-folder", { method: "POST", body: form });
    const result = await response.json();
    setBusy(false);
    await loadFiles(result.imported?.[0]?.id);
    setProject(result.imported?.[0]?.relativePath?.split("/")?.[0] || "all");
    setToast(`已导入 ${result.count || 0} 个 HTML`);
    event.target.value = "";
  }

  function openProjectRename(name: string) {
    setProjectRenameTarget(name);
    setProjectNameDraft(name);
    setProjectRenameOpen(true);
  }

  async function saveProjectRename(event: FormEvent) {
    event.preventDefault();
    if (!projectRenameTarget) return;
    try {
      setBusy(true);
      const response = await fetch("/api/projects/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldName: projectRenameTarget, nextName: projectNameDraft })
      });
      const result = await response.json();
      setBusy(false);
      if (!response.ok) throw new Error(result.error || "项目重命名失败");
      setProject(result.project);
      setProjectRenameOpen(false);
      await loadFiles();
      setToast(`已重命名 ${result.moved} 个 HTML`);
    } catch (error) {
      setBusy(false);
      setToast(error instanceof Error ? error.message : "项目重命名失败");
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img">
              <path className="mark-page" d="M15 8h25l9 9v39H15z" />
              <path className="mark-fold" d="M40 8v10h10" />
              <path className="mark-h" d="M24 22v20M40 22v20M24 32h16" />
              <path className="mark-line" d="M23 48h18" />
            </svg>
          </div>
          <div>
            <p>HLibrary</p>
            <span>HTML management</span>
          </div>
        </div>

        <section className="side-section">
          <div className="section-label">Collection</div>
          <button className={status === "all" ? "nav active" : "nav"} onClick={() => { setStatus("all"); setView("library"); }}>
            <LayoutGrid size={17} />全部 HTML<span>{stats?.total || 0}</span>
          </button>
          <button className={status === "favorite" ? "nav active" : "nav"} onClick={() => { setStatus("favorite"); setView("library"); }}>
            <Star size={17} />收藏<span>{stats?.favorites || 0}</span>
          </button>
          <button className={status === "archived" ? "nav active" : "nav"} onClick={() => { setStatus("archived"); setView("library"); }}>
            <Archive size={17} />归档<span>{stats?.archived || 0}</span>
          </button>
        </section>

        <section className="side-section import-actions">
          <div className="section-label">Import</div>
          <label className="nav import-button">
            <Upload size={17} />导入单个 HTML
            <input type="file" accept=".html,text/html" onChange={importFile} />
          </label>
          <label className="nav import-button">
            <UploadCloud size={17} />导入文件夹
            <input
              type="file"
              accept=".html,text/html"
              multiple
              onChange={importFolder}
              {...{ webkitdirectory: "", directory: "" }}
            />
          </label>
          <button className="nav" disabled={busy} onClick={() => runAction("scan")}>
            <RefreshCw size={17} />重新扫描
          </button>
        </section>

        <section className="side-section">
          <div className="section-label">Projects</div>
          <button className={project === "all" ? "tag-filter active" : "tag-filter"} onClick={() => { setProject("all"); setView("library"); }}>
            <span>全部项目</span>
            <small>{files.length}</small>
          </button>
          {projects.map(([name, count]) => (
            <div key={name} className={project === name ? "project-row active" : "project-row"}>
              <button onClick={() => { setProject(name); setView("library"); }}>
                <span>{name}</span>
                <small>{count}</small>
              </button>
              <button className="project-edit" title="修改项目名" onClick={() => openProjectRename(name)}>
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </section>

        <section className="side-section">
          <div className="section-label">Tags</div>
          <button className={tag === "all" ? "tag-filter active" : "tag-filter"} onClick={() => { setTag("all"); setView("library"); }}>
            <Tags size={15} />全部标签
          </button>
          {allTags.map(([name, count]) => (
            <button key={name} className={tag === name ? "tag-filter active" : "tag-filter"} onClick={() => { setTag(name); setView("library"); }}>
              <span>{name}</span>
              <small>{count}</small>
            </button>
          ))}
        </section>

      </aside>

      <section className="workspace">
        <div className="t-page-slide workspace-slider" data-page={view === "reader" ? "2" : "1"}>
          <section className="t-page library library-full" data-page-id="1">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <button onClick={() => setView("library")}>HLibrary</button>
              <ChevronRight size={14} />
              <span>{project === "all" ? "All projects" : project}</span>
            </nav>
            <section className="controls compact">
              <label className="search">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、路径、备注、标签和正文摘要" />
              </label>
              <label className="select">
                <ListFilter size={16} />
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="modified">最近修改</option>
                  <option value="title">标题</option>
                  <option value="size">文件大小</option>
                  <option value="words">文字量</option>
                </select>
              </label>
            </section>
            <div className="file-list">
              {pagedFiles.map((file) => (
              <button
                key={file.id}
                className={selectedId === file.id ? "file-row t-resize active" : "file-row t-resize"}
                onClick={() => {
                  setSelectedId(file.id);
                  setView("reader");
                }}
              >
                <div className="row-title">
                  <span>{file.title}</span>
                  {file.meta.favorite && <Heart size={15} fill="currentColor" />}
                </div>
                <p>{file.relativePath}</p>
                <div className="row-meta">
                  <span>{formatDate(file.modifiedAt)}</span>
                  <span>{formatSize(file.size)}</span>
                  <span>{file.wordCount} words</span>
                </div>
                <div className="row-tags">
                  {file.meta.tags.map((item) => (
                    <small key={item}>{item}</small>
                  ))}
                </div>
              </button>
              ))}
              {!visibleFiles.length && (
                <div className="empty library-empty">
                  <FilePlus2 size={26} />
                  <p>没有找到 HTML 文件</p>
                </div>
              )}
            </div>
            <div className="pagination">
              <div>
                <span>
                  {visibleFiles.length
                    ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, visibleFiles.length)}`
                    : "0"}
                </span>
                <span>/ {visibleFiles.length}</span>
              </div>
              <div className="page-buttons">
                <button title="上一页" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft size={16} />
                </button>
                <span>{currentPage} / {totalPages}</span>
                <button title="下一页" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </section>

          <section className="t-page reader-page" data-page-id="2">
            {selected ? (
              <>
                <div className="reader-top">
                  <nav className="breadcrumbs" aria-label="Breadcrumb">
                    <button onClick={() => setView("library")}>HLibrary</button>
                    <ChevronRight size={14} />
                    <button onClick={() => { setProject(selected.project); setView("library"); }}>{selected.project}</button>
                    <ChevronRight size={14} />
                    <span>{selected.title}</span>
                  </nav>
                  <div className="reader-actions">
                    <button title="返回列表" onClick={() => setView("library")}><ArrowLeft size={17} /></button>
                    <button title="收藏" onClick={() => runAction("favorite")}><Star size={17} fill={selected.meta.favorite ? "currentColor" : "none"} /></button>
                    <button title="管理信息" onClick={() => setOrganizerOpen(true)}><PanelRightOpen size={17} /></button>
                    <button title="源码" onClick={openSource}><Edit3 size={17} /></button>
                    <button title="复制" onClick={() => runAction("duplicate")}><Copy size={17} /></button>
                    <button title="归档" onClick={() => runAction("archive")}><Archive size={17} /></button>
                    <button title="移入 trash" onClick={() => runAction("trash")}><Trash2 size={17} /></button>
                  </div>
                </div>
                <div className="reader-frame">
                  <iframe key={selected.id} src={`/api/preview/${selected.id}`} title={selected.title} />
                </div>
              </>
            ) : (
              <div className="empty">
                <FilePlus2 size={26} />
                <p>没有找到 HTML 文件</p>
              </div>
            )}
          </section>
        </div>
      </section>

      {sourceOpen && (
        <div className="modal">
          <div className="source-panel t-modal is-open" role="dialog">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Source</p>
                <h3>{selected?.name}</h3>
              </div>
              <button onClick={() => setSourceOpen(false)}><MoreHorizontal size={18} /></button>
            </div>
            <textarea className="source-editor" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} />
            <div className="modal-actions">
              <button onClick={() => setSourceOpen(false)}>取消</button>
              <button className="primary" onClick={saveSource}><FileDown size={17} />保存源码</button>
            </div>
          </div>
        </div>
      )}

      {organizerOpen && selected && (
        <div className="drawer-backdrop" onClick={() => setOrganizerOpen(false)}>
          <aside className="drawer t-panel-slide" data-open="true" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Manage</p>
                <h3>{selected.title}</h3>
              </div>
              <button title="关闭" onClick={() => setOrganizerOpen(false)}><X size={18} /></button>
            </div>
            <form className="organizer drawer-form" onSubmit={saveOrganization}>
              <label>
                文件名
                <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
              </label>
              <label>
                目录
                <input value={directoryDraft} onChange={(event) => setDirectoryDraft(event.target.value)} placeholder="." />
              </label>
              <label>
                标签
                <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="research, ui, archive" />
              </label>
              <label>
                备注
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
              </label>
              <button className="primary" disabled={busy}>
                <Save size={17} />保存管理信息
              </button>
            </form>
          </aside>
        </div>
      )}

      {projectRenameOpen && (
        <div className="drawer-backdrop" onClick={() => setProjectRenameOpen(false)}>
          <aside className="drawer project-drawer t-panel-slide" data-open="true" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Project</p>
                <h3>修改项目名</h3>
              </div>
              <button title="关闭" onClick={() => setProjectRenameOpen(false)}><X size={18} /></button>
            </div>
            <form className="organizer drawer-form" onSubmit={saveProjectRename}>
              <label>
                当前项目
                <input value={projectRenameTarget} disabled />
              </label>
              <label>
                新项目名
                <input value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} />
              </label>
              <button className="primary" disabled={busy}>
                <Save size={17} />保存项目名
              </button>
            </form>
          </aside>
        </div>
      )}

      {toast && <button className="toast" onClick={() => setToast("")}>{toast}</button>}
    </main>
  );
}

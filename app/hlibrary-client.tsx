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
import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useReducer } from "react";

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

type HLibraryClientProps = {
  initialFiles: HtmlFile[];
  initialStats: Stats;
};

type StatusFilter = "all" | FileStatus | "favorite";
type ViewMode = "library" | "reader";

type LibraryState = {
  query: string;
  status: StatusFilter;
  project: string;
  tag: string;
  sort: string;
  page: number;
  pageSize: number;
  view: ViewMode;
};

type LibraryAction =
  | { type: "query"; query: string }
  | { type: "status"; status: StatusFilter }
  | { type: "project"; project: string }
  | { type: "tag"; tag: string }
  | { type: "sort"; sort: string }
  | { type: "page"; page: number }
  | { type: "pageSize"; pageSize: number }
  | { type: "view"; view: ViewMode };

const initialLibraryState: LibraryState = {
  query: "",
  status: "all",
  project: "all",
  tag: "all",
  sort: "modified",
  page: 1,
  pageSize: 1,
  view: "library"
};

function libraryReducer(state: LibraryState, action: LibraryAction): LibraryState {
  if (action.type === "page") return { ...state, page: action.page };
  if (action.type === "view") return { ...state, view: action.view };
  if (action.type === "pageSize") {
    if (state.pageSize === action.pageSize) return state;
    return { ...state, pageSize: action.pageSize, page: 1 };
  }
  if (action.type === "query") return { ...state, query: action.query, page: 1 };
  if (action.type === "status") return { ...state, status: action.status, page: 1, view: "library" };
  if (action.type === "project") return { ...state, project: action.project, page: 1, view: "library" };
  if (action.type === "tag") return { ...state, tag: action.tag, page: 1, view: "library" };
  return { ...state, sort: action.sort, page: 1 };
}

type AppState = {
  files: HtmlFile[];
  stats: Stats | null;
  selectedId: string;
  busy: boolean;
  source: string;
  sourceOpen: boolean;
  organizerOpen: boolean;
  projectRenameTarget: string;
  toast: string;
};

type AppAction =
  | { type: "files"; files: HtmlFile[] }
  | { type: "stats"; stats: Stats | null }
  | { type: "selected"; selectedId: string }
  | { type: "busy"; busy: boolean }
  | { type: "source"; source: string }
  | { type: "sourceOpen"; sourceOpen: boolean }
  | { type: "organizerOpen"; organizerOpen: boolean }
  | { type: "projectRenameTarget"; projectRenameTarget: string }
  | { type: "toast"; toast: string };

function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type === "files") return { ...state, files: action.files };
  if (action.type === "stats") return { ...state, stats: action.stats };
  if (action.type === "selected") return { ...state, selectedId: action.selectedId };
  if (action.type === "busy") return { ...state, busy: action.busy };
  if (action.type === "source") return { ...state, source: action.source };
  if (action.type === "sourceOpen") return { ...state, sourceOpen: action.sourceOpen };
  if (action.type === "organizerOpen") return { ...state, organizerOpen: action.organizerOpen };
  if (action.type === "projectRenameTarget") return { ...state, projectRenameTarget: action.projectRenameTarget };
  return { ...state, toast: action.toast };
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const formatDate = (value: string) => dateFormatter.format(new Date(value));

export default function HLibraryClient({ initialFiles, initialStats }: HLibraryClientProps) {
  const [app, appDispatch] = useReducer(appReducer, {
    files: initialFiles,
    stats: initialStats,
    selectedId: "",
    busy: false,
    source: "",
    sourceOpen: false,
    organizerOpen: false,
    projectRenameTarget: "",
    toast: ""
  });
  const [library, dispatch] = useReducer(libraryReducer, initialLibraryState);
  const { files, stats, selectedId, busy, source, sourceOpen, organizerOpen, projectRenameTarget, toast } = app;
  const { query, status, project, tag, sort, page, pageSize, view } = library;

  const setBusy = useCallback((busy: boolean) => appDispatch({ type: "busy", busy }), []);
  const setSource = useCallback((source: string) => appDispatch({ type: "source", source }), []);
  const setSourceOpen = useCallback((sourceOpen: boolean) => appDispatch({ type: "sourceOpen", sourceOpen }), []);
  const setOrganizerOpen = useCallback((organizerOpen: boolean) => appDispatch({ type: "organizerOpen", organizerOpen }), []);
  const setProjectRenameTarget = useCallback(
    (projectRenameTarget: string) => appDispatch({ type: "projectRenameTarget", projectRenameTarget }),
    []
  );
  const setToast = useCallback((toast: string) => appDispatch({ type: "toast", toast }), []);

  const loadFiles = useCallback(async (nextSelected?: string) => {
    const [fileResponse, statResponse] = await Promise.all([fetch("/api/files"), fetch("/api/stats")]);
    const fileJson = await fileResponse.json();
    appDispatch({ type: "files", files: fileJson.files });
    appDispatch({ type: "stats", stats: await statResponse.json() });
    if (nextSelected) appDispatch({ type: "selected", selectedId: nextSelected });
    else if (!selectedId && fileJson.files[0]) appDispatch({ type: "selected", selectedId: fileJson.files[0].id });
  }, [selectedId]);

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [setToast, toast]);

  useEffect(() => {
    const measure = () => {
      const list = document.querySelector(".file-list");
      if (!list) return;
      const styles = window.getComputedStyle(list);
      const columnGap = parseFloat(styles.columnGap) || 10;
      const rowGap = parseFloat(styles.rowGap) || 10;
      const columns = Math.max(1, Math.floor((list.clientWidth + columnGap) / (320 + columnGap)));
      const rows = Math.max(1, Math.floor((list.clientHeight + rowGap) / (124 + rowGap)));
      dispatch({ type: "pageSize", pageSize: columns * rows });
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

  function showStatus(nextStatus: "all" | FileStatus | "favorite") {
    dispatch({ type: "status", status: nextStatus });
  }

  function showProject(nextProject: string) {
    dispatch({ type: "project", project: nextProject });
  }

  function showTag(nextTag: string) {
    dispatch({ type: "tag", tag: nextTag });
  }

  function updateQuery(nextQuery: string) {
    dispatch({ type: "query", query: nextQuery });
  }

  function updateSort(nextSort: string) {
    dispatch({ type: "sort", sort: nextSort });
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
    showProject(result.imported?.[0]?.relativePath?.split("/")?.[0] || "all");
    setToast(`已导入 ${result.count || 0} 个 HTML`);
    event.target.value = "";
  }

  function openProjectRename(name: string) {
    setProjectRenameTarget(name);
  }

  return (
    <main className="shell">
      <Sidebar
        allTags={allTags}
        busy={busy}
        fileCount={files.length}
        importFile={importFile}
        importFolder={importFolder}
        openProjectRename={openProjectRename}
        project={project}
        projects={projects}
        runAction={runAction}
        showProject={showProject}
        showStatus={showStatus}
        showTag={showTag}
        stats={stats}
        status={status}
        tag={tag}
      />

      <Workspace
        currentPage={currentPage}
        pageSize={pageSize}
        pagedFiles={pagedFiles}
        project={project}
        query={query}
        runAction={runAction}
        selected={selected}
        selectedId={selectedId}
        selectFile={(id) => {
          appDispatch({ type: "selected", selectedId: id });
          dispatch({ type: "view", view: "reader" });
        }}
        setOrganizerOpen={setOrganizerOpen}
        setPage={(page) => dispatch({ type: "page", page })}
        setView={(view) => dispatch({ type: "view", view })}
        showProject={showProject}
        sort={sort}
        totalPages={totalPages}
        updateQuery={updateQuery}
        updateSort={updateSort}
        view={view}
        visibleCount={visibleFiles.length}
        openSource={openSource}
      />

      <OverlayPanels
        busy={busy}
        loadFiles={loadFiles}
        mutate={mutate}
        organizerOpen={organizerOpen}
        patchMeta={patchMeta}
        projectRenameTarget={projectRenameTarget}
        saveSource={saveSource}
        selected={selected}
        setBusy={setBusy}
        setOrganizerOpen={setOrganizerOpen}
        setProject={(nextProject) => dispatch({ type: "project", project: nextProject })}
        setProjectRenameTarget={setProjectRenameTarget}
        setSource={setSource}
        setSourceOpen={setSourceOpen}
        setToast={setToast}
        source={source}
        sourceOpen={sourceOpen}
        toast={toast}
      />
    </main>
  );
}

function OverlayPanels({
  busy,
  loadFiles,
  mutate,
  organizerOpen,
  patchMeta,
  projectRenameTarget,
  saveSource,
  selected,
  setBusy,
  setOrganizerOpen,
  setProject,
  setProjectRenameTarget,
  setSource,
  setSourceOpen,
  setToast,
  source,
  sourceOpen,
  toast
}: {
  busy: boolean;
  loadFiles: LoadFiles;
  mutate: Mutate;
  organizerOpen: boolean;
  patchMeta: (patch: Partial<HtmlFile["meta"]>) => Promise<void>;
  projectRenameTarget: string;
  saveSource: () => Promise<void>;
  selected?: HtmlFile;
  setBusy: (busy: boolean) => void;
  setOrganizerOpen: (open: boolean) => void;
  setProject: (project: string) => void;
  setProjectRenameTarget: (project: string) => void;
  setSource: (source: string) => void;
  setSourceOpen: (open: boolean) => void;
  setToast: (message: string) => void;
  source: string;
  sourceOpen: boolean;
  toast: string;
}) {
  return (
    <>
      {sourceOpen && (
        <div className="modal">
          <dialog className="source-panel t-modal is-open" open aria-labelledby="source-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Source</p>
                <h3 id="source-title">{selected?.name}</h3>
              </div>
              <button type="button" aria-label="关闭源码编辑器" onClick={() => setSourceOpen(false)}><MoreHorizontal size={18} /></button>
            </div>
            <textarea
              className="source-editor"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              aria-label="HTML 源码"
              spellCheck={false}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setSourceOpen(false)}>取消</button>
              <button type="button" className="primary" onClick={saveSource}><FileDown size={17} />保存源码</button>
            </div>
          </dialog>
        </div>
      )}

      {organizerOpen && selected && (
        <OrganizerDrawer
          key={selected.id}
          selected={selected}
          busy={busy}
          mutate={mutate}
          patchMeta={patchMeta}
          loadFiles={loadFiles}
          setToast={setToast}
          onClose={() => setOrganizerOpen(false)}
        />
      )}

      {projectRenameTarget && (
        <ProjectRenameDrawer
          key={projectRenameTarget}
          projectName={projectRenameTarget}
          busy={busy}
          setBusy={setBusy}
          loadFiles={loadFiles}
          setProject={setProject}
          setToast={setToast}
          onClose={() => setProjectRenameTarget("")}
        />
      )}

      {toast && <button type="button" className="toast" onClick={() => setToast("")}>{toast}</button>}
    </>
  );
}

function Sidebar({
  allTags,
  busy,
  fileCount,
  importFile,
  importFolder,
  openProjectRename,
  project,
  projects,
  runAction,
  showProject,
  showStatus,
  showTag,
  stats,
  status,
  tag
}: {
  allTags: [string, number][];
  busy: boolean;
  fileCount: number;
  importFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  importFolder: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  openProjectRename: (name: string) => void;
  project: string;
  projects: [string, number][];
  runAction: (action: string) => Promise<void>;
  showProject: (project: string) => void;
  showStatus: (status: StatusFilter) => void;
  showTag: (tag: string) => void;
  stats: Stats | null;
  status: StatusFilter;
  tag: string;
}) {
  return (
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
        <button type="button" className={status === "all" ? "nav active" : "nav"} onClick={() => showStatus("all")}>
          <LayoutGrid size={17} />全部 HTML<span>{stats?.total || 0}</span>
        </button>
        <button type="button" className={status === "favorite" ? "nav active" : "nav"} onClick={() => showStatus("favorite")}>
          <Star size={17} />收藏<span>{stats?.favorites || 0}</span>
        </button>
        <button type="button" className={status === "archived" ? "nav active" : "nav"} onClick={() => showStatus("archived")}>
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
          <input type="file" accept=".html,text/html" multiple onChange={importFolder} {...{ webkitdirectory: "", directory: "" }} />
        </label>
        <button type="button" className="nav" disabled={busy} onClick={() => runAction("scan")}>
          <RefreshCw size={17} />重新扫描
        </button>
      </section>

      <section className="side-section">
        <div className="section-label">Projects</div>
        <button type="button" className={project === "all" ? "tag-filter active" : "tag-filter"} onClick={() => showProject("all")}>
          <span>全部项目</span>
          <small>{fileCount}</small>
        </button>
        {projects.map(([name, count]) => (
          <div key={name} className={project === name ? "project-row active" : "project-row"}>
            <button type="button" onClick={() => showProject(name)}>
              <span>{name}</span>
              <small>{count}</small>
            </button>
            <button type="button" className="project-edit" title="修改项目名" onClick={() => openProjectRename(name)}>
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </section>

      <section className="side-section">
        <div className="section-label">Tags</div>
        <button type="button" className={tag === "all" ? "tag-filter active" : "tag-filter"} onClick={() => showTag("all")}>
          <Tags size={15} />
          <span>全部标签</span>
        </button>
        {allTags.map(([name, count]) => (
          <button type="button" key={name} className={tag === name ? "tag-filter active" : "tag-filter"} onClick={() => showTag(name)}>
            <span>{name}</span>
            <small>{count}</small>
          </button>
        ))}
      </section>
    </aside>
  );
}

function Workspace({
  currentPage,
  pageSize,
  pagedFiles,
  project,
  query,
  runAction,
  selected,
  selectedId,
  selectFile,
  setOrganizerOpen,
  setPage,
  setView,
  showProject,
  sort,
  totalPages,
  updateQuery,
  updateSort,
  view,
  visibleCount,
  openSource
}: {
  currentPage: number;
  pageSize: number;
  pagedFiles: HtmlFile[];
  project: string;
  query: string;
  runAction: (action: string) => Promise<void>;
  selected?: HtmlFile;
  selectedId: string;
  selectFile: (id: string) => void;
  setOrganizerOpen: (open: boolean) => void;
  setPage: (page: number) => void;
  setView: (view: ViewMode) => void;
  showProject: (project: string) => void;
  sort: string;
  totalPages: number;
  updateQuery: (query: string) => void;
  updateSort: (sort: string) => void;
  view: ViewMode;
  visibleCount: number;
  openSource: () => Promise<void>;
}) {
  return (
    <section className="workspace">
      <div className="t-page-slide workspace-slider" data-page={view === "reader" ? "2" : "1"}>
        <section className="t-page library library-full" data-page-id="1">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <button type="button" onClick={() => setView("library")}>HLibrary</button>
            <ChevronRight size={14} />
            <span>{project === "all" ? "All projects" : project}</span>
          </nav>
          <section className="controls compact">
            <label className="search">
              <Search size={18} />
              <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="搜索标题、路径、备注、标签和正文摘要" />
            </label>
            <label className="select">
              <ListFilter size={16} />
              <select value={sort} onChange={(event) => updateSort(event.target.value)}>
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
                type="button"
                key={file.id}
                className={selectedId === file.id ? "file-row t-resize active" : "file-row t-resize"}
                onClick={() => selectFile(file.id)}
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
            {!visibleCount && (
              <div className="empty library-empty">
                <FilePlus2 size={26} />
                <p>没有找到 HTML 文件</p>
              </div>
            )}
          </div>
          <div className="pagination">
            <div>
              <span>{visibleCount ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, visibleCount)}` : "0"}</span>
              <span>/ {visibleCount}</span>
            </div>
            <div className="page-buttons">
              <button type="button" title="上一页" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>
                <ChevronLeft size={16} />
              </button>
              <span>{currentPage} / {totalPages}</span>
              <button type="button" title="下一页" disabled={currentPage >= totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>
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
                  <button type="button" onClick={() => setView("library")}>HLibrary</button>
                  <ChevronRight size={14} />
                  <button type="button" onClick={() => showProject(selected.project)}>{selected.project}</button>
                  <ChevronRight size={14} />
                  <span>{selected.title}</span>
                </nav>
                <div className="reader-actions">
                  <button type="button" title="返回列表" onClick={() => setView("library")}><ArrowLeft size={17} /></button>
                  <button type="button" title="收藏" onClick={() => runAction("favorite")}><Star size={17} fill={selected.meta.favorite ? "currentColor" : "none"} /></button>
                  <button type="button" title="管理信息" onClick={() => setOrganizerOpen(true)}><PanelRightOpen size={17} /></button>
                  <button type="button" title="源码" onClick={openSource}><Edit3 size={17} /></button>
                  <button type="button" title="复制" onClick={() => runAction("duplicate")}><Copy size={17} /></button>
                  <button type="button" title="归档" onClick={() => runAction("archive")}><Archive size={17} /></button>
                  <button type="button" title="移入 trash" onClick={() => runAction("trash")}><Trash2 size={17} /></button>
                </div>
              </div>
              <div className="reader-frame">
                <iframe
                  key={selected.id}
                  src={`/api/preview/${selected.id}`}
                  title={selected.title}
                  sandbox="allow-downloads allow-forms allow-modals allow-popups allow-scripts"
                />
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
  );
}

type Mutate = (endpoint: string, body?: unknown) => Promise<Record<string, any>>;
type LoadFiles = (nextSelected?: string) => Promise<void>;

function DrawerShell({
  children,
  className = "drawer t-panel-slide",
  onClose
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
}) {
  return (
    <div className="drawer-backdrop">
      <button type="button" className="drawer-scrim" aria-label="关闭面板" onClick={onClose} />
      <aside className={className} data-open="true">
        {children}
      </aside>
    </div>
  );
}

function OrganizerDrawer({
  selected,
  busy,
  mutate,
  patchMeta,
  loadFiles,
  setToast,
  onClose
}: {
  selected: HtmlFile;
  busy: boolean;
  mutate: Mutate;
  patchMeta: (patch: Partial<HtmlFile["meta"]>) => Promise<void>;
  loadFiles: LoadFiles;
  setToast: (message: string) => void;
  onClose: () => void;
}) {
  async function saveOrganization(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const nameDraft = String(form.get("name") || "");
    const directoryDraft = String(form.get("directory") || "");
    const tagDraft = String(form.get("tags") || "");
    const noteDraft = String(form.get("notes") || "");

    try {
      await patchMeta({
        tags: tagDraft.split(","),
        notes: noteDraft
      });
      let toast = "已保存";
      let nextSelected = selected.id;
      if (nameDraft !== selected.name) {
        const result = await mutate(`/api/files/${selected.id}/rename`, { name: nameDraft });
        nextSelected = result.id;
        toast = "已重命名";
      } else if ((directoryDraft || ".") !== selected.directory) {
        const result = await mutate(`/api/files/${selected.id}/move`, { directory: directoryDraft || "." });
        nextSelected = result.id;
        toast = "已移动";
      }
      await loadFiles(nextSelected);
      setToast(toast);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "保存失败");
    }
  }

  return (
    <DrawerShell onClose={onClose}>
      <div className="drawer-head">
        <div>
          <p className="eyebrow">Manage</p>
          <h3>{selected.title}</h3>
        </div>
        <button type="button" title="关闭" onClick={onClose}><X size={18} /></button>
      </div>
      <form className="organizer drawer-form" onSubmit={saveOrganization}>
        <label>
          文件名
          <input name="name" defaultValue={selected.name} />
        </label>
        <label>
          目录
          <input name="directory" defaultValue={selected.directory === "." ? "" : selected.directory} placeholder="." />
        </label>
        <label>
          标签
          <input name="tags" defaultValue={selected.meta.tags.join(", ")} placeholder="research, ui, archive" />
        </label>
        <label>
          备注
          <textarea name="notes" defaultValue={selected.meta.notes} />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          <Save size={17} />保存管理信息
        </button>
      </form>
    </DrawerShell>
  );
}

function ProjectRenameDrawer({
  projectName,
  busy,
  setBusy,
  loadFiles,
  setProject,
  setToast,
  onClose
}: {
  projectName: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  loadFiles: LoadFiles;
  setProject: (project: string) => void;
  setToast: (message: string) => void;
  onClose: () => void;
}) {
  async function saveProjectRename(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const projectNameDraft = String(form.get("projectName") || "");

    try {
      setBusy(true);
      const response = await fetch("/api/projects/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldName: projectName, nextName: projectNameDraft })
      });
      const result = await response.json();
      setBusy(false);
      if (!response.ok) throw new Error(result.error || "项目重命名失败");
      setProject(result.project);
      onClose();
      await loadFiles();
      setToast(`已重命名 ${result.moved} 个 HTML`);
    } catch (error) {
      setBusy(false);
      setToast(error instanceof Error ? error.message : "项目重命名失败");
    }
  }

  return (
    <DrawerShell className="drawer project-drawer t-panel-slide" onClose={onClose}>
      <div className="drawer-head">
        <div>
          <p className="eyebrow">Project</p>
          <h3>修改项目名</h3>
        </div>
        <button type="button" title="关闭" onClick={onClose}><X size={18} /></button>
      </div>
      <form className="organizer drawer-form" onSubmit={saveProjectRename}>
        <label>
        当前项目
          <input value={projectName} readOnly />
        </label>
        <label>
          新项目名
          <input name="projectName" defaultValue={projectName} />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          <Save size={17} />保存项目名
        </button>
      </form>
    </DrawerShell>
  );
}

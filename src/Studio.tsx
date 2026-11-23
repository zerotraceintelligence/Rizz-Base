import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  studioBackend,
  type StudioBackupInfo,
  type StudioEvent,
  type StudioLobby,
  type StudioProject,
} from "./studio-api"
import type { Yap } from "./studio-types"

type ProjectAction = "open" | "create" | "restore"

const previewProject: StudioProject = {
  path: "~/Documents/rizzbase-demo.rizz",
  name: "Rizzbase Demo",
  createdAt: "2026-11-14T00:00:00Z",
}

const previewLobbies: StudioLobby[] = [
  {
    id: "dev-notes",
    name: "dev-notes",
    createdAt: "2026-11-14T00:00:00Z",
    yapCount: 3,
  },
  {
    id: "project-ideas",
    name: "project-ideas",
    createdAt: "2026-11-14T00:00:00Z",
    yapCount: 2,
  },
  {
    id: "daily-log",
    name: "daily-log",
    createdAt: "2026-11-14T00:00:00Z",
    yapCount: 1,
  },
]

const previewYaps: Yap[] = [
  {
    id: "welcome",
    data: {
      author: "mika",
      content: "just shipped the local-first preview",
      tags: ["studio", "shipping"],
    },
  },
  {
    id: "backup-plan",
    data: {
      author: "jules",
      content: "encrypted project + protected JSON backup",
      secure: true,
    },
  },
  {
    id: "next-step",
    data: {
      author: "kai",
      content: "build something useful, then measure it",
      priority: 1,
    },
  },
]

const previewYapsByLobby: Record<string, Yap[]> = {
  "dev-notes": previewYaps,
  "project-ideas": [
    { id: "desktop-ui", data: { status: "in progress", platform: "Wails" } },
    { id: "backup-flow", data: { format: "JSON", encryptedAtRest: false } },
  ],
  "daily-log": [
    {
      id: "today",
      data: { focus: "ship a useful local-first tool", done: false },
    },
  ],
}

const previewEvents: StudioEvent[] = [
  {
    id: "evt_demo_02",
    kind: "project.opened",
    source: "studio",
    createdAt: "2026-11-14T10:42:18Z",
    data: { project_id: "rb_demo", version: 1 },
  },
  {
    id: "evt_demo_01",
    kind: "note.created",
    source: "example",
    createdAt: "2026-11-14T10:41:52Z",
    data: { id: "welcome", title: "Hello, local events" },
  },
]

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes("incorrect passphrase or damaged project")) {
    return "That passphrase didn't unlock this Project. Check it and try again. If you're sure it's correct, restore from a backup."
  }
  if (normalized.includes("project is locked by pid")) {
    return "Another Rizzbase process is using this Project. Close it there, then try again."
  }
  if (normalized.includes("open a project first")) {
    return "Open or create a Project before continuing."
  }
  if (normalized.includes("must end in .rizz")) {
    return "Choose a Project file ending in .rizz."
  }
  if (normalized.includes("must end in .json")) {
    return "Choose a JSON backup file ending in .json."
  }
  if (normalized.includes("file already exists")) {
    return "A file with that name already exists. Choose a different destination."
  }
  if (normalized.includes("valid json")) {
    return "Check the JSON syntax and try again."
  }
  return message
}

function prettyJSON(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function studioAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

export default function Studio({ preview = false }: { preview?: boolean }) {
  const [project, setProject] = useState<StudioProject | null>(
    preview ? previewProject : null,
  )
  const [projectLoading, setProjectLoading] = useState(!preview)
  const [section, setSection] = useState<"data" | "events">("data")
  const [lobbies, setLobbies] = useState<StudioLobby[]>(
    preview ? previewLobbies : [],
  )
  const [activeLobbyID, setActiveLobbyID] = useState(
    preview ? (previewLobbies[0]?.id ?? "") : "",
  )
  const [yaps, setYaps] = useState<Yap[]>(preview ? previewYaps : [])
  const [yapsLoading, setYapsLoading] = useState(false)
  const [events, setEvents] = useState<StudioEvent[]>(
    preview ? previewEvents : [],
  )
  const [eventCursor, setEventCursor] = useState("")
  const [eventHasMore, setEventHasMore] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [projectAction, setProjectAction] = useState<ProjectAction | null>(null)
  const [projectPath, setProjectPath] = useState("")
  const [backupPath, setBackupPath] = useState("")
  const [backupSummary, setBackupSummary] = useState<StudioBackupInfo | null>(
    null,
  )
  const [projectName, setProjectName] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [editingYap, setEditingYap] = useState<Yap | null>(null)
  const [isNewYap, setIsNewYap] = useState(false)
  const [yapID, setYapID] = useState("")
  const [yapJSON, setYapJSON] = useState("{}")
  const [newLobbyName, setNewLobbyName] = useState("")
  const [showLobbyForm, setShowLobbyForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventKind, setEventKind] = useState("")
  const [eventSource, setEventSource] = useState("studio")
  const [eventJSON, setEventJSON] = useState("{\n  \n}")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const dialogRef = useRef<HTMLFormElement | null>(null)
  const dialogOpenerRef = useRef<HTMLElement | null>(null)
  const busyRef = useRef(false)
  const dialogOpen = Boolean(
    projectAction || showLobbyForm || showEventForm || isNewYap || editingYap,
  )

  function rememberDialogOpener() {
    if (document.activeElement instanceof HTMLElement) {
      dialogOpenerRef.current = document.activeElement
    }
  }

  useEffect(() => {
    if (!dialogOpen) return
    const activeDialog = dialogRef.current
    if (!activeDialog) return

    const containsFocus = activeDialog.contains.bind(activeDialog)
    const focusableSelector =
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    const focusable = () =>
      Array.from(activeDialog.querySelectorAll<HTMLElement>(focusableSelector))
    const initialFocus =
      activeDialog.querySelector<HTMLElement>("[autofocus]") ?? focusable()[0]
    initialFocus?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        if (busyRef.current) return
        setProjectAction(null)
        setPassphrase("")
        setBackupSummary(null)
        setShowLobbyForm(false)
        setShowEventForm(false)
        setIsNewYap(false)
        setEditingYap(null)
        setError("")
        return
      }
      if (event.key !== "Tab") return

      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !containsFocus(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !containsFocus(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      const opener = dialogOpenerRef.current
      if (opener?.isConnected) opener.focus()
      dialogOpenerRef.current = null
    }
  }, [dialogOpen])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (dialogOpen || busyRef.current || !(event.ctrlKey || event.metaKey)) {
        return
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault()
        void chooseProject("open")
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault()
        void chooseProject("create")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dialogOpen])

  useEffect(() => {
    if (preview) return
    let active = true
    try {
      studioBackend()
        .CurrentProject()
        .then(async (current) => {
          if (!active || !current) return
          setProject(current)
          const rows = await studioBackend().ListLobbies()
          if (!active) return
          setLobbies(rows)
          setActiveLobbyID(rows[0]?.id ?? "")
        })
        .catch((cause: unknown) => {
          if (active) setError(errorMessage(cause))
        })
        .finally(() => {
          if (active) setProjectLoading(false)
        })
    } catch (cause) {
      setError(errorMessage(cause))
      setProjectLoading(false)
    }
    return () => {
      active = false
    }
  }, [preview])

  useEffect(() => {
    if (preview) {
      setYaps(previewYapsByLobby[activeLobbyID] ?? [])
      return
    }
    if (!activeLobbyID) {
      setYaps([])
      setYapsLoading(false)
      return
    }
    let active = true
    setYapsLoading(true)
    studioBackend()
      .ListYaps(activeLobbyID)
      .then((rows) => {
        if (active) setYaps(rows)
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause))
      })
      .finally(() => {
        if (active) setYapsLoading(false)
      })
    return () => {
      active = false
    }
  }, [activeLobbyID, preview])

  useEffect(() => {
    if (section !== "events") return
    if (preview) {
      setEvents(previewEvents)
      setEventCursor("")
      setEventHasMore(false)
      return
    }

    let active = true
    setEventsLoading(true)
    try {
      studioBackend()
        .QueryEvents(50, "")
        .then((page) => {
          if (!active) return
          setEvents(page.events)
          setEventCursor(page.nextCursor)
          setEventHasMore(Boolean(page.nextCursor))
        })
        .catch((cause: unknown) => {
          if (active) setError(errorMessage(cause))
        })
        .finally(() => {
          if (active) setEventsLoading(false)
        })
    } catch (cause) {
      setError(errorMessage(cause))
      setEventsLoading(false)
    }
    return () => {
      active = false
    }
  }, [preview, section])

  async function run(action: () => Promise<void>) {
    busyRef.current = true
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function chooseProject(action: ProjectAction) {
    rememberDialogOpener()
    await run(async () => {
      const backend = studioBackend()
      let path = ""
      let selectedBackup = ""
      let selectedBackupSummary: StudioBackupInfo | null = null
      if (action === "open") {
        path = await backend.ChooseProjectToOpen()
      } else if (action === "restore") {
        selectedBackup = await backend.ChooseBackupToImport()
        if (!selectedBackup) return
        selectedBackupSummary = await backend.InspectBackup(selectedBackup)
        path = await backend.ChooseRestoreDestination()
      } else {
        path = await backend.ChooseProjectToCreate()
      }
      if (!path) return
      setProjectPath(path)
      setBackupPath(selectedBackup)
      setBackupSummary(selectedBackupSummary)
      setProjectAction(action)
      setProjectName(action === "create" ? "My Rizzbase Project" : "")
      setPassphrase("")
      setError("")
    })
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      const backend = studioBackend()
      let next: StudioProject
      switch (projectAction) {
        case "create":
          next = await backend.CreateProject(
            projectPath,
            projectName,
            passphrase,
          )
          break
        case "restore":
          next = await backend.RestoreProject(
            projectPath,
            backupPath,
            passphrase,
          )
          break
        case "open":
          next = await backend.OpenProject(projectPath, passphrase)
          break
        default:
          throw new Error("No Project action is selected.")
      }
      setPassphrase("")
      setProjectAction(null)
      setBackupSummary(null)
      setProject(next)
      const rows = await backend.ListLobbies()
      setLobbies(rows)
      setActiveLobbyID(rows[0]?.id ?? "")
      setSection("data")
    })
  }

  async function closeProject() {
    await run(async () => {
      await studioBackend().CloseProject()
      setProject(null)
      setLobbies([])
      setActiveLobbyID("")
      setYaps([])
      setEvents([])
      setEventCursor("")
      setEventHasMore(false)
      setSection("data")
    })
  }

  async function createLobby(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      const lobby = await studioBackend().CreateLobby(newLobbyName)
      const rows = await studioBackend().ListLobbies()
      setLobbies(rows)
      setActiveLobbyID(lobby.id)
      setNewLobbyName("")
      setShowLobbyForm(false)
      setNotice(`Lobby "${lobby.name}" created.`)
    })
  }

  function startCreateYap() {
    rememberDialogOpener()
    setEditingYap(null)
    setIsNewYap(true)
    setYapID("")
    setYapJSON("{\n  \n}")
    setError("")
  }

  function startEditYap(yap: Yap) {
    rememberDialogOpener()
    setEditingYap(yap)
    setIsNewYap(false)
    setYapID(yap.id)
    setYapJSON(prettyJSON(yap.data))
    setError("")
  }

  async function saveYap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      let data: unknown
      try {
        data = JSON.parse(yapJSON)
      } catch {
        throw new Error("Check the JSON syntax and try again.")
      }
      const normalized = prettyJSON(data)
      if (isNewYap) {
        await studioBackend().CreateYap(activeLobbyID, yapID, normalized)
      } else if (editingYap) {
        await studioBackend().UpdateYap(
          activeLobbyID,
          editingYap.id,
          normalized,
        )
      }
      setEditingYap(null)
      setIsNewYap(false)
      setYaps(await studioBackend().ListYaps(activeLobbyID))
      setLobbies(await studioBackend().ListLobbies())
    })
  }

  function startCreateEvent() {
    rememberDialogOpener()
    setEventKind("")
    setEventSource("studio")
    setEventJSON("{\n  \n}")
    setError("")
    setShowEventForm(true)
  }

  async function appendEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      let data: unknown
      try {
        data = JSON.parse(eventJSON)
      } catch {
        throw new Error("Check the event JSON syntax and try again.")
      }
      const created = await studioBackend().AppendEvent(
        eventKind,
        eventSource,
        prettyJSON(data),
      )
      setEvents((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created],
      )
      setShowEventForm(false)
      setNotice("Event appended. Events are immutable once saved.")
    })
  }

  async function loadMoreEvents() {
    if (!eventCursor || eventsLoading) return
    setEventsLoading(true)
    try {
      const page = await studioBackend().QueryEvents(50, eventCursor)
      setEvents((current) => {
        const existing = new Set(current.map((item) => item.id))
        return [
          ...current,
          ...page.events.filter((item) => !existing.has(item.id)),
        ]
      })
      setEventCursor(page.nextCursor)
      setEventHasMore(Boolean(page.nextCursor))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setEventsLoading(false)
    }
  }

  async function deleteYap(yap: Yap) {
    if (!window.confirm(`Permanently delete Yap "${yap.id}"?`)) return
    await run(async () => {
      await studioBackend().DeleteYap(activeLobbyID, yap.id)
      setYaps(await studioBackend().ListYaps(activeLobbyID))
      setLobbies(await studioBackend().ListLobbies())
    })
  }

  async function deleteLobby(lobby: StudioLobby) {
    if (
      !window.confirm(
        `Delete "${lobby.name}" and all ${lobby.yapCount} Yaps in it?`,
      )
    )
      return
    await run(async () => {
      await studioBackend().DeleteLobby(lobby.id)
      const rows = await studioBackend().ListLobbies()
      setLobbies(rows)
      setActiveLobbyID(rows[0]?.id ?? "")
    })
  }

  async function exportBackup() {
    if (
      !window.confirm(
        "Export an unencrypted JSON copy of this Project? Anyone with access to that file can read its data. Continue only if you can store it securely.",
      )
    ) {
      return
    }
    await run(async () => {
      const safeName = project?.name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .slice(0, 120)
      const name = safeName ? `${safeName}-backup.json` : "rizzbase-backup.json"
      const path = await studioBackend().ChooseBackupDestination(name)
      if (!path) return
      await studioBackend().ExportBackup(path)
      setNotice(
        "Encrypted Project data was exported as a decrypted JSON backup. Store it securely.",
      )
    })
  }

  if (!project && projectLoading) {
    return (
      <main className="studio-root studio-start">
        <p className="studio-start-loading" role="status">
          Checking for an open Project…
        </p>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="studio-root studio-start">
        <header className="studio-brand">
          <img
            className="studio-brand-mark"
            src={studioAsset("brand/rizzbase-mark-light.svg")}
            alt=""
          />
          <img
            className="studio-brand-wordmark"
            src={studioAsset("brand/rizzbase-wordmark-on-light.svg")}
            alt="Rizzbase"
          />
          <span className="studio-product-label">STUDIO</span>
        </header>
        <section className="studio-empty-card">
          <span className="studio-eyebrow">START WITH A PROJECT</span>
          <h1>
            Create or open
            <br />a Project.
          </h1>
          <p>
            A Project is one encrypted file stored on your device. Choose what
            to do next; nothing is uploaded.
          </p>
          <div className="studio-start-actions">
            <button
              type="button"
              className="studio-button studio-primary"
              disabled={busy}
              onClick={() => void chooseProject("create")}
            >
              NEW PROJECT
            </button>
            <button
              type="button"
              className="studio-button"
              disabled={busy}
              onClick={() => void chooseProject("open")}
            >
              OPEN EXISTING
            </button>
            <button
              type="button"
              className="studio-button"
              disabled={busy}
              onClick={() => void chooseProject("restore")}
            >
              RESTORE BACKUP
            </button>
          </div>
          <div className="studio-privacy">
            <span>ENCRYPTED BY DEFAULT</span>
            <small>
              Use a strong passphrase you can keep safe. There is no passphrase
              recovery.
            </small>
            <small>
              Questions?{" "}
              <a href="mailto:hello@rizzbase.tech">hello@rizzbase.tech</a>
              {" · "}
              <a href="mailto:paul@rizzbase.tech">paul@rizzbase.tech</a>
            </small>
            <small>
              Shortcuts: Ctrl+N for a new Project, Ctrl+O to open one.
            </small>
          </div>
        </section>
        {error && (
          <div className="studio-toast studio-error" role="alert">
            {error}
          </div>
        )}
        {projectAction && (
          <div className="studio-modal-backdrop" role="presentation">
            <form
              ref={dialogRef}
              className="studio-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="studio-project-dialog-title"
              tabIndex={-1}
              onSubmit={(event) => void submitProject(event)}
            >
              <button
                className="studio-modal-close"
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => {
                  setProjectAction(null)
                  setPassphrase("")
                  setBackupSummary(null)
                }}
              >
                ×
              </button>
              <span className="studio-eyebrow">
                {projectAction === "create"
                  ? "NEW ENCRYPTED PROJECT"
                  : projectAction === "restore"
                    ? "RESTORE FROM JSON BACKUP"
                    : "OPEN ENCRYPTED PROJECT"}
              </span>
              <h2 id="studio-project-dialog-title">
                {projectAction === "create"
                  ? "Set up a Project."
                  : projectAction === "restore"
                    ? "Encrypt restored Project."
                    : "Unlock your Project."}
              </h2>
              {projectAction === "restore" ? (
                <>
                  <p className="studio-path">JSON backup: {backupPath}</p>
                  <p className="studio-path">New Project: {projectPath}</p>
                  {backupSummary ? (
                    <section
                      className="studio-backup-summary"
                      aria-labelledby="studio-backup-summary-title"
                    >
                      <h3 id="studio-backup-summary-title">BACKUP DETAILS</h3>
                      <dl>
                        <div>
                          <dt>Project</dt>
                          <dd>{backupSummary.name}</dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>
                            <time dateTime={backupSummary.createdAt}>
                              {new Date(
                                backupSummary.createdAt,
                              ).toLocaleString()}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>Lobbies</dt>
                          <dd>{backupSummary.lobbyCount}</dd>
                        </div>
                        <div>
                          <dt>Yaps</dt>
                          <dd>{backupSummary.yapCount}</dd>
                        </div>
                      </dl>
                    </section>
                  ) : (
                    <div
                      className="studio-inline-message studio-error"
                      role="alert"
                    >
                      Backup details are unavailable. Select the backup again.
                    </div>
                  )}
                </>
              ) : (
                <p className="studio-path">{projectPath}</p>
              )}
              {error && (
                <div
                  className="studio-inline-message studio-error"
                  role="alert"
                >
                  {error}
                </div>
              )}
              {projectAction === "create" && (
                <label>
                  PROJECT NAME
                  <input
                    autoFocus
                    required
                    maxLength={256}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                </label>
              )}
              <label>
                {projectAction === "open" ? "PASSPHRASE" : "NEW PASSPHRASE"}
                <input
                  autoFocus={projectAction !== "create"}
                  required
                  type="password"
                  autoComplete={
                    projectAction === "open"
                      ? "current-password"
                      : "new-password"
                  }
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </label>
              <p className="studio-form-hint">
                {projectAction === "open"
                  ? "Enter the passphrase you chose when you created this Project. It unlocks the file and cannot be recovered if forgotten."
                  : projectAction === "restore"
                    ? "Your backup is readable JSON. Choose a strong passphrase to encrypt the restored Project; the original backup stays unencrypted."
                    : "This is the key to your Project file. Choose a long, unique passphrase and keep it safe; it cannot be recovered if lost."}
              </p>
              <button
                type="submit"
                className="studio-button studio-primary"
                disabled={
                  busy || (projectAction === "restore" && !backupSummary)
                }
              >
                {busy
                  ? "WORKING..."
                  : projectAction === "create"
                    ? "CREATE & OPEN"
                    : projectAction === "restore"
                      ? "RESTORE & OPEN"
                      : "OPEN PROJECT"}
              </button>
            </form>
          </div>
        )}
      </main>
    )
  }

  const activeLobby = lobbies.find((lobby) => lobby.id === activeLobbyID)

  return (
    <main className="studio-root studio-workspace">
      <aside className="studio-sidebar">
        <header className="studio-brand">
          <img
            className="studio-brand-mark"
            src={studioAsset("brand/rizzbase-mark-light.svg")}
            alt=""
          />
          <img
            className="studio-brand-wordmark"
            src={studioAsset("brand/rizzbase-wordmark-on-light.svg")}
            alt="Rizzbase"
          />
          <span className="studio-product-label">STUDIO</span>
        </header>
        <div className="studio-project-chip">
          <span>OPEN PROJECT</span>
          <strong>{project.name}</strong>
          <small title={project.path}>{project.path}</small>
        </div>
        <nav className="studio-section-nav" aria-label="Project sections">
          <button
            type="button"
            aria-pressed={section === "data"}
            className={section === "data" ? "active" : ""}
            onClick={() => setSection("data")}
          >
            DATA
          </button>
          <button
            type="button"
            aria-pressed={section === "events"}
            className={section === "events" ? "active" : ""}
            onClick={() => setSection("events")}
          >
            EVENTS
          </button>
        </nav>
        {section === "data" && (
          <>
            <div className="studio-sidebar-heading">
              <span>LOBBIES</span>
              <button
                type="button"
                aria-label="Create lobby"
                title="Create lobby"
                disabled={busy || preview}
                onClick={() => {
                  rememberDialogOpener()
                  setError("")
                  setShowLobbyForm(true)
                }}
              >
                +
              </button>
            </div>
            <nav className="studio-lobby-list" aria-label="Lobbies">
              {lobbies.map((lobby) => (
                <div
                  className={`studio-lobby-item ${
                    activeLobbyID === lobby.id ? "active" : ""
                  }`}
                  key={lobby.id}
                >
                  <button
                    type="button"
                    className="studio-lobby-select"
                    aria-pressed={activeLobbyID === lobby.id}
                    onClick={() => setActiveLobbyID(lobby.id)}
                  >
                    <span className="studio-lobby-dot" aria-hidden="true" />
                    <span className="studio-lobby-name">{lobby.name}</span>
                    <small aria-hidden="true">{lobby.yapCount}</small>
                    <span className="studio-sr-only">
                      {lobby.yapCount} {lobby.yapCount === 1 ? "Yap" : "Yaps"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="studio-lobby-delete"
                    aria-label={`Delete lobby ${lobby.name}`}
                    title="Delete lobby"
                    disabled={preview}
                    onClick={() => void deleteLobby(lobby)}
                  >
                    ···
                  </button>
                </div>
              ))}
              {lobbies.length === 0 && (
                <p className="studio-no-lobbies">
                  No Lobbies yet. Create one to start adding data.
                </p>
              )}
            </nav>
          </>
        )}
        <footer className="studio-sidebar-footer">
          <button
            type="button"
            onClick={() => void exportBackup()}
            disabled={busy || preview}
            title="Exports a readable, unencrypted JSON copy"
          >
            EXPORT UNENCRYPTED JSON
          </button>
          <button
            type="button"
            onClick={() => void closeProject()}
            disabled={busy || preview}
          >
            CLOSE PROJECT
          </button>
          <div className="studio-contact">
            <a href="mailto:hello@rizzbase.tech">hello@rizzbase.tech</a>
            <a href="mailto:paul@rizzbase.tech">paul@rizzbase.tech</a>
          </div>
        </footer>
      </aside>

      <section className="studio-main">
        <header className="studio-topbar">
          <div>
            <span className="studio-eyebrow">PROJECT</span>
            <strong>{project.name}</strong>
            <small className="studio-save-hint">
              Changes save as you make them.
            </small>
          </div>
          <div className={`studio-local-badge ${preview ? "is-preview" : ""}`}>
            <i /> {preview ? "PREVIEW · SAMPLE DATA" : "LOCAL & ENCRYPTED"}
          </div>
        </header>
        {preview && (
          <div
            className="studio-inline-message studio-preview-message"
            role="status"
          >
            Sample data preview only. File operations are available in the Wails
            desktop app.
          </div>
        )}
        {error && (
          <div className="studio-inline-message studio-error" role="alert">
            {error}
            <button type="button" onClick={() => setError("")}>
              DISMISS
            </button>
          </div>
        )}
        {notice && (
          <div className="studio-inline-message studio-success" role="status">
            {notice}
            <button type="button" onClick={() => setNotice("")}>
              DISMISS
            </button>
          </div>
        )}
        {projectLoading ? (
          <div className="studio-no-selection" role="status">
            <span className="studio-eyebrow">OPENING PROJECT</span>
            <h1>Loading your Project.</h1>
          </div>
        ) : section === "events" ? (
          <div className="studio-content">
            <div className="studio-content-heading">
              <div>
                <span className="studio-eyebrow">
                  APPEND-ONLY · {events.length} LOADED
                </span>
                <h1>
                  Events<span>.</span>
                </h1>
                <p>
                  A timestamped activity stream stored inside this encrypted
                  Project. Events cannot be edited or deleted.
                </p>
              </div>
              <button
                type="button"
                className="studio-button studio-primary"
                disabled={busy || eventsLoading || preview}
                onClick={startCreateEvent}
              >
                + APPEND EVENT
              </button>
            </div>
            {eventsLoading && events.length === 0 ? (
              <p className="studio-events-empty" role="status">
                Loading events…
              </p>
            ) : events.length === 0 ? (
              <section className="studio-events-empty">
                <h2>No events yet</h2>
                <p>
                  Append an event to start a permanent, ordered record of
                  activity in this Project.
                </p>
                <button
                  type="button"
                  className="studio-button studio-primary"
                  disabled={busy || eventsLoading || preview}
                  onClick={startCreateEvent}
                >
                  APPEND YOUR FIRST EVENT
                </button>
              </section>
            ) : (
              <>
                <section
                  className="studio-event-list"
                  aria-label="Project events"
                >
                  {events.map((item) => (
                    <article className="studio-event-row" key={item.id}>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                      <div>
                        <strong>{item.kind}</strong>
                        <small>
                          {item.source || "No source"} · {item.id}
                        </small>
                      </div>
                      <pre>{prettyJSON(item.data)}</pre>
                    </article>
                  ))}
                </section>
                {eventHasMore && (
                  <button
                    type="button"
                    className="studio-button studio-load-more"
                    disabled={eventsLoading}
                    onClick={() => void loadMoreEvents()}
                  >
                    {eventsLoading ? "LOADING…" : "LOAD MORE EVENTS"}
                  </button>
                )}
              </>
            )}
          </div>
        ) : activeLobby ? (
          <div className="studio-content">
            <div className="studio-content-heading">
              <div>
                <span className="studio-eyebrow">
                  LOBBY · {yaps.length} YAPS
                </span>
                <h1>
                  {activeLobby.name}
                  <span>.</span>
                </h1>
                <p>Browse and edit JSON documents in this Lobby.</p>
              </div>
              <button
                type="button"
                className="studio-button studio-primary"
                disabled={busy || preview}
                onClick={startCreateYap}
              >
                + NEW YAP
              </button>
            </div>
            <div className="studio-table-wrap">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">PREVIEW</th>
                    <th scope="col">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {yaps.map((yap) => (
                    <tr key={yap.id}>
                      <td>
                        <code>{yap.id}</code>
                      </td>
                      <td>
                        <pre>{prettyJSON(yap.data)}</pre>
                      </td>
                      <td className="studio-row-actions">
                        <button
                          type="button"
                          aria-label={`Edit Yap ${yap.id}`}
                          disabled={preview}
                          onClick={() => startEditYap(yap)}
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete Yap ${yap.id}`}
                          disabled={preview}
                          onClick={() => void deleteYap(yap)}
                        >
                          DELETE
                        </button>
                      </td>
                    </tr>
                  ))}
                  {yapsLoading ? (
                    <tr>
                      <td className="studio-empty-row" colSpan={3}>
                        Loading documents…
                      </td>
                    </tr>
                  ) : yaps.length === 0 ? (
                    <tr>
                      <td className="studio-empty-row" colSpan={3}>
                        <span>
                          This Lobby is empty. Add a Yap to get started.
                        </span>
                        <button
                          type="button"
                          className="studio-button studio-primary"
                          disabled={busy || preview}
                          onClick={startCreateYap}
                        >
                          ADD FIRST YAP
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="studio-no-selection">
            <span className="studio-eyebrow">YOUR PROJECT IS READY</span>
            <h1>
              Create a Lobby
              <br />
              to get started.
            </h1>
            <button
              type="button"
              className="studio-button studio-primary"
              disabled={busy || preview}
              onClick={() => {
                rememberDialogOpener()
                setError("")
                setShowLobbyForm(true)
              }}
            >
              + CREATE LOBBY
            </button>
          </div>
        )}
      </section>

      {(projectAction ||
        showLobbyForm ||
        showEventForm ||
        isNewYap ||
        editingYap) && (
        <div className="studio-modal-backdrop" role="presentation">
          {projectAction ? (
            <form
              ref={dialogRef}
              className="studio-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="studio-project-switch-title"
              tabIndex={-1}
              onSubmit={(event) => void submitProject(event)}
            >
              <button
                className="studio-modal-close"
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => {
                  setProjectAction(null)
                  setPassphrase("")
                }}
              >
                ×
              </button>
              <span className="studio-eyebrow">
                {projectAction === "create" ? "NEW PROJECT" : "OPEN PROJECT"}
              </span>
              <h2 id="studio-project-switch-title">
                {projectAction === "create"
                  ? "Create another Project."
                  : "Open another Project."}
              </h2>
              <p className="studio-path">{projectPath}</p>
              {error && (
                <div
                  className="studio-inline-message studio-error"
                  role="alert"
                >
                  {error}
                </div>
              )}
              {projectAction === "create" && (
                <label>
                  PROJECT NAME
                  <input
                    autoFocus
                    required
                    maxLength={256}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                </label>
              )}
              <label>
                {projectAction === "open" ? "PASSPHRASE" : "NEW PASSPHRASE"}
                <input
                  autoFocus={projectAction === "open"}
                  required
                  type="password"
                  autoComplete={
                    projectAction === "open"
                      ? "current-password"
                      : "new-password"
                  }
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </label>
              <p className="studio-form-hint">
                {projectAction === "open"
                  ? "Enter the passphrase you chose when you created this Project. It unlocks the file and cannot be recovered if forgotten."
                  : "This is the key to your Project file. Choose a long, unique passphrase and keep it safe; it cannot be recovered if lost."}
              </p>
              <button
                type="submit"
                className="studio-button studio-primary"
                disabled={busy}
              >
                {busy
                  ? "WORKING..."
                  : projectAction === "create"
                    ? "CREATE & OPEN"
                    : "OPEN PROJECT"}
              </button>
            </form>
          ) : showLobbyForm ? (
            <form
              ref={dialogRef}
              className="studio-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="studio-lobby-dialog-title"
              tabIndex={-1}
              onSubmit={(event) => void createLobby(event)}
            >
              <button
                className="studio-modal-close"
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => setShowLobbyForm(false)}
              >
                ×
              </button>
              <span className="studio-eyebrow">NEW LOBBY</span>
              <h2 id="studio-lobby-dialog-title">Create a Lobby.</h2>
              {error && (
                <div
                  className="studio-inline-message studio-error"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <label>
                LOBBY NAME
                <input
                  autoFocus
                  required
                  maxLength={256}
                  value={newLobbyName}
                  onChange={(event) => setNewLobbyName(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="studio-button studio-primary"
                disabled={busy}
              >
                CREATE LOBBY
              </button>
            </form>
          ) : isNewYap || editingYap ? (
            <form
              ref={dialogRef}
              className="studio-modal studio-yap-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="studio-yap-dialog-title"
              tabIndex={-1}
              onSubmit={(event) => void saveYap(event)}
            >
              <button
                className="studio-modal-close"
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => {
                  setIsNewYap(false)
                  setEditingYap(null)
                }}
              >
                ×
              </button>
              <span className="studio-eyebrow">
                {isNewYap ? "NEW DOCUMENT" : "EDIT DOCUMENT"}
              </span>
              <h2 id="studio-yap-dialog-title">
                {isNewYap ? "Add a Yap." : "Edit this Yap."}
              </h2>
              {error && (
                <div
                  className="studio-inline-message studio-error"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <label>
                YAP ID
                <input
                  autoFocus
                  required
                  maxLength={128}
                  disabled={!isNewYap}
                  value={yapID}
                  onChange={(event) => setYapID(event.target.value)}
                />
              </label>
              <label>
                JSON DATA
                <textarea
                  className="studio-json-input"
                  required
                  spellCheck={false}
                  value={yapJSON}
                  onChange={(event) => setYapJSON(event.target.value)}
                />
              </label>
              <p className="studio-form-hint">
                Data must be a valid JSON value. Saving replaces the complete
                document.
              </p>
              <button
                type="submit"
                className="studio-button studio-primary"
                disabled={busy}
              >
                {busy ? "SAVING..." : "SAVE YAP"}
              </button>
            </form>
          ) : showEventForm ? (
            <form
              ref={dialogRef}
              className="studio-modal studio-yap-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="studio-event-dialog-title"
              tabIndex={-1}
              onSubmit={(event) => void appendEvent(event)}
            >
              <button
                className="studio-modal-close"
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => setShowEventForm(false)}
              >
                ×
              </button>
              <span className="studio-eyebrow">APPEND-ONLY EVENT</span>
              <h2 id="studio-event-dialog-title">Record activity.</h2>
              <p className="studio-form-hint">
                Events are saved in this encrypted Project and cannot be changed
                or removed later.
              </p>
              {error && (
                <div
                  className="studio-inline-message studio-error"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <label>
                EVENT KIND
                <input
                  autoFocus
                  required
                  maxLength={256}
                  value={eventKind}
                  onChange={(event) => setEventKind(event.target.value)}
                  placeholder="e.g. note.created"
                />
              </label>
              <label>
                SOURCE (OPTIONAL)
                <input
                  maxLength={256}
                  value={eventSource}
                  onChange={(event) => setEventSource(event.target.value)}
                  placeholder="e.g. studio"
                />
              </label>
              <label>
                JSON DATA
                <textarea
                  className="studio-json-input"
                  required
                  spellCheck={false}
                  value={eventJSON}
                  onChange={(event) => setEventJSON(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="studio-button studio-primary"
                disabled={busy}
              >
                {busy ? "APPENDING…" : "APPEND EVENT"}
              </button>
            </form>
          ) : null}
        </div>
      )}
    </main>
  )
}

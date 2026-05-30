## ADDED Requirements

### Requirement: Open the markdown viewer for a project

The application SHALL allow the user to open a markdown viewer panel for the active project, scoped to files inside the project's root directory.

#### Scenario: User opens the Docs panel from the workspace header

- **WHEN** the active tab is a project (primary tree or worktree) and the user clicks the "Docs" affordance in the workspace header
- **THEN** the application SHALL open a slide-over panel listing markdown files (`*.md`, `*.markdown`) found within the project's root up to three directories deep, in lexicographic order

#### Scenario: Project with no markdown files

- **WHEN** the user opens the Docs panel for a project that contains no markdown files under its root within the three-directory depth limit
- **THEN** the panel SHALL render an empty-state message and SHALL NOT offer a file to render

#### Scenario: Panel scope is the active tab's project

- **WHEN** the user switches the active tab to a different project while the Docs panel is open
- **THEN** the panel's file list SHALL refresh to reflect the new project's root and any currently-rendered file SHALL be cleared

### Requirement: Render a markdown file safely

The application SHALL render the selected markdown file's contents inside the Docs panel using a parser that produces sanitised HTML. The renderer MUST strip `<script>` elements, inline event handlers, and any element or attribute outside an explicit allow-list. Hyperlinks MUST be restricted to `http:`, `https:`, and `mailto:` URL schemes; any other scheme MUST be rendered as inert text.

#### Scenario: Script tags are stripped

- **WHEN** a markdown file contains an HTML `<script>` block or `javascript:` URL
- **THEN** the rendered output SHALL omit the script element entirely and the link SHALL render as plain text

#### Scenario: External links open in the default browser

- **WHEN** the user clicks a rendered link whose href uses `http:` or `https:`
- **THEN** the application SHALL open the URL in the OS default browser (not in an Electron window)

#### Scenario: Code blocks are syntax-highlighted on first use

- **WHEN** the renderer encounters at least one fenced code block in a file
- **THEN** the application SHALL lazy-load a syntax highlighter and apply per-token highlighting to that block and any subsequent code blocks in the same session

#### Scenario: Heading anchors enable in-document navigation

- **WHEN** a rendered markdown file contains headings
- **THEN** each heading SHALL receive a stable `id` derived from its text, and a click on an internal hash link (e.g. `#installation`) SHALL scroll the matching heading into view inside the panel

### Requirement: Project-scoped file access for documentation reads

The main process SHALL expose an IPC pair (`docs:list`, `docs:read`) that the renderer uses to enumerate and read markdown files. The implementation MUST refuse any request whose resolved absolute path escapes the project's root directory, and MUST refuse reading files larger than 2 MB.

#### Scenario: Listing returns relative paths under the project root

- **WHEN** the renderer invokes `docs:list({ projectId })`
- **THEN** the response SHALL contain only paths whose resolved absolute form starts with the project's root path, and each entry SHALL include the file's modification time and byte size

#### Scenario: Path-traversal attempts are rejected

- **WHEN** the renderer invokes `docs:read({ projectId, relPath: "../../etc/passwd" })`
- **THEN** the main process SHALL reject the request without reading the file and the renderer SHALL display an error toast

#### Scenario: Oversized files are refused

- **WHEN** the renderer invokes `docs:read` for a markdown file larger than 2 MB
- **THEN** the main process SHALL refuse the read and the panel SHALL display a message indicating the file is too large to display

### Requirement: Resolve relative image paths against project root

The renderer SHALL rewrite any relative image `src` attribute in the rendered markdown to a `file://` URL whose absolute path is resolved against the active project's root directory. The renderer MUST NOT load images whose resolved absolute path escapes the project root.

#### Scenario: Relative image is rendered

- **WHEN** a markdown file contains `![alt](./docs/diagram.png)` and `<project-root>/docs/diagram.png` exists
- **THEN** the rendered `<img>` element SHALL have an `src` attribute beginning with `file://` and pointing at the resolved absolute path

#### Scenario: Image path escapes the project root

- **WHEN** a markdown file contains an image whose relative path resolves outside the project root
- **THEN** the renderer SHALL replace the image with its alt text and SHALL NOT issue a file:// load

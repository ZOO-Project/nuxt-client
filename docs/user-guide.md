# User guide

The WebUI talks to one OGC API - Processes server (the *ZOO-Project*). The header shows the
navigation tabs discovered from the server's landing page (Home, Swagger, Conformance,
Processes, Jobs), the settings menu (language, dark mode, layout) and the login button when an
OpenID Connect provider is configured. A thin yellow progress bar at the very top of the window
shows that a page is loading or that the server is being called.

## Signing in

Click **Authenticate** (top right), then **Sign in with Keycloak** and enter your credentials
on the identity provider. Once signed in, your name appears in the header; the menu under your
avatar gives access to your profile on the identity provider and to **Logout**.

When the access token expires and cannot be refreshed (the identity provider closed the
session), the header shows **Session expired** with the sign-in button and the pages fall back
to anonymous access where the server allows it.

Signing in is optional when the server accepts anonymous requests
(`ZOO_OGCAPI_REQUIRES_BEARER_TOKEN=false`). When the server requires a token, the pages show a
notice until you sign in. When signed in, every request to the server carries your bearer
token, and the ZOO-Project serves your own namespace of processes and jobs.

## Home

- **Service card**: title, version, description (Markdown), contact, license and keywords taken
  from the OpenAPI document.
- **Capabilities**: badges for the conformance classes the server declares (Core, JSON,
  Process description, Job list, Dismiss, Callback, Deploy/Replace/Undeploy, CWL packages, ...).
  Click *All conformance classes* for the full list.
- **Available links**: the landing-page links, grouped by title.

## Processes

The list shows every process the server offers with its identifier, title, description,
version and kind:

- **Built-in** processes are shipped with the server (`mutable: false`): they can be viewed and
  executed but not replaced or deleted.
- **Deployed** processes were deployed through the API (`mutable: true`): they can be replaced,
  undeployed and their application package downloaded.

The icons under the kind badge recall the execution modes (`async`, `sync`) and whether jobs
can be dismissed. The search box filters on identifier, title, description and keywords.

Click a row to open the process page (built-in) or to preview the application package of a
deployed process: its CWL workflow is drawn as an interactive graph (with
[cwl-svg](https://github.com/rabix/cwl-svg), the renderer of the Rabix Composer), next to the
process metadata, inputs and outputs. In the graph, inputs are the sand-coloured nodes, steps
the brown ones and outputs the green ones; the links follow the data. Hovering a node shows
the names of its ports, clicking a node or a link opens the details panel (type, documentation,
command and container image of a step, ports and connections). The toolbar zooms, fits the
graph to the view, rearranges it, downloads it as an SVG file, toggles the details panel and
goes full screen; the mouse wheel zooms, dragging the background pans and nodes can be moved.
Packed documents (`$graph`) are resolved and a single CommandLineTool is drawn as a one-step
workflow. **Application Package** next to the title shows the raw CWL text.

The **Actions** menu offers:

- **View & execute** — open the process page.
- **Jobs** — open the job list filtered on this process.
- **Package** — show and download the CWL application package (deployed processes).
- **Replace** — upload a new version of the package (`PUT /processes/{id}`).
- **Delete** — undeploy the process (`DELETE /processes/{id}`). The server answers
  *ImmutableProcess* when the package copy is missing; the message is shown as is.

### Deploying a process

**Add a process** opens the deployment dialog (shown only when the server declares the
*deploy-replace-undeploy* conformance class). Choose one of:

- **Upload a .cwl file** — pick a file from your computer.
- **Paste** — paste the YAML/JSON text of the package.
- **From a URL** — give the URL of the package; the server downloads it
  (`application/ogcapppkg+json` with an `executionUnit.href`). Use **Preview** to fetch it in
  the browser first when the remote site allows it.

The package is validated locally (`cwlVersion`, `class`/`$graph`), summarised (identifier,
class, CWL version, software version) and drawn as a workflow graph, which follows the text as
you edit it. The identifier declared in the package is proposed as
process name; leave it or override it. After a successful deployment you are taken to the new
process page. A `409` answer means a process with the same identifier already exists: use
**Replace** instead.

## Executing a process

The process page lists the metadata (version, keywords, additional schema.org metadata) and a
form generated from the process description:

- **Inputs** — literals, numbers, enumerations, multiple values (*Add another value*),
  complex inputs by value (with a format selector) or by reference (`href`), and bounding
  boxes which can be drawn on a map (with CRS selection). Optional inputs must be enabled with
  their checkbox.
- **Outputs** — transmission mode (`value` or `reference`), format, and whether the output is
  requested at all (*Request this output*). An output named like an optional input that is not
  enabled is not requested unless you tick it: services such as `echo` return an empty output
  otherwise, which the server cannot serialise.
- **Notification endpoints** — subscriber URLs called by the server (filled automatically to
  feed the live progress through WebSocket); they are only sent for asynchronous executions.
- **Execution mode** — asynchronous (a job is created, recommended) or synchronous (the
  response is returned directly as a JSON document, `response: document`); only the modes
  supported by the process are proposed.

**Show JSON preview** displays the exact execute request; it can be edited before sending and
copied as a `curl` command. **Execute** sends the request. For asynchronous executions the
progress bar and messages update while the job runs; **Open the job page** follows the job in
the Jobs section; **Dismiss job** cancels a running job (the server removes dismissed jobs).
The execution response (or the error returned by the server) is shown at the bottom.

## Jobs

The list is paginated on the server (10 to 100 rows per page), most recent jobs first (the
server lists jobs oldest first without a sort parameter, so the UI reads the end of the list
for the first page), and can be filtered by **status**, by **process**, and searched within
the current page. **Auto-refresh** reloads the
page every 5 seconds while jobs are running (every 30 seconds otherwise). Each row shows the
status chip, a shortened job identifier (with a copy button), the process, the creation time
(hover for the relative time), the duration and the server message. The actions open the job,
open the raw results in a new tab and dismiss/delete the job. Select several rows to delete
them at once.

### Job page

- **Header**: status, process (link), job identifier, server message and, for running jobs,
  the progress bar. The page polls the server every 3 seconds until the job finishes.
- **Actions**: refresh, copy the page link, **Dismiss** (running job) or **Delete** (finished
  job).
- **Timeline**: created, started, updated, finished and total duration.
- **Results** (successful or failed jobs): one block per output — values, references (with an
  image preview when the reference is an image), GeoJSON features or bounding boxes drawn on a
  map, nested documents as JSON. The raw results document is available at the bottom. For
  failed jobs the exception document returned by the server is shown as an error banner.
- **Logs**: links of relation `related` (or plain text) published by the server, such as the
  per-step logs of CWL workflows, can be expanded inline.
- **Links**: every other link of the job (status location, results location...).
- **Raw job document**: the status document as returned by the server.

## Swagger and Conformance

**Swagger** embeds Swagger UI on the server's OpenAPI document; when signed in, requests sent
from Swagger carry your token. The document is assembled by the UI server before display so
that the OGC schema files it references (CQL2 filters of collection values, for instance) are
resolved correctly. **Conformance** lists the conformance classes declared by the server.

## Settings

The gear icon opens the settings: **language** (English / French), **dark mode** and the
page **layout**. Preferences are kept in cookies and applied when the page is rendered on the
server, so every page loads directly in the chosen theme and language (Quasar's own labels,
such as the table pagination, follow the language too). Without a choice the theme follows
the system setting; `?theme=dark` or `?theme=light` in the address bar forces and remembers one.

If the UI server cannot assemble the OpenAPI document (no outbound access to the OGC schema
hosts), Swagger shows the raw document and the references it cannot resolve are listed in a
small banner above the documentation; expand *Details* to see them or close the banner.

## Results of multi-output jobs

Asynchronous jobs are executed in the default "raw" mode (asking ZOO-Project for the full
response document crashes its worker, see `known-issues.md`). When such a job has several
outputs, the server answers the results request with a `Multipart/Related` document: the job
page splits it into one entry per output, with inline values, links to referenced files and a
map for bounding boxes. CWL jobs answer with the STAC `FeatureCollection` of their outputs: it is
shown on a map, with the list of the items' assets.


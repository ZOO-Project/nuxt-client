# Known server-side issues

Problems found while exercising every page of the UI against a local ZOO-Project DRU stack
(chart `zoo-project-dru` 0.10.9, kernel 2.1.1-dev, November 2026). They belong to the kernel
or to the CWL runner, not to this client; the UI works around the ones it can. Each entry
gives a reproduction so that it can be reported upstream.

## Jobs

### A CWL job never leaves `running` when the subscriber block is sent twice

**Symptom.** A job of a deployed CWL process reaches `progress: 100`, message
`execution successful`, the stage-out is done and the results file exists, but the `services`
row keeps `fstate = Running`, `end_time` stays empty, the API answers `running` forever and
`GET /jobs/{id}/results` returns `404 ResultNotReady`.

**Trigger.** The execute request carries the subscriber URIs **both** at the top level
(`subscriber`, as in OGC API - Processes) and under `executionOptions.subscriber`. Seven runs
of the same process: both blocks present → stuck (2/2); only one of them, or none → `Succeeded`
(5/5). Built-in Python services (`echo`) are not affected.

```bash
# stuck
curl -X POST $API/processes/hello-jules/execution -H 'Content-Type: application/json' \
  -H 'Prefer: respond-async' -d '{"inputs":{"name":"x"},
  "subscriber":{"successUri":"http://zoo-project-dru-service/cgi-bin/publish.py?jobid=J&type=success",
                "inProgressUri":"http://zoo-project-dru-service/cgi-bin/publish.py?jobid=J&type=inProgress",
                "failedUri":"http://zoo-project-dru-service/cgi-bin/publish.py?jobid=J&type=failed"},
  "executionOptions":{"subscriber":{"successUri":"...","inProgressUri":"...","failedUri":"..."}}}'
```

The forked FPM worker exits without going through `recordResponse` (`zoo_service_loader.c`,
end of `runAsyncRequest`); the callback threads live in `service_callback.c`. The UI now sends
the standard `subscriber` block only.

### A failing CWL tool hides its error behind `KeyError: 'service_logs'`

When the tool exits with a non-zero code the job ends `failed` with a Python traceback instead
of the tool's message: `zoo_template_common/common_execution_handler.py`, line 231,
`self.conf["service_logs"]["length"] = str(cindex)` raises because no `service_logs` section
exists. No log link is published, and the job namespace (`<process>-<jobid>`) with its pods in
`Error` is not cleaned up.

### `GET /jobs/{id}/results` of a failed job answers 200

The body is an exception document (`NoApplicableCode`) but the status code is `200` instead of
an error code. The UI recognises exception documents and shows them as errors.

### The jobs list has no order

`GET /jobs` returns the rows in insertion order (oldest first) and ignores any sort parameter,
so clients paginating from `skip=0` show the oldest jobs first. The UI reads the end of the list
for its first page.

## Execution

### Synchronous responses with several outputs lack the CORS headers

`POST /processes/echo/execution` with `Prefer: respond-sync` and more than one output returns a
`multipart/related` body **without** `Access-Control-Allow-Origin` (the `X-Powered-By` headers
are missing too), so browsers block the response. With a single output, or with
`"response": "document"`, the headers are present. The UI requests `response: document` for
synchronous runs.

### `response: document` fails on empty outputs

Requesting an output whose value is empty (for instance `c` of `echo` when no `c` input was
given) with `"response": "document"` answers `400 InvalidParameterValue — ZOO-Kernel cannot
parse your POST data: None`, although the request is valid; the `raw` response returns `NULL`
for that output. The UI lets the user choose the outputs and, by default, does not request an
output named like a disabled optional input.

### Cosmetic

- Status line `HTTP/1.1 200 OK;` (trailing semicolon) on `response: raw` answers.
- A failing synchronous execution answers `500 Not Implemented` (reason phrase of a different
  status code).
- French kernel message: « Le noyau ZOO-Kernel a exécuter votre service avec succès ! »
  (« a exécuté »).

## Added on 2026-11-18 (second test campaign)

### Asynchronous CWL job stuck in `running` when the full response document is requested (blocking)

Asking for the response document on an asynchronous CWL (DRU) execution, either with
`"response": "document"` in the body or with `Prefer: respond-async;return=representation`,
makes the FPM worker crash right after the Python service succeeded: the job's
`<process>_final_<id>.json` holds `Status: 500 Not Implemented ... receiving signal 11 = SIGSEGV`,
the response file stays empty, `services.fstate` stays `Running` with no `end_time`, and
`/jobs/{id}/results` answers `404 ResultNotReady` forever. Reproduced 5 times (anonymous and
user namespace, with and without `subscriber`, after an FPM restart); the same request without
`response` or with `response: raw` succeeds. This is the actual cause of the "stuck job" noted
on 2026-11-17 (the duplicated `subscriber` was a coincidence). The UI no longer sends
`return=representation` for asynchronous runs.

```bash
curl -s -X POST http://localhost:8080/ogc-api/processes/hello-jules/execution \
  -H 'Content-Type: application/json' -H 'Prefer: respond-async' \
  -d '{"inputs":{"name":"x"},"outputs":{"results":{"transmissionMode":"reference"}},"response":"document"}'
# -> status stays "running" (progress 100, message "execution successful")
```

### Dismissing a running job re-executes it and blocks the worker (major)

`DELETE /jobs/{id}` on a running job kills the FPM consumer; its unacknowledged RabbitMQ message
goes back to `messages_ready` and the respawned consumer runs the (already deleted) job again.
With the effective one-worker pool, every later job waits for that invisible re-execution:
`echo` with `pause=1` measured at 31 s, 81 s, 84 s and 88 s after a dismiss (4 s otherwise).
`rabbitmqctl purge_queue zoo_service_queue` only drops the `ready` messages.

### About one second per OGC API request (medium)

Every OGC API request (landing page, `/conformance`, `/processes`, `/jobs`...) takes 0.9-1 s
while the WPS `GetCapabilities` answers in 0.2 s: the `securityIn` hook (`has_jwt_service=true`)
imports `jwt`, `redis` and `requests` on each request (about 680 ms of Python imports measured
in the kernel pod, on an emulated amd64 platform). The whole UI pays it on every call.

### Internal `cwl_pack` listed as a process (minor)

`cwl_pack` is the hook used by the multipart/related deployment (it reads `conf["cwl-parts"]`)
but it is listed in `/processes`; executed from the UI it fails with `500 No message provided`
(sync) or a `failed` job (async).

### Deleted job still listed right after the DELETE (minor)

Right after `DELETE /jobs/{id}` returns, `/jobs` may still list the job once; the UI now removes
the deleted rows itself and refreshes the list a moment later.

### Deleting finished jobs goes through the worker queue (medium)

`DELETE /jobs/{id}` on a finished job answers `200` and publishes a message in
`zoo_service_queue`; the worker picks these messages at its polling pace (about one every
20-30 s). Deleting 13 jobs in a row left 13 messages in the queue; an `echo` job with `pause=1`
submitted behind 8 of them completed after 284 s.

## Added on 2026-11-19

### `GET /processes/{id}/package` answers 406 for processes deployed anonymously (medium)

With `Accept: application/cwl+yaml` (or any `application/cwl*` value) the kernel looks for
`<processId>.cwl` next to `main.cfg`, then in the services namespace folder
(`searchForFile`, `service_json.c`). For the anonymous namespace `getServicesNamespacePath`
maps the namespace to the `main.cfg` folder itself (`/usr/lib/cgi-bin`), where no package copy
is ever written, so every anonymous process answers `406 NotAcceptable` ("The resource is not
available in the requested encoding") although its package exists at
`/opt/zooservices_user/anonymous/<processId>/app-package.cwl`. In a user namespace the kernel
keeps a copy at `/opt/zooservices_user/<user>/<processId>.cwl` after the deployment and the
same request answers `200`. The UI shows its "package not available" message in that case.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/cwl+yaml' \
  http://localhost:8080/ogc-api/processes/hello-jules/package          # 406
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/cwl+yaml' \
  http://localhost:8080/jules/ogc-api/processes/hello-jules/package    # 200 (even anonymously)
```

## Added on 2026-11-20 (third test campaign, after the dependency upgrades)

### Packed `$graph` documents are rejected by `POST /processes` (minor)

A CWL document in packed form (`$graph` with the `Workflow` and its `CommandLineTool`s) sent
with `Content-Type: application/cwl+yaml` answers `400 WorkflowNotFound` with the detail
`Value is a array, but valid type for this field is an object` repeated five times, whatever
the identifier of the workflow (`main`, `#main` or a custom one). The same workflow with the
tool inlined in the step's `run` is accepted (`201`). The kernel itself stores every package in
packed form (`app-package.cwl` of `hello-jules`) and the multipart/related deployment builds a
packed document, so only the direct upload of a packed file is refused. The UI deploy dialog
shows the server message; `cwltool --pack` users have to unpack their document first.

```bash
curl -s -X POST http://localhost:8080/ogc-api/processes -H 'Content-Type: application/cwl+yaml' \
  -H 'Accept: application/json' --data-binary @packed.cwl -w '%{http_code}\n'      # 400
```

### `GET /ogc-api/?f=json` answers 400 (minor)

The landing page refuses the `f=json` query parameter (`400 BadRequest`, "The resource is
not available") while `/ogc-api/` with `Accept: application/json` answers `200` and the other
routes (`/conformance`, `/jobs`, `/jobs/{id}`...) accept `f=json`. The UI's landing JSON page
sent `f=json` and showed the error; it now relies on the `Accept` header only.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/json' http://localhost:8080/ogc-api/          # 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/json' 'http://localhost:8080/ogc-api/?f=json' # 400
```

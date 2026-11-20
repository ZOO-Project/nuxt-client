import { useI18n } from 'vue-i18n'
import { jobsQuery, type JobsPage } from '~/composables/utils/jobs'

export type ListJobsOptions = {
  limit?: number
  skip?: number
  status?: string[]
  processID?: string
}

/** Thin typed wrapper around the OGC API - Processes job endpoints. */
export function useJobsApi() {
  const { apiFetch } = useOgcApiServer()
  const { locale } = useI18n()

  const listJobs = (options: ListJobsOptions = {}) =>
    apiFetch<JobsPage>('/jobs', {
      query: { ...jobsQuery(options), f: 'json' },
      acceptLanguage: locale.value
    })

  const getJob = (jobId: string) =>
    apiFetch<any>(`/jobs/${encodeURIComponent(jobId)}`, { query: { f: 'json' }, acceptLanguage: locale.value })

  const getJobResults = (jobId: string) =>
    apiFetch<any>(`/jobs/${encodeURIComponent(jobId)}/results`, { query: { f: 'json' }, acceptLanguage: locale.value })

  /** Dismiss a running job or delete a finished one (DELETE /jobs/{id}). */
  const dismissJob = (jobId: string) =>
    apiFetch<any>(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE', acceptLanguage: locale.value })

  /** Fetch an arbitrary link (logs, results...) as text or JSON. */
  const fetchLink = (href: string, asText = false) =>
    apiFetch<any>(href, {
      responseType: asText ? 'text' : 'json',
      accept: asText ? 'text/plain, */*' : 'application/json, */*',
      acceptLanguage: locale.value
    })

  return { listJobs, getJob, getJobResults, dismissJob, fetchLink }
}

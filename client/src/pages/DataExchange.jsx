import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileDown, FileSpreadsheet, FileUp, Loader2, RotateCcw } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import FilterSelect from '@/components/common/FilterSelect'
import PageHeader from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorDetails, getErrorMessage } from '@/lib/api'
import { formatBytes } from '@/lib/files'
import { commitImport, downloadTemplate, exportDataset, listDatasets, previewImport } from '@/services/data'

const ACTION_META = {
  create: { label: 'Create', variant: 'success' },
  update: { label: 'Update', variant: 'info' },
  skip: { label: 'Unchanged', variant: 'secondary' },
  reject: { label: 'Rejected', variant: 'destructive' },
}

function SummaryChips({ summary }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Import summary">
      {['create', 'update', 'skip', 'reject'].map((action) => (
        <li key={action}>
          <Badge variant={ACTION_META[action].variant} className="text-sm">
            {summary[action]} {ACTION_META[action].label.toLowerCase()}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

export default function DataExchange() {
  const { user } = useAuth()
  const policy = usePolicy()
  const { toast } = useToast()
  const fileInput = useRef(null)

  const [datasets, setDatasets] = useState([])
  const [dataset, setDataset] = useState('')
  const [busy, setBusy] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [onlyProblems, setOnlyProblems] = useState(false)

  useEffect(() => {
    listDatasets()
      .then((rows) => {
        setDatasets(rows)
        setDataset((current) => current || rows[0]?.value || '')
      })
      .catch((err) => setError({ message: getErrorMessage(err), details: [] }))
  }, [])

  const def = datasets.find((d) => d.value === dataset)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setOnlyProblems(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  useEffect(reset, [dataset])

  const run = async (label, fn) => {
    setBusy(label)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const download = (kind) =>
    run(kind, async () => {
      try {
        const name = kind === 'export' ? await exportDataset(dataset) : await downloadTemplate(dataset)
        toast({ title: kind === 'export' ? 'Export ready' : 'Template downloaded', description: name, variant: 'success' })
      } catch (err) {
        toast({ title: 'Download failed', description: getErrorMessage(err), variant: 'destructive' })
      }
    })

  const choose = (event) => {
    const chosen = event.target.files?.[0]
    setPreview(null)
    setResult(null)
    setError(null)
    if (!chosen) return setFile(null)
    if (!/\.csv$/i.test(chosen.name)) {
      setError({ message: 'Only .csv files can be imported', details: [{ message: 'In your spreadsheet app use File → Save as → CSV UTF-8.' }] })
      return setFile(null)
    }
    if (chosen.size > policy.importMaxBytes) {
      setError({ message: `The file is larger than ${formatBytes(policy.importMaxBytes)}`, details: [{ message: 'Split it into smaller files.' }] })
      return setFile(null)
    }
    return setFile(chosen)
  }

  const validate = () =>
    run('preview', async () => {
      setError(null)
      try {
        const csv = await file.text()
        setPreview({ ...(await previewImport(dataset, { csv, filename: file.name })), csv, filename: file.name })
      } catch (err) {
        setError({ message: getErrorMessage(err), details: getErrorDetails(err) })
      }
    })

  const confirm = () =>
    run('commit', async () => {
      try {
        const res = await commitImport(dataset, { csv: preview.csv, filename: preview.filename })
        setResult(res)
        setPreview(null)
        toast({
          title: res.applied ? 'Import complete' : 'Nothing was imported',
          description: `${res.summary.create} created, ${res.summary.update} updated, ${res.summary.skip} unchanged, ${res.summary.reject} rejected.`,
          variant: res.applied ? 'success' : 'destructive',
        })
      } catch (err) {
        setError({ message: getErrorMessage(err), details: getErrorDetails(err) })
      }
    })

  const shown = useMemo(() => {
    const rows = (result ?? preview)?.rows ?? []
    return onlyProblems ? rows.filter((r) => r.errors.length || r.warnings.length) : rows
  }, [preview, result, onlyProblems])

  const report = result ?? preview
  const applicable = preview ? preview.summary.create + preview.summary.update : 0
  const columns = def?.columns.filter((c) => c !== 'password').slice(0, 4) ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import / Export"
        description={
          user?.role === 'admin'
            ? 'Exchange students, faculty, classes, schedules and attendance as CSV. Every import is validated and previewed before anything changes.'
            : 'Export or import attendance for the classes you teach. Every import is validated and previewed before anything changes.'
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-6">
          <FilterSelect
            id="data-dataset"
            label="Dataset"
            value={dataset}
            onChange={(v) => v && setDataset(v)}
            options={datasets.map((d) => ({ value: d.value, label: d.label }))}
            allLabel="Choose a dataset"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => download('export')} disabled={!dataset || busy}>
              {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => download('template')} disabled={!dataset || busy}>
              {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download template
            </Button>
          </div>
          {def ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Columns: <span className="font-mono">{def.columns.join(', ')}</span>. Required: <span className="font-mono">{def.required.join(', ')}</span>.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {def && !def.canImport ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={FileUp} title="Imports are disabled" description="Your institution has turned off attendance imports by faculty. You can still export." />
          </CardContent>
        </Card>
      ) : null}

      {def?.canImport ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import {def.label.toLowerCase()}</CardTitle>
            <CardDescription>
              1. Choose a CSV (UTF-8, up to {formatBytes(policy.importMaxBytes)}). 2. Check the preview. 3. Confirm to apply the valid rows. Unknown ids are rejected, never created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5">
                <label htmlFor="data-file" className="text-sm font-medium">
                  CSV file
                </label>
                <input
                  id="data-file"
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={choose}
                  className="block w-full text-sm file:me-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button onClick={validate} disabled={!file || busy === 'preview' || Boolean(result)}>
                {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Validate &amp; preview
              </Button>
              {file || report ? (
                <Button variant="ghost" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />
                  Start over
                </Button>
              ) : null}
            </div>

            {error ? (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  {error.message}
                </p>
                {error.details?.length ? (
                  <ul className="mt-2 list-disc space-y-1 ps-6 text-muted-foreground">
                    {error.details.map((d, i) => (
                      <li key={i}>{d.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {report ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {result ? (
                        result.applied ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> Import applied
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" /> Nothing was imported
                          </>
                        )
                      ) : (
                        <>Preview — nothing has been changed yet</>
                      )}
                    </p>
                    <SummaryChips summary={report.summary} />
                    {report.warnings?.map((w) => (
                      <p key={w} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        {w}
                      </p>
                    ))}
                  </div>
                  {preview ? (
                    <Button onClick={confirm} disabled={!applicable || busy === 'commit'}>
                      {busy === 'commit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {applicable ? `Confirm import of ${applicable} row${applicable === 1 ? '' : 's'}` : 'No valid rows to import'}
                    </Button>
                  ) : null}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="h-4 w-4 rounded border-input" />
                  Show only rows with errors or warnings
                </label>

                <div className="max-h-[480px] overflow-auto rounded-md border">
                  <Table>
                    <caption className="sr-only">Import rows with their outcome</caption>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Line</TableHead>
                        <TableHead>Outcome</TableHead>
                        {columns.map((c) => (
                          <TableHead key={c} className="font-mono text-xs">
                            {c}
                          </TableHead>
                        ))}
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((row) => (
                        <TableRow key={row.line}>
                          <TableCell className="tabular-nums">{row.line}</TableCell>
                          <TableCell>
                            <Badge variant={ACTION_META[row.action]?.variant ?? 'secondary'}>{ACTION_META[row.action]?.label ?? row.action}</Badge>
                          </TableCell>
                          {columns.map((c) => (
                            <TableCell key={c} className="max-w-[180px] truncate text-sm">
                              {row.values[c] || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          ))}
                          <TableCell className="min-w-[220px] text-xs">
                            {row.errors.map((e) => (
                              <p key={e} className="text-destructive">
                                {e}
                              </p>
                            ))}
                            {row.warnings.map((w) => (
                              <p key={w} className="text-muted-foreground">
                                {w}
                              </p>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!shown.length ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={columns.length + 3} className="py-6 text-center text-sm text-muted-foreground">
                            No rows with problems.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarX, FileText, Paperclip } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import ExcuseStatusBadge, { EXCUSE_CATEGORIES } from '@/components/common/ExcuseStatusBadge'
import FormDialog from '@/components/common/FormDialog'
import FormField from '@/components/common/FormField'
import PageHeader from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorDetails, getErrorMessage } from '@/lib/api'
import { formatDay } from '@/lib/attendance'
import { fileToBase64, formatBytes } from '@/lib/files'
import { formatDateTime } from '@/lib/format'
import { listEligibleAbsences, listMyExcuses, submitExcuse } from '@/services/excuses'

const ACCEPT = { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPEG' }

function SubmitDialog({ absence, onClose, onSubmitted }) {
  const policy = usePolicy()
  const { toast } = useToast()
  const [category, setCategory] = useState('')
  const [explanation, setExplanation] = useState('')
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const check = () => {
    const next = {}
    if (!category) next.category = 'Choose the reason for your absence'
    if (explanation.trim().length < 10) next.explanation = 'Give at least a sentence (10 characters)'
    if (explanation.length > 1000) next.explanation = 'Keep the explanation under 1000 characters'
    if (policy.excuseDocumentRequired && !file) next.document = 'Attach a supporting document'
    if (file && !ACCEPT[file.type]) next.document = 'Attach a PDF, PNG or JPEG file'
    if (file && file.size > policy.excuseMaxBytes) next.document = `Choose a file under ${formatBytes(policy.excuseMaxBytes)}`
    return next
  }

  const shownErrors = submitted ? { ...check(), ...errors } : errors

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitted(true)
    const problems = check()
    if (Object.keys(problems).length) return

    setSubmitting(true)
    try {
      const document = file ? { filename: file.name, mimetype: file.type, data: await fileToBase64(file) } : null
      const res = await submitExcuse({ classId: absence.classId, date: absence.date.slice(0, 10), category, explanation: explanation.trim(), document })
      toast({ title: 'Excuse submitted', description: res.message, variant: 'success' })
      onSubmitted()
    } catch (err) {
      const details = getErrorDetails(err)
      setErrors(Object.fromEntries(details.filter((d) => ['category', 'explanation', 'document'].includes(d.field)).map((d) => [d.field, d.message])))
      toast({ title: 'Could not submit the excuse', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Submit an absence excuse"
      description={`${absence.classCode} — ${absence.className}, ${formatDay(absence.date)}. Your absence still counts until your teacher approves the excuse.`}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Submit excuse"
    >
      <FormField label="Reason" htmlFor="excuse-category" required error={shownErrors.category} className="sm:col-span-2">
        <Select value={category || undefined} onValueChange={setCategory}>
          <SelectTrigger id="excuse-category">
            <SelectValue placeholder="Choose a reason" />
          </SelectTrigger>
          <SelectContent>
            {EXCUSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Explanation"
        htmlFor="excuse-explanation"
        required
        error={shownErrors.explanation}
        hint={`${explanation.length}/1000 characters`}
        className="sm:col-span-2"
      >
        <Textarea id="excuse-explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={4} placeholder="What happened, and anything your teacher should know." />
      </FormField>

      <FormField
        label="Supporting document"
        htmlFor="excuse-document"
        required={policy.excuseDocumentRequired}
        error={shownErrors.document}
        hint={`${policy.excuseDocumentRequired ? 'Required' : 'Optional'}: PDF, PNG or JPEG up to ${formatBytes(policy.excuseMaxBytes)}. Only you, your teacher and administrators can open it.`}
        className="sm:col-span-2"
      >
        <input
          id="excuse-document"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setErrors((prev) => ({ ...prev, document: undefined }))
          }}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FormField>
      {file ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          {file.name} · {formatBytes(file.size)}
        </p>
      ) : null}
    </FormDialog>
  )
}

export default function Excuses() {
  const policy = usePolicy()
  const [eligible, setEligible] = useState([])
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, b] = await Promise.all([listEligibleAbsences(), listMyExcuses()])
      setEligible(a)
      setMine(b)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <PageHeader title="Absence Excuses" description="Explain an absence and attach evidence. Your teacher reviews each request; a pending excuse does not change your record." />

      {error ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={AlertCircle} title="Could not load your excuses" description={getErrorMessage(error)} action={<Button variant="outline" size="sm" onClick={load}>Try again</Button>} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absences you can excuse</CardTitle>
          <CardDescription>Recorded absences without a pending or approved excuse.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:px-6 sm:pb-6">
          {loading ? (
            <div className="space-y-2 p-6 sm:p-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : eligible.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((a) => (
                  <TableRow key={a.attendanceId}>
                    <TableCell className="whitespace-nowrap font-medium">{formatDay(a.date)}</TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap font-mono text-xs">{a.classCode}</span> <span className="text-muted-foreground">{a.className}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setActive(a)} aria-label={`Submit excuse for ${a.classCode} on ${formatDay(a.date)}`}>
                        <FileText className="h-4 w-4" />
                        Submit excuse
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={CalendarX} title="Nothing to excuse" description="You have no unexcused absences waiting for an explanation." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My excuses</CardTitle>
          <CardDescription>Decisions appear here and in your notifications.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:px-6 sm:pb-6">
          {mine.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Absence</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="whitespace-nowrap font-medium">{formatDay(e.date)}</p>
                      <p className="font-mono text-xs text-muted-foreground">{e.classCode}</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm">
                      <p className="font-medium">{e.categoryLabel}</p>
                      <p className="text-muted-foreground">{e.explanation}</p>
                      {e.document ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" aria-hidden="true" />
                          {e.document.filename}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt, policy.timeZone)}</TableCell>
                    <TableCell>
                      <ExcuseStatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="max-w-[240px] text-sm">
                      {e.status === 'pending' ? (
                        <span className="text-muted-foreground">Waiting for your teacher</span>
                      ) : (
                        <>
                          <p>
                            {e.reviewer} · {formatDateTime(e.reviewedAt, policy.timeZone)}
                          </p>
                          {e.decisionNote ? <p className="text-muted-foreground">“{e.decisionNote}”</p> : null}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : !loading ? (
            <EmptyState icon={FileText} title="No excuses yet" description="Excuses you submit will appear here with their status." />
          ) : null}
        </CardContent>
      </Card>

      {active ? (
        <SubmitDialog
          absence={active}
          onClose={() => setActive(null)}
          onSubmitted={() => {
            setActive(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

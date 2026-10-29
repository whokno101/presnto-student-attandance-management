import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, XCircle } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import ExcuseStatusBadge from '@/components/common/ExcuseStatusBadge'
import PageHeader from '@/components/common/PageHeader'
import TablePagination from '@/components/common/TablePagination'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import useApiQuery from '@/hooks/useApiQuery'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { formatDay } from '@/lib/attendance'
import { formatBytes } from '@/lib/files'
import { formatDateTime } from '@/lib/format'
import { downloadExcuseDocument, getExcuse, listExcusesForReview, reviewExcuse } from '@/services/excuses'

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

function ReviewDialog({ excuse, timeZone, onClose, onDone }) {
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)

  const decide = async (decision) => {
    setBusy(decision)
    try {
      const res = await reviewExcuse(excuse.id, { decision, note: note.trim() || undefined })
      toast({
        title: decision === 'approved' ? 'Excuse approved' : 'Excuse rejected',
        description:
          decision === 'approved'
            ? res.data.attendanceChanged
              ? `${excuse.student.name}'s absence is now Excused; their counts were recalculated.`
              : 'Approved. The attendance record was no longer Absent, so it was left as it is.'
            : `${excuse.student.name} has been notified.`,
        variant: 'success',
      })
      onDone()
    } catch (err) {
      toast({ title: 'Could not record the decision', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const download = async () => {
    try {
      await downloadExcuseDocument(excuse.id, excuse.document.filename)
    } catch (err) {
      toast({ title: 'Could not download the document', description: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const pending = excuse.status === 'pending'

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {excuse.student.name} · {excuse.classCode}
          </DialogTitle>
          <DialogDescription>
            Absence on {formatDay(excuse.date)} · submitted {formatDateTime(excuse.createdAt, timeZone)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Student</dt>
          <dd>
            {excuse.student.name} <span className="font-mono text-xs text-muted-foreground">{excuse.student.studentId}</span>
          </dd>
          <dt className="text-muted-foreground">Reason</dt>
          <dd>{excuse.categoryLabel}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <ExcuseStatusBadge status={excuse.status} />
          </dd>
        </dl>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Explanation</p>
          <p className="whitespace-pre-line">{excuse.explanation}</p>
        </div>

        {excuse.document ? (
          <Button variant="outline" onClick={download} className="justify-start">
            <Download className="h-4 w-4" />
            {excuse.document.filename} ({formatBytes(excuse.document.size)})
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">No supporting document was attached.</p>
        )}

        {pending ? (
          <div className="space-y-1.5">
            <Label htmlFor="review-note">Note to the student (optional)</Label>
            <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
            <p className="text-xs text-muted-foreground">Approving changes this absence to Excused, which removes it from the attendance percentage.</p>
          </div>
        ) : (
          <p className="text-sm">
            {excuse.status === 'approved' ? 'Approved' : 'Rejected'} by {excuse.reviewer} on {formatDateTime(excuse.reviewedAt, timeZone)}
            {excuse.decisionNote ? ` — “${excuse.decisionNote}”` : ''}
          </p>
        )}

        <DialogFooter className="gap-2">
          {pending ? (
            <>
              <Button variant="outline" onClick={() => decide('rejected')} disabled={Boolean(busy)}>
                {busy === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </Button>
              <Button onClick={() => decide('approved')} disabled={Boolean(busy)}>
                {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ExcuseReview() {
  const policy = usePolicy()
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [active, setActive] = useState(null)

  const query = useApiQuery(listExcusesForReview, { status: status === 'all' ? undefined : status, page, limit: 20 })
  const rows = query.data?.data ?? []
  const pagination = query.data?.pagination ?? { page: 1, totalPages: 1, total: 0, limit: 20 }

  // Deep link from a notification: /excuses/review?id=...
  const linkedId = searchParams.get('id')
  useEffect(() => {
    if (!linkedId) return
    getExcuse(linkedId)
      .then(setActive)
      .catch(() => {})
  }, [linkedId])

  const close = () => {
    setActive(null)
    if (linkedId) setSearchParams({}, { replace: true })
  }

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const to = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="space-y-5">
      <PageHeader title="Excuse Review" description="Absence excuses submitted for the classes you teach. Submitting does not excuse an absence; your decision does." />

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value)
          setPage(1)
        }}
      >
        <TabsList aria-label="Excuse status">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {t.value === 'pending' && query.data?.pending ? ` (${query.data.pending})` : ''}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={status}>
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Student</TableHead>
                    <TableHead>Absence</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-end">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.loading && !query.data
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i} className="hover:bg-transparent">
                          <TableCell colSpan={6}>
                            <div className="h-4 w-full animate-pulse rounded bg-muted" />
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                  {query.error ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState icon={AlertCircle} title="Could not load excuses" description={query.errorMessage} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!query.loading && !query.error && rows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState icon={FileText} title={status === 'pending' ? 'No excuses waiting for review' : 'No excuses here'} description="New submissions will appear here and in your notifications." />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="font-medium">{e.student?.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{e.student?.studentId}</p>
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap">{formatDay(e.date)}</p>
                        <p className="font-mono text-xs text-muted-foreground">{e.classCode}</p>
                      </TableCell>
                      <TableCell className="max-w-[240px] text-sm">
                        <p className="font-medium">{e.categoryLabel}</p>
                        <p className="truncate text-muted-foreground">{e.explanation}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt, policy.timeZone)}</TableCell>
                      <TableCell>
                        <ExcuseStatusBadge status={e.status} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant={e.status === 'pending' ? 'default' : 'outline'} onClick={() => setActive(e)} aria-label={`${e.status === 'pending' ? 'Review' : 'View'} excuse from ${e.student?.name}`}>
                          {e.status === 'pending' ? 'Review' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                from={from}
                to={to}
                total={pagination.total}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={query.loading}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {active ? (
        <ReviewDialog
          excuse={active}
          timeZone={policy.timeZone}
          onClose={close}
          onDone={() => {
            close()
            query.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

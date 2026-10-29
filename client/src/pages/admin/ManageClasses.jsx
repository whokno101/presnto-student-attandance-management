import { useState } from 'react'
import { AlertCircle, Archive, ArchiveRestore, BookOpen, Pencil, Plus, UserPlus } from 'lucide-react'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import SearchInput from '@/components/common/SearchInput'
import TablePagination from '@/components/common/TablePagination'
import AssignFacultyDialog from '@/components/admin/AssignFacultyDialog'
import ClassForm from '@/components/admin/ClassForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import usePaginatedList from '@/hooks/usePaginatedList'
import usePolicy from '@/hooks/usePolicy'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { formatSchedule, PAGE_SIZES } from '@/lib/constants'
import { daysUntil, formatDateTime } from '@/lib/format'
import { archiveClass, listClasses, restoreClass } from '@/services/classes'

const ACTIVE_COLUMNS = 7
const ARCHIVED_COLUMNS = 6

// Stable fetchers for usePaginatedList.
const listActiveClasses = (params) => listClasses({ ...params, status: 'active' })
const listArchivedClasses = (params) => listClasses({ ...params, status: 'archived' })

function ListToolbar({ list, placeholder }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchInput
        value={list.searchInput}
        onChange={list.setSearchInput}
        onSubmit={list.submitSearch}
        placeholder={placeholder}
      />
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rows</span>
        <Select value={String(list.limit)} onValueChange={list.changeLimit}>
          <SelectTrigger className="w-[80px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function TableState({ list, columns, emptyTitle, emptyDescription }) {
  if (list.loading && list.rows.length === 0) {
    return Array.from({ length: 5 }).map((_, index) => (
      <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
        <TableCell colSpan={columns}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      </TableRow>
    ))
  }

  if (!list.loading && list.rows.length === 0) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columns} className="p-0">
          {list.error ? (
            <EmptyState icon={AlertCircle} title="Could not load classes" description={list.errorMessage} />
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No results found"
              description={list.searchInput ? `No classes match “${list.searchInput}”. Try a different search.` : emptyDescription}
              {...(emptyTitle ? { title: emptyTitle } : {})}
            />
          )}
        </TableCell>
      </TableRow>
    )
  }

  return null
}

function Pagination({ list }) {
  return (
    <TablePagination
      page={list.pagination.page}
      totalPages={list.pagination.totalPages}
      from={list.from}
      to={list.to}
      total={list.total}
      onPrev={() => list.setPage((page) => Math.max(1, page - 1))}
      onNext={() => list.setPage((page) => Math.min(list.pagination.totalPages, page + 1))}
      disabled={list.loading}
    />
  )
}

export default function ManageClasses() {
  const { toast } = useToast()
  const policy = usePolicy()
  const active = usePaginatedList(listActiveClasses)
  const archived = usePaginatedList(listArchivedClasses)

  const [tab, setTab] = useState('active')
  const [form, setForm] = useState({ open: false, classDoc: null })
  const [assign, setAssign] = useState({ open: false, classDoc: null })
  const [confirm, setConfirm] = useState({ open: false, classDoc: null, loading: false })
  const [restoring, setRestoring] = useState(null)

  const handleArchive = async () => {
    const classDoc = confirm.classDoc
    if (!classDoc) return

    setConfirm((prev) => ({ ...prev, loading: true }))
    try {
      await archiveClass(classDoc.id)
      toast({
        title: `${classDoc.code} archived`,
        description: `Its attendance history is retained. You can restore it from the Archived tab for ${policy.retentionDays} days.`,
        variant: 'success',
      })
      setConfirm({ open: false, classDoc: null, loading: false })
      active.refresh()
      archived.refresh()
    } catch (error) {
      toast({ title: 'Could not archive class', description: getErrorMessage(error), variant: 'destructive' })
      setConfirm((prev) => ({ ...prev, loading: false }))
    }
  }

  const handleRestore = async (classDoc) => {
    setRestoring(classDoc.id)
    try {
      await restoreClass(classDoc.id)
      toast({ title: `${classDoc.code} restored`, description: 'It is back in the active class list.', variant: 'success' })
      active.refresh()
      archived.refresh()
    } catch (error) {
      toast({ title: 'Could not restore class', description: getErrorMessage(error), variant: 'destructive' })
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description="Create classes, set schedules and review enrollment. Archived classes keep their attendance history."
        action={
          <Button onClick={() => setForm({ open: true, classDoc: null })}>
            <Plus className="h-4 w-4" />
            Add Class
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Class status">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">
            Archived
            {archived.total ? (
              <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-[10px]">
                {archived.total}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <ListToolbar list={active} placeholder="Search by name or code..." />
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableState list={active} columns={ACTIVE_COLUMNS} emptyDescription="Add your first class to get started." />

                  {active.rows.map((classDoc) => (
                    <TableRow key={classDoc.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{classDoc.code}</TableCell>
                      <TableCell className="font-medium">{classDoc.name}</TableCell>
                      <TableCell>{classDoc.department}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatSchedule(classDoc.schedule)}
                        {classDoc.room ? ` · ${classDoc.room}` : ''}
                      </TableCell>
                      <TableCell>
                        {classDoc.faculty ? (
                          classDoc.faculty.name
                        ) : (
                          <Badge variant="secondary" className="text-muted-foreground">
                            Unassigned
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{classDoc.enrolled}</span>
                        <span className="text-muted-foreground"> / {classDoc.capacity}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAssign({ open: true, classDoc })}
                            aria-label={`Assign faculty to ${classDoc.code}`}
                            title="Assign faculty"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setForm({ open: true, classDoc })}
                            aria-label={`Edit ${classDoc.code}`}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirm({ open: true, classDoc, loading: false })}
                            aria-label={`Archive ${classDoc.code}`}
                            title="Archive"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination list={active} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archived" className="space-y-4">
          <ListToolbar list={archived} placeholder="Search archived classes..." />
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <p className="text-sm text-muted-foreground">
                Archived classes are hidden from rosters, timetables and enrollment. Their attendance history stays in
                reports. Each can be restored for {policy.retentionDays} days after archiving.
              </p>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Archived</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Restorable</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableState
                    list={archived}
                    columns={ARCHIVED_COLUMNS}
                    emptyTitle="No archived classes"
                    emptyDescription="Classes you archive will appear here."
                  />

                  {archived.rows.map((classDoc) => {
                    const daysLeft = daysUntil(classDoc.restoreDeadline)
                    const expired = daysLeft <= 0
                    return (
                      <TableRow key={classDoc.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{classDoc.code}</TableCell>
                        <TableCell className="font-medium">{classDoc.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(classDoc.archivedAt, policy.timeZone)}
                        </TableCell>
                        <TableCell>{classDoc.archivedBy ?? '—'}</TableCell>
                        <TableCell>
                          {expired ? (
                            <Badge variant="secondary" className="text-muted-foreground">
                              Retention ended
                            </Badge>
                          ) : (
                            <span className={daysLeft <= 7 ? 'font-medium text-warning' : ''}>
                              {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={expired || restoring === classDoc.id}
                            onClick={() => handleRestore(classDoc)}
                            aria-label={`Restore ${classDoc.code}`}
                          >
                            <ArchiveRestore className="h-4 w-4" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <Pagination list={archived} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {form.open ? (
        <ClassForm
          key={form.classDoc?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((prev) => ({ ...prev, open }))}
          classDoc={form.classDoc}
          onSaved={active.refresh}
        />
      ) : null}

      {assign.open ? (
        <AssignFacultyDialog
          key={assign.classDoc?.id}
          open={assign.open}
          onOpenChange={(open) => setAssign((prev) => ({ ...prev, open }))}
          classDoc={assign.classDoc}
          onSaved={active.refresh}
        />
      ) : null}

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((prev) => ({ ...prev, open }))}
        title={confirm.classDoc ? `Archive ${confirm.classDoc.code}?` : 'Archive class?'}
        description={
          confirm.classDoc
            ? `${confirm.classDoc.code} — ${confirm.classDoc.name} will be removed from active class lists, enrollment and future schedules. Its attendance history for ${confirm.classDoc.enrolled} enrolled ${confirm.classDoc.enrolled === 1 ? 'student' : 'students'} is retained and stays visible in reports. You can restore it within ${policy.retentionDays} days.`
            : ''
        }
        confirmLabel="Archive class"
        confirmText={confirm.classDoc?.code}
        destructive
        loading={confirm.loading}
        onConfirm={handleArchive}
      />
    </div>
  )
}

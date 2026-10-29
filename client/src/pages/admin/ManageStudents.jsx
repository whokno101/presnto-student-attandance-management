import { useState } from 'react'
import { AlertCircle, Pencil, Plus, UserCheck, UserX, Users } from 'lucide-react'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import SearchInput from '@/components/common/SearchInput'
import StatusBadge from '@/components/common/StatusBadge'
import TablePagination from '@/components/common/TablePagination'
import StudentForm from '@/components/admin/StudentForm'
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
import usePaginatedList from '@/hooks/usePaginatedList'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/api'
import { PAGE_SIZES } from '@/lib/constants'
import { activateStudent, deactivateStudent, listStudents } from '@/services/students'

const COLUMNS = 6

export default function ManageStudents() {
  const { toast } = useToast()
  const list = usePaginatedList(listStudents)

  const [form, setForm] = useState({ open: false, student: null })
  const [confirm, setConfirm] = useState({ open: false, student: null, loading: false })

  const handleActivate = async (student) => {
    try {
      await activateStudent(student.id)
      toast({ title: 'Student activated', description: `${student.name} can sign in again.`, variant: 'success' })
      list.refresh()
    } catch (error) {
      toast({ title: 'Could not activate student', description: getErrorMessage(error), variant: 'destructive' })
    }
  }

  const handleDeactivate = async () => {
    const student = confirm.student
    if (!student) return

    setConfirm((prev) => ({ ...prev, loading: true }))
    try {
      await deactivateStudent(student.id)
      toast({
        title: 'Student deactivated',
        description: `${student.name} can no longer sign in.`,
        variant: 'success',
      })
      setConfirm({ open: false, student: null, loading: false })
      list.refresh()
    } catch (error) {
      toast({ title: 'Could not deactivate student', description: getErrorMessage(error), variant: 'destructive' })
      setConfirm((prev) => ({ ...prev, loading: false }))
    }
  }

  const showEmpty = !list.loading && list.rows.length === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description="Create, edit and deactivate student accounts."
        action={
          <Button onClick={() => setForm({ open: true, student: null })}>
            <Plus className="h-4 w-4" />
            Add Student
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          onSubmit={list.submitSearch}
          placeholder="Search by name or ID..."
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

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {list.loading && list.rows.length === 0
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                      <TableCell colSpan={COLUMNS}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
                : null}

              {showEmpty ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS} className="p-0">
                    {list.error ? (
                      <EmptyState
                        icon={AlertCircle}
                        title="Could not load students"
                        description={list.errorMessage}
                      />
                    ) : (
                      <EmptyState
                        icon={Users}
                        title="No results found"
                        description={
                          list.searchInput
                            ? `No students match “${list.searchInput}”. Try a different search.`
                            : 'Add your first student to get started.'
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ) : null}

              {list.rows.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-mono text-xs font-medium">{student.studentId}</TableCell>
                  <TableCell className="font-medium">{student.name}</TableCell>
                  <TableCell className="text-muted-foreground">{student.email}</TableCell>
                  <TableCell>{student.department}</TableCell>
                  <TableCell>
                    <StatusBadge active={student.isActive} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setForm({ open: true, student })}
                        aria-label={`Edit ${student.name}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      {student.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirm({ open: true, student, loading: false })}
                          aria-label={`Deactivate ${student.name}`}
                          title="Deactivate"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-success"
                          onClick={() => handleActivate(student)}
                          aria-label={`Activate ${student.name}`}
                          title="Activate"
                        >
                          <UserCheck className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

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
        </CardContent>
      </Card>

      {form.open ? (
        <StudentForm
          key={form.student?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((prev) => ({ ...prev, open }))}
          student={form.student}
          onSaved={list.refresh}
        />
      ) : null}

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((prev) => ({ ...prev, open }))}
        title="Deactivate student?"
        description={
          confirm.student
            ? `${confirm.student.name} will no longer be able to sign in. Their attendance history is kept and you can reactivate the account at any time.`
            : ''
        }
        confirmLabel="Deactivate"
        destructive
        loading={confirm.loading}
        onConfirm={handleDeactivate}
      />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from "@/lib/currency"
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Edit2, Plus, Save, X, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { getExpenses, addExpense, updateExpense, deleteExpense, type Expense } from '@/app/(admin)/admin/reports/actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"

interface ExpensesTabProps {
  dateFrom: string
  dateTo: string
}

export function ExpensesTab({ dateFrom, dateTo }: ExpensesTabProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Form states
  const [formDate, setFormDate] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCategory, setFormCategory] = useState<'operational' | 'capital'>('operational')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'operational' | 'capital'>('all')

  useEffect(() => {
    loadExpenses()
  }, [dateFrom, dateTo, categoryFilter])

  const loadExpenses = async () => {
    setLoading(true)
    const result = await getExpenses({ dateFrom, dateTo, category: categoryFilter })
    if (result.success) {
      setExpenses(result.expenses)
    } else {
      toast.error('Failed to load expenses')
    }
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!formDate || !formDescription || !formAmount) {
      toast.error('Please fill all fields')
      return
    }

    const result = await addExpense({
      date: formDate,
      description: formDescription,
      amount: parseFloat(formAmount),
      category: formCategory,
    })

    if (result.success) {
      toast.success('Expense added successfully')
      setFormDate('')
      setFormDescription('')
      setFormAmount('')
      setFormCategory('operational')
      setShowAddForm(false)
      loadExpenses()
    } else {
      toast.error(result.error || 'Failed to add expense')
    }
  }

  const handleUpdate = async (id: string) => {
    if (!formDate || !formDescription || !formAmount) {
      toast.error('Please fill all fields')
      return
    }

    const result = await updateExpense(id, {
      date: formDate,
      description: formDescription,
      amount: parseFloat(formAmount),
      category: formCategory,
    })

    if (result.success) {
      toast.success('Expense updated successfully')
      setEditingId(null)
      loadExpenses()
    } else {
      toast.error(result.error || 'Failed to update expense')
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deleteExpense(id)
    if (result.success) {
      toast.success('Expense deleted successfully')
      loadExpenses()
    } else {
      toast.error(result.error || 'Failed to delete expense')
    }
  }

  const startEdit = (expense: Expense) => {
    setEditingId(expense.id)
    setFormDate(expense.date)
    setFormDescription(expense.description)
    setFormAmount(expense.amount.toString())
    setFormCategory(expense.category)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormDate('')
    setFormDescription('')
    setFormAmount('')
    setFormCategory('operational')
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const opexTotal = expenses.filter(e => e.category === 'operational').reduce((sum, e) => sum + Number(e.amount), 0)
  const capexTotal = expenses.filter(e => e.category === 'capital').reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <p className="text-label-enhanced text-muted-content mb-2">Total Expenses</p>
          <p className="text-3xl font-black text-red-400">₹{formatCurrency(totalExpenses)}</p>
          <p className="text-sm-enhanced text-secondary-content mt-1">{expenses.length} expense(s)</p>
        </Card>
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <p className="text-label-enhanced text-muted-content mb-2">OpEx (Operational)</p>
          <p className="text-3xl font-black text-orange-400">₹{formatCurrency(opexTotal)}</p>
          <p className="text-sm-enhanced text-secondary-content mt-1">Day-to-day expenses</p>
        </Card>
        <Card className="bg-[var(--surface)] border-[#27272a] p-6">
          <p className="text-label-enhanced text-muted-content mb-2">CapEx (Capital)</p>
          <p className="text-3xl font-black text-blue-400">₹{formatCurrency(capexTotal)}</p>
          <p className="text-sm-enhanced text-secondary-content mt-1">Long-term investments</p>
        </Card>
      </div>

      {/* Action Bar */}
      <Card className="bg-[var(--surface)] border-[#27272a] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button
              onClick={() => setCategoryFilter('all')}
              variant={categoryFilter === 'all' ? 'default' : 'outline'}
              className={categoryFilter === 'all' ? 'bg-primary text-black' : ''}
            >
              All
            </Button>
            <Button
              onClick={() => setCategoryFilter('operational')}
              variant={categoryFilter === 'operational' ? 'default' : 'outline'}
              className={categoryFilter === 'operational' ? 'bg-orange-500 text-white' : ''}
            >
              OpEx
            </Button>
            <Button
              onClick={() => setCategoryFilter('capital')}
              variant={categoryFilter === 'capital' ? 'default' : 'outline'}
              className={categoryFilter === 'capital' ? 'bg-blue-500 text-white' : ''}
            >
              CapEx
            </Button>
          </div>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-primary text-black font-black"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </Card>

      {/* Add Form */}
      {showAddForm && (
        <Card className="bg-[var(--surface)] border-primary/40 p-6">
          <h3 className="text-section-header mb-5">Add New Expense</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-label-enhanced">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full mt-2 bg-[var(--background)] border border-zinc-800 h-10 rounded-md px-3 text-sm font-medium text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <span className="truncate mr-2">{formDate ? format(new Date(formDate), "dd-MM-yyyy") : <span className="text-muted-content">Select date</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                  <Calendar
                    mode="single"
                    selected={formDate ? new Date(formDate) : undefined}
                    onSelect={(date) => date && setFormDate(format(date, 'yyyy-MM-dd'))}
                    className="text-white"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-label-enhanced">Category</Label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as 'operational' | 'capital')}
                className="w-full mt-2 h-10 px-3 bg-[var(--background)] border border-zinc-800 text-white rounded-md"
              >
                <option value="operational">OpEx (Operational)</option>
                <option value="capital">CapEx (Capital)</option>
              </select>
            </div>
            <div>
              <Label className="text-label-enhanced">Description</Label>
              <Input
                placeholder="e.g., Electricity Bill"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="bg-[var(--background)] border-zinc-800 text-white mt-2"
              />
            </div>
            <div>
              <Label className="text-label-enhanced">Amount (₹)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="bg-[var(--background)] border-zinc-800 text-white mt-2"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAdd} className="bg-primary text-black">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button onClick={() => setShowAddForm(false)} variant="ghost">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Expenses Table */}
      <Card className="bg-[var(--surface)] border-[#27272a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--background)] border-b border-[#27272a]">
              <tr>
                <th className="py-4 px-4 text-left text-label-enhanced">Date</th>
                <th className="py-4 px-4 text-left text-label-enhanced">Category</th>
                <th className="py-4 px-4 text-left text-label-enhanced">Description</th>
                <th className="py-4 px-4 text-right text-label-enhanced">Amount</th>
                <th className="py-4 px-4 text-right text-label-enhanced">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272a]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm-enhanced">Loading...</td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm-enhanced">No expenses found</td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                    {editingId === expense.id ? (
                      <>
                        <td className="py-3 px-4">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="w-full bg-[var(--background)] border border-zinc-800 h-8 rounded-md px-2 text-sm font-medium text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <span className="truncate mr-1 text-xs">{formDate ? format(new Date(formDate), "dd-MM-yyyy") : <span className="text-muted-content">Select</span>}</span>
                                <CalendarDays className="h-3 w-3 text-primary flex-shrink-0" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                              <Calendar
                                mode="single"
                                selected={formDate ? new Date(formDate) : undefined}
                                onSelect={(date) => date && setFormDate(format(date, 'yyyy-MM-dd'))}
                                className="text-white"
                              />
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={formCategory}
                            onChange={(e) => setFormCategory(e.target.value as 'operational' | 'capital')}
                            className="h-8 px-2 bg-[var(--background)] border border-zinc-800 text-white rounded-md text-sm"
                          >
                            <option value="operational">OpEx</option>
                            <option value="capital">CapEx</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <Input
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            className="bg-[var(--background)] border-zinc-800 text-white h-8 text-sm"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <Input
                            type="number"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            className="bg-[var(--background)] border-zinc-800 text-white h-8 text-sm text-right"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleUpdate(expense.id)}
                              className="h-7 px-2 bg-primary text-black"
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button size="sm" onClick={cancelEdit} variant="ghost" className="h-7 px-2">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 text-sm-enhanced text-secondary-content">
                          {new Date(expense.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                            expense.category === 'operational'
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          }`}>
                            {expense.category === 'operational' ? 'OpEx' : 'CapEx'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-base text-white font-semibold">{expense.description}</td>
                        <td className="py-3 px-4 text-base text-right font-black text-red-400">
                          ₹{formatCurrency(expense.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => startEdit(expense)}
                              variant="ghost"
                              className="h-7 w-7 p-0 text-primary hover:text-primary-hover"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-[var(--surface)] border border-[#27272a] text-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-xl font-bold">Delete Expense Record?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-[#a1a1aa] text-sm">
                                    Are you sure you want to delete the expense **"{expense.description}"**? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="mt-4">
                                  <AlertDialogCancel className="bg-[#27272a] text-white border-zinc-700 hover:bg-zinc-800 hover:text-white">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(expense.id)}
                                    className="bg-gradient-primary text-[var(--button-text)] font-semibold"
                                  >
                                    Confirm Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

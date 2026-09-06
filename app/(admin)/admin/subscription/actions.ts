'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireStaff } from "@/lib/auth/require-admin";

export async function getSubscriptionPlans() {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return {
      success: true,
      data: data || [],
      mesaage: 'Subscription Plan fetch successfully',
    }
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: error.message || 'Failed to fetch plans',
    }
  }
}

export async function createSubscriptionPlan(formData: FormData) {
  await requireStaff();

  // Parse boolean correctly depending on if it comes from a hidden input ("true") or a checkbox ("on")
  const isActiveRaw = formData.get('is_active')
  const isActive = isActiveRaw === 'true' || isActiveRaw === 'on'

  // Validate inputs
  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = Number(formData.get('price') || 0)
  const durationMonths = parseInt((formData.get('duration_months') as string) || '1', 10)

  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Plan name is required' }
  }

  if (!description || description.trim().length < 10) {
    return { success: false, error: 'Description must be at least 10 characters' }
  }

  if (price <= 0) {
    return { success: false, error: 'Price must be greater than 0' }
  }

  if (durationMonths < 1 || durationMonths > 60) {
    return { success: false, error: 'Duration must be between 1 and 60 months' }
  }

  const { error } = await supabaseAdmin.from('subscription_plans').insert([
    {
      name: name.trim(),
      description: description.trim(),
      // Ensure duration is at least 1 month and max 60 months
      duration_months: Math.max(1, Math.min(60, durationMonths)),
      // Ensure price is formatted as a number and greater than 0
      price: Math.max(1, price),
      // Ensure discount is between 0 and 100
      discount_percentage: Math.max(
        0,
        Math.min(100, parseInt((formData.get('discount_percentage') as string) || '20', 10))
      ),
      is_active: isActive,
    },
  ])

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/subscription')
  return { success: true }
}

export async function updateSubscriptionPlan(formData: FormData) {
  await requireStaff();

  const id = formData.get('id') as string

  const isActiveRaw = formData.get('is_active')
  const isActive = isActiveRaw === 'true' || isActiveRaw === 'on'

  // Validate inputs
  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = Number(formData.get('price') || 0)
  const durationMonths = parseInt((formData.get('duration_months') as string) || '1', 10)

  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Plan name is required' }
  }

  if (!description || description.trim().length < 10) {
    return { success: false, error: 'Description must be at least 10 characters' }
  }

  if (price <= 0) {
    return { success: false, error: 'Price must be greater than 0' }
  }

  if (durationMonths < 1 || durationMonths > 60) {
    return { success: false, error: 'Duration must be between 1 and 60 months' }
  }

  const { error } = await supabaseAdmin
    .from('subscription_plans')
    .update({
      name: name.trim(),
      description: description.trim(),
      duration_months: Math.max(1, Math.min(60, durationMonths)),
      price: Math.max(1, price),
      discount_percentage: Math.max(
        0,
        Math.min(100, parseInt((formData.get('discount_percentage') as string) || '20', 10))
      ),
      is_active: isActive,
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/subscription')
  return { success: true }
}

export async function deleteSubscriptionPlan(id: string) {
  await requireStaff();

  const { error } = await supabaseAdmin.from('subscription_plans').delete().eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/subscription')
  return { success: true }
}

export async function getSubscriptionPlanDetails(id: string) {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', id)
      .single()

    const currentDate = new Date()
    const validityDate = new Date(currentDate)

    if (data.duration_months) {
      validityDate.setMonth(validityDate.getMonth() + data.duration_months)
    }

    const responseData = {
      ...data,
      validity: validityDate.toISOString(),
    }
    if (error) throw new Error(error.message)

    revalidatePath('/admin/subscription')

    return {
      success: true,
      data: responseData,
      message: 'Plan details fetch successfully',
    }
  } catch (error: any) {
    return {
      success: false,
      data: null,
      message: error.message || 'Failed to fetch plans details',
    }
  }
}

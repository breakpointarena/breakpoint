'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireStaff } from "@/lib/auth/require-admin";

export async function getSubscriptionPlans() {
  await requireStaff();

  try {
    const [
      { data, error },
      { data: deviceTypes, error: deviceTypesError },
    ] = await Promise.all([
      supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('device_types')
        .select('id, name, display_name, regular_hourly_rate, is_active')
        .order('display_order', { ascending: true }),
    ])

    if (error) throw new Error(error.message)
    if (deviceTypesError) throw new Error(deviceTypesError.message)

    const deviceTypeNameById = new Map(
      (deviceTypes || []).map((deviceType: {
        id: string
        display_name: string
      }) => [deviceType.id, deviceType.display_name])
    )

    return {
      success: true,
      data: (data || []).map((plan: {
        device_type_id: string | null
        [key: string]: unknown
      }) => ({
        ...plan,
        device_type_name: plan.device_type_id
          ? deviceTypeNameById.get(plan.device_type_id) || null
          : null,
      })),
      deviceTypes: deviceTypes || [],
      mesaage: 'Subscription Plan fetch successfully',
    }
  } catch (error: any) {
    return {
      success: false,
      data: null,
      deviceTypes: [],
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
  const planType = formData.get('plan_type') === 'hour_pack' ? 'hour_pack' : 'membership'
  const deviceTypeId = String(formData.get('device_type_id') || '').trim() || null
  const hoursIncluded = Number(formData.get('hours_included') || 0)
  const standardValue = Number(formData.get('standard_value') || 0)

  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Plan name is required' }
  }

  if (!description || description.trim().length < 10) {
    return { success: false, error: 'Description must be at least 10 characters' }
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { success: false, error: 'Price must be greater than 0' }
  }

  if (durationMonths < 1 || durationMonths > 60) {
    return { success: false, error: 'Duration must be between 1 and 60 months' }
  }

  if (planType === 'hour_pack') {
    if (!deviceTypeId) {
      return { success: false, error: 'Choose the device category this hour pack is for.' }
    }
    if (![1, 3, 6, 12].includes(durationMonths)) {
      return { success: false, error: 'Hour packs must be valid for 1, 3, 6, or 12 months' }
    }
    if (!Number.isInteger(hoursIncluded) || hoursIncluded <= 0) {
      return { success: false, error: 'Hour packs must include a positive whole number of hours' }
    }
    if (!Number.isFinite(standardValue) || standardValue < price) {
      return { success: false, error: 'Standard value must be at least the package price' }
    }
    const { data: deviceType, error: deviceTypeError } = await supabaseAdmin
      .from('device_types')
      .select('id')
      .eq('id', deviceTypeId)
      .eq('is_active', true)
      .maybeSingle()
    if (deviceTypeError) return { success: false, error: deviceTypeError.message }
    if (!deviceType) return { success: false, error: 'Choose an active device category.' }
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
      discount_percentage: planType === 'hour_pack' ? 0 : Math.max(
        0,
        Math.min(100, parseInt((formData.get('discount_percentage') as string) || '20', 10))
      ),
      plan_type: planType,
      device_type_id: planType === 'hour_pack' ? deviceTypeId : null,
      hours_included: planType === 'hour_pack' ? hoursIncluded : null,
      standard_value: planType === 'hour_pack' ? standardValue : null,
      is_active: isActive,
    },
  ])

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/subscription')
  revalidatePath('/subscription')
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
  const planType = formData.get('plan_type') === 'hour_pack' ? 'hour_pack' : 'membership'
  const deviceTypeId = String(formData.get('device_type_id') || '').trim() || null
  const hoursIncluded = Number(formData.get('hours_included') || 0)
  const standardValue = Number(formData.get('standard_value') || 0)

  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Plan name is required' }
  }

  if (!description || description.trim().length < 10) {
    return { success: false, error: 'Description must be at least 10 characters' }
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { success: false, error: 'Price must be greater than 0' }
  }

  if (durationMonths < 1 || durationMonths > 60) {
    return { success: false, error: 'Duration must be between 1 and 60 months' }
  }

  if (planType === 'hour_pack') {
    if (![1, 3, 6, 12].includes(durationMonths)) {
      return { success: false, error: 'Hour packs must be valid for 1, 3, 6, or 12 months' }
    }
    if (!Number.isInteger(hoursIncluded) || hoursIncluded <= 0) {
      return { success: false, error: 'Hour packs must include a positive whole number of hours' }
    }
    if (!Number.isFinite(standardValue) || standardValue < price) {
      return { success: false, error: 'Standard value must be at least the package price' }
    }
  }

  const { data: existingPlan, error: planError } = await supabaseAdmin
    .from('subscription_plans')
    .select('plan_type, device_type_id')
    .eq('id', id)
    .single()
  if (planError) return { success: false, error: planError.message }

  const { count, error: countError } = await supabaseAdmin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_plan_id', id)
  if (countError) return { success: false, error: countError.message }
  if (
    existingPlan.plan_type === 'hour_pack' &&
    existingPlan.device_type_id !== deviceTypeId
  ) {
    return {
      success: false,
      error: 'An hour pack category cannot be changed after the plan is created. Create a new category-specific plan instead.',
    }
  }
  if ((count || 0) > 0) {
    if (existingPlan.plan_type !== planType) {
      return { success: false, error: 'A plan type cannot be changed after it has been purchased.' }
    }
    if (existingPlan.device_type_id !== deviceTypeId) {
      return { success: false, error: 'A plan category cannot be changed after it has been purchased.' }
    }
  }

  if (planType === 'hour_pack') {
    if (!deviceTypeId) {
      if ((count || 0) === 0 || existingPlan.device_type_id !== null || isActive) {
        return { success: false, error: 'Choose the device category this hour pack is for.' }
      }
    } else if (deviceTypeId !== existingPlan.device_type_id || isActive) {
      const { data: deviceType, error: deviceTypeError } = await supabaseAdmin
        .from('device_types')
        .select('id')
        .eq('id', deviceTypeId)
        .eq('is_active', true)
        .maybeSingle()
      if (deviceTypeError) return { success: false, error: deviceTypeError.message }
      if (!deviceType) return { success: false, error: 'Choose an active device category.' }
    }
  }

  const { error } = await supabaseAdmin
    .from('subscription_plans')
    .update({
      name: name.trim(),
      description: description.trim(),
      duration_months: Math.max(1, Math.min(60, durationMonths)),
      price: Math.max(1, price),
      discount_percentage: planType === 'hour_pack' ? 0 : Math.max(
        0,
        Math.min(100, parseInt((formData.get('discount_percentage') as string) || '20', 10))
      ),
      plan_type: planType,
      device_type_id: planType === 'hour_pack' ? deviceTypeId : null,
      hours_included: planType === 'hour_pack' ? hoursIncluded : null,
      standard_value: planType === 'hour_pack' ? standardValue : null,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/subscription')
  revalidatePath('/subscription')
  return { success: true }
}

export async function deleteSubscriptionPlan(id: string) {
  await requireStaff();

  const { error } = await supabaseAdmin.from('subscription_plans').delete().eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/subscription')
  revalidatePath('/subscription')
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

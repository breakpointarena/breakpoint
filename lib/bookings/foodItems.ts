export interface RemovableCheckLineItem {
  item_type?: string | null
  added_by?: string | null
  is_paid?: boolean | null
  quantity?: number | null
  reference_id?: string | null
  description?: string | null
}

export interface RemovableCheckFoodItem {
  menu_item_id?: string | null
  item_name?: string | null
  quantity?: number | null
}

export function isRemovableFoodLineItem(lineItem: RemovableCheckLineItem): boolean {
  return lineItem.item_type === 'food' && lineItem.added_by === 'admin' && !lineItem.is_paid
}

export function annotateRemovableFoodItems<T extends RemovableCheckFoodItem>(
  foodItems: T[] | null | undefined,
  lineItems: RemovableCheckLineItem[] | null | undefined
): Array<T & { removable: boolean }> {
  const available = new Map<string, number>()

  for (const lineItem of lineItems || []) {
    if (!isRemovableFoodLineItem(lineItem)) continue
    const key = `${lineItem.reference_id ?? lineItem.description}|${lineItem.quantity}`
    available.set(key, (available.get(key) || 0) + 1)
  }

  return (foodItems || []).map((item) => {
    const key = `${item.menu_item_id ?? item.item_name}|${item.quantity}`
    const remaining = available.get(key) || 0

    if (remaining > 0) {
      available.set(key, remaining - 1)
      return { ...item, removable: true }
    }

    return { ...item, removable: false }
  })
}

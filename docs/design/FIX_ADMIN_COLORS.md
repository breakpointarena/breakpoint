# Fix Admin Pages - Hardcoded Colors Issue

## Problem

Many admin pages use hardcoded background colors instead of CSS variables from `globals.css`. This causes them not to follow the premium gold theme.

## Files Affected

✅ **Fixed:**
- `app/(admin)/admin/reports/page.tsx`

❌ **Need Fixing:**
- `app/(admin)/admin/bookings/page.tsx`
- `app/(admin)/admin/dashboard/page.tsx`  
- `app/(admin)/admin/bookings/walk-in/page.tsx`
- `app/(admin)/admin/devices/page.tsx`
- `app/(admin)/admin/food/page.tsx`
- `app/(admin)/admin/subscription/page.tsx`
- `app/(admin)/admin/timeline/page.tsx`

## Color Replacements Needed

### Background Colors
```tsx
// OLD - Hardcoded
bg-[#121212]  // Card/surface backgrounds
bg-[#0a0a0a]  // Darker elements
bg-[#0c0c0e]  // Popover backgrounds
bg-[#060606]  // Very dark backgrounds

// NEW - Use CSS variables
bg-[var(--surface)]      // For cards/surfaces (#18181C)
bg-[var(--background)]   // For darker elements (#0F0F12)
bg-[var(--surface-hover)] // For hover states (#1F1F23)
```

### Button Colors
```tsx
// OLD - Hardcoded
bg-primary hover:bg-primary-hover text-black

// NEW - Use gradient with proper text color
bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)]
```

### Border Colors
```tsx
// Keep as-is (these are fine)
border-[#27272a]
border-zinc-800
border-zinc-900
```

## Quick Fix Commands

### Option 1: Manual Find & Replace

Use your editor's find and replace across all admin files:

**Step 1 - Fix Surface Backgrounds:**
```
Find: bg-\[#121212\]
Replace: bg-[var(--surface)]
Files: app/(admin)/**/*.tsx
```

**Step 2 - Fix Dark Backgrounds:**
```
Find: bg-\[#0a0a0a\]
Replace: bg-[var(--background)]
Files: app/(admin)/**/*.tsx
```

**Step 3 - Fix Popover Backgrounds:**
```
Find: bg-\[#0c0c0e\]
Replace: bg-[var(--background)]
Files: app/(admin)/**/*.tsx
```

**Step 4 - Fix Primary Buttons:**
```
Find: bg-primary hover:bg-primary-hover text-black
Replace: bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)]
Files: app/(admin)/**/*.tsx
```

### Option 2: Use sed (Bulk Replace)

Run these commands from the project root:

```bash
# Fix surface backgrounds
find app/\(admin\) -name "*.tsx" -exec sed -i '' 's/bg-\[#121212\]/bg-[var(--surface)]/g' {} +

# Fix dark backgrounds
find app/\(admin\) -name "*.tsx" -exec sed -i '' 's/bg-\[#0a0a0a\]/bg-[var(--background)]/g' {} +

# Fix popover backgrounds
find app/\(admin\) -name "*.tsx" -exec sed -i '' 's/bg-\[#0c0c0e\]/bg-[var(--background)]/g' {} +

# Fix very dark backgrounds
find app/\(admin\) -name "*.tsx" -exec sed -i '' 's/bg-\[#060606\]/bg-[var(--background)]/g' {} +
```

**Note:** On Linux, remove the `''` after `-i`:
```bash
sed -i 's/pattern/replacement/g' file
```

### Option 3: Individual File Updates

Update each file manually by opening it and using find/replace within the file.

## What This Fixes

After applying these changes:

✅ **Dark backgrounds** - All admin pages will use the new deep charcoal (#0F0F12)
✅ **Card surfaces** - All cards will use the elevated surface color (#18181C)
✅ **Buttons** - All primary buttons will have the gold gradient
✅ **Consistency** - All admin pages will match the premium gold theme
✅ **Maintainability** - Changing theme colors in globals.css will update everything

## Testing After Fix

1. **Restart dev server**: `npm run dev`
2. **Check these admin pages**:
   - `/admin/reports` ✅ (already fixed)
   - `/admin/dashboard` 
   - `/admin/bookings`
   - `/admin/devices`
   - `/admin/food`
   - `/admin/subscription`
   - `/admin/timeline`

3. **Verify**:
   - Backgrounds are darker (#0F0F12 instead of #121212)
   - Cards have subtle elevation (#18181C)
   - Buttons have gold gradient
   - Overall premium aesthetic

## Why This Happened

The admin pages were built before the premium gold theme was implemented. They use hardcoded color values that were the old theme colors. By updating them to use CSS variables, they'll automatically follow any future theme changes.

## Prevention

Going forward, always use CSS variables:

```tsx
// ✅ GOOD - Uses CSS variables
<Card className="bg-[var(--surface)] border-[#27272a]">

// ✅ GOOD - Uses gradient utilities
<Button className="bg-gradient-primary text-[var(--button-text)]">

// ❌ BAD - Hardcoded colors
<Card className="bg-[#121212] border-[#27272a]">

// ❌ BAD - Hardcoded button colors  
<Button className="bg-primary text-black">
```

## Summary

**Quick Solution**: Run the sed commands above to fix all admin pages at once.

**Safe Solution**: Update each file individually to verify changes.

**Best Solution**: Use a code editor with multi-file find/replace to review each change before applying.

# 🎨 Theme System Guide

**For:** Developers & Project Maintainers  
**Last Updated:** 2026-06-02  
**Current Theme:** Purple (#A855F7)

---

## 📖 Table of Contents

1. [How to Change Theme Colors](#how-to-change-theme-colors)
2. [Developer Guide: Using Theme Colors](#developer-guide-using-theme-colors)
3. [Common Patterns & Examples](#common-patterns--examples)
4. [Testing Checklist](#testing-checklist)
5. [Troubleshooting](#troubleshooting)

---

## 🎨 How to Change Theme Colors

### Quick Change (3 Simple Steps)

**Step 1:** Open `/app/globals.css`

**Step 2:** Update BOTH light mode AND dark mode blocks:

```css
/* Lines 6-8: Light Mode */
:root {
  --primary: #A855F7;        /* Main color */
  --primary-hover: #C084FC;  /* Hover state (lighter) */
  --primary-dark: #9333EA;   /* Dark variant */
}

/* Lines 27-29: Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --primary: #A855F7;        /* Same as light mode */
    --primary-hover: #C084FC;  /* Same as light mode */
    --primary-dark: #9333EA;   /* Same as light mode */
  }
}
```

**Step 3:** Clear cache and refresh

```bash
# Terminal
rm -rf .next
pnpm dev

# Browser
Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows)
```

---

### Available Color Themes

Copy-paste these values directly:

#### 🟣 Purple (Current)
```css
--primary: #A855F7;
--primary-hover: #C084FC;
--primary-dark: #9333EA;
```

#### 🟡 Gold (Original)
```css
--primary: #FFC107;
--primary-hover: #ffcd38;
--primary-dark: #e6ad06;
```

#### 🔵 Blue
```css
--primary: #3B82F6;
--primary-hover: #60A5FA;
--primary-dark: #2563EB;
```

#### 🟢 Green
```css
--primary: #10B981;
--primary-hover: #34D399;
--primary-dark: #059669;
```

#### 🔴 Red
```css
--primary: #EF4444;
--primary-hover: #F87171;
--primary-dark: #DC2626;
```

#### 🔷 Cyan
```css
--primary: #06B6D4;
--primary-hover: #22D3EE;
--primary-dark: #0891B2;
```

#### 🟠 Orange
```css
--primary: #F97316;
--primary-hover: #FB923C;
--primary-dark: #EA580C;
```

#### 🩷 Pink
```css
--primary: #EC4899;
--primary-hover: #F472B6;
--primary-dark: #DB2777;
```

#### 💜 Purple Neon (Vibrant Glow Effect)
```css
--primary: #A855F7;
--primary-hover: #C084FC;
--primary-dark: #7C3AED;
```
**Special Effect:** Add glow shadows for neon look:
```tsx
className="bg-primary shadow-[0_0_20px_rgba(168,85,247,0.5)]"
```

#### 🌊 Blue Gradient (Ocean/Sky Vibes)
```css
--primary: #0EA5E9;
--primary-hover: #38BDF8;
--primary-dark: #0284C7;
```
**Pro Tip:** Combine with gradients for stunning effects:
```tsx
className="bg-gradient-to-r from-primary via-primary-hover to-blue-600"
```

---

## 👨‍💻 Developer Guide: Using Theme Colors

### ⚠️ IMPORTANT: The Golden Rules

**✅ ALWAYS DO THIS:**
```tsx
// Use Tailwind's theme classes
<Button className="bg-primary hover:bg-primary-hover text-black">
  Click Me
</Button>

<span className="text-primary font-bold">
  Highlighted Text
</span>

<div className="border-primary border-2">
  Content
</div>
```

**❌ NEVER DO THIS:**
```tsx
// Hardcoded hex values - DON'T DO THIS!
<Button className="bg-[#A855F7] hover:bg-[#C084FC] text-black">
  Click Me
</Button>

<span className="text-[#A855F7] font-bold">
  Highlighted Text
</span>

<div className="border-[#A855F7] border-2">
  Content
</div>
```

---

### Available Theme Classes

| Use Case | Tailwind Class | Example |
|----------|---------------|---------|
| **Text Color** | `text-primary` | Highlighted text, links, labels |
| **Background** | `bg-primary` | Buttons, badges, cards |
| **Background Hover** | `bg-primary-hover` | Button hover states |
| **Border** | `border-primary` | Card borders, input focus |
| **Border with Opacity** | `border-primary/50` | Subtle borders (50% opacity) |
| **Background with Opacity** | `bg-primary/10` | Light backgrounds (10% opacity) |
| **Shadow** | `shadow-primary/20` | Box shadows with primary color |
| **Ring (Focus)** | `ring-primary` | Input focus rings |
| **Gradient From** | `from-primary` | Gradient starts |
| **Gradient To** | `to-primary` | Gradient ends |

---

### Hover & Focus States

```tsx
// Hover states
<button className="bg-primary hover:bg-primary-hover">
  Hover Me
</button>

// Text color changes
<a className="text-zinc-400 hover:text-primary">
  Link
</a>

// Border changes
<div className="border-zinc-800 hover:border-primary">
  Content
</div>

// Focus states for inputs
<input className="focus:ring-primary focus:border-primary" />

// Focus within (for parent elements)
<div className="group">
  <input />
  <span className="group-focus-within:text-primary">Label</span>
</div>
```

---

### Opacity Variations

```tsx
// Light backgrounds (10%, 20%, etc.)
<div className="bg-primary/10">
  Very light background
</div>

<div className="bg-primary/20">
  Light background
</div>

// Borders with opacity
<div className="border border-primary/30">
  Subtle border
</div>

<div className="border-2 border-primary/50">
  Medium opacity border
</div>

// Text with opacity
<span className="text-primary/70">
  Slightly faded text
</span>
```

---

### Gradients

```tsx
// Linear gradients
<div className="bg-gradient-to-r from-primary/10 to-transparent">
  Fading gradient
</div>

<div className="bg-gradient-to-br from-primary/20 to-blue-500/10">
  Two-color gradient
</div>

// Gradient text (requires special setup)
<h1 className="bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent">
  Gradient Text
</h1>
```

---

### Group Hover (Parent-Child Interactions)

```tsx
<div className="group hover:bg-zinc-900">
  {/* Icon changes color when parent is hovered */}
  <Icon className="text-zinc-600 group-hover:text-primary" />
  
  {/* Text changes when parent is hovered */}
  <span className="text-white group-hover:text-primary">
    Hover the parent
  </span>
</div>
```

---

### Inline Styles (Advanced)

When Tailwind classes aren't enough:

```tsx
// Using CSS variables
<div style={{ 
  color: 'var(--primary)',
  borderColor: 'var(--primary)',
}}>
  Content
</div>

// Color mixing (modern browsers)
<div style={{ 
  backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
}}>
  10% primary background
</div>

// Drop shadows with theme color
<span style={{
  filter: 'drop-shadow(0 0 10px var(--primary))'
}}>
  Glowing text
</span>
```

---

## 📚 Common Patterns & Examples

### Buttons

```tsx
// Primary button
<Button className="bg-primary hover:bg-primary-hover text-black font-bold">
  Primary Action
</Button>

// Outline button with primary color
<Button className="border-2 border-primary text-primary hover:bg-primary/10">
  Secondary Action
</Button>

// Ghost button
<Button className="text-primary hover:text-primary-hover hover:bg-primary/5">
  Ghost Action
</Button>

// Disabled state
<Button 
  disabled 
  className="bg-primary/30 text-black/50 cursor-not-allowed"
>
  Disabled
</Button>
```

---

### Cards

```tsx
// Card with primary border on hover
<Card className="border border-zinc-900 hover:border-primary/50 transition-colors">
  Content
</Card>

// Card with primary accent
<Card className="border-l-4 border-l-primary bg-zinc-950">
  Left accent card
</Card>

// Highlighted card
<Card className="bg-primary/5 border border-primary/20">
  Highlighted content
</Card>

// Interactive card
<Card className="group cursor-pointer border border-zinc-900 hover:border-primary hover:shadow-lg hover:shadow-primary/10">
  <h3 className="group-hover:text-primary">Title</h3>
  <Icon className="text-zinc-600 group-hover:text-primary" />
</Card>
```

---

### Badges & Tags

```tsx
// Solid badge
<span className="bg-primary text-black text-xs font-bold px-2 py-1 rounded">
  Active
</span>

// Outline badge
<span className="border border-primary text-primary text-xs font-bold px-2 py-1 rounded">
  Featured
</span>

// Subtle badge
<span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded">
  New
</span>

// Animated badge
<span className="bg-primary/20 text-primary text-xs font-bold px-2 py-1 rounded animate-pulse">
  Live
</span>
```

---

### Inputs & Forms

```tsx
// Text input with focus ring
<input 
  type="text"
  className="
    bg-zinc-950 
    border border-zinc-800 
    text-white 
    focus:ring-2 
    focus:ring-primary 
    focus:border-primary
    rounded-lg 
    px-4 
    py-2
  "
/>

// Checkbox (custom styled)
<div className="flex items-center gap-2">
  <input 
    type="checkbox" 
    className="
      w-4 h-4 
      text-primary 
      bg-zinc-900 
      border-zinc-800 
      rounded 
      focus:ring-primary
    " 
  />
  <label>Accept terms</label>
</div>

// Input with icon
<div className="relative group">
  <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary" />
  <input 
    className="pl-10 bg-zinc-950 border border-zinc-800 focus:border-primary focus:ring-1 focus:ring-primary" 
  />
</div>
```

---

### Links

```tsx
// Standard link
<a href="#" className="text-primary hover:text-primary-hover underline">
  Click here
</a>

// Link with icon
<a href="#" className="text-zinc-400 hover:text-primary flex items-center gap-2">
  <ExternalLink className="h-4 w-4" />
  Learn more
</a>

// Breadcrumb link
<a href="#" className="text-zinc-600 hover:text-primary">
  Home
</a>
```

---

### Icons

```tsx
// Primary colored icon
<Icon className="h-5 w-5 text-primary" />

// Icon that changes on hover
<Icon className="h-5 w-5 text-zinc-600 hover:text-primary transition-colors" />

// Icon in a colored background
<div className="p-2 bg-primary/10 rounded-lg">
  <Icon className="h-5 w-5 text-primary" />
</div>

// Icon with group hover
<div className="group">
  <Icon className="h-5 w-5 text-zinc-600 group-hover:text-primary" />
</div>
```

---

### Loading States

```tsx
// Spinner
<Loader2 className="h-6 w-6 animate-spin text-primary" />

// Loading button
<Button disabled className="bg-primary/50">
  <Loader2 className="h-4 w-4 animate-spin mr-2" />
  Loading...
</Button>

// Skeleton loader
<div className="animate-pulse">
  <div className="h-4 bg-primary/10 rounded w-3/4"></div>
  <div className="h-4 bg-primary/10 rounded w-1/2 mt-2"></div>
</div>
```

---

### Progress Indicators

```tsx
// Progress bar
<div className="w-full bg-zinc-900 rounded-full h-2">
  <div 
    className="bg-primary h-2 rounded-full transition-all" 
    style={{ width: '60%' }}
  />
</div>

// Step indicator (active step)
<div className="flex items-center gap-2">
  <div className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center font-bold">
    1
  </div>
  <div className="w-8 h-8 rounded-full bg-zinc-900 text-zinc-500 flex items-center justify-center">
    2
  </div>
</div>
```

---

### Alerts & Notifications

```tsx
// Info alert
<div className="bg-primary/10 border border-primary/30 text-primary p-4 rounded-lg">
  <AlertCircle className="h-5 w-5 inline mr-2" />
  Important information
</div>

// Success (use green, not primary)
<div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded-lg">
  <CheckCircle className="h-5 w-5 inline mr-2" />
  Success message
</div>

// Highlight box
<div className="bg-gradient-to-r from-primary/20 to-transparent border-l-4 border-l-primary p-4">
  Highlighted content
</div>
```

---

## ✅ Testing Checklist

When implementing a new feature, test these states:

### Visual Testing
- [ ] Default state uses correct theme colors
- [ ] Hover states work (buttons, links, cards)
- [ ] Focus states visible (inputs, buttons)
- [ ] Active/selected states clear
- [ ] Disabled states appropriate
- [ ] Loading states use theme colors
- [ ] Icons use theme colors
- [ ] Badges/tags use theme colors

### Color Consistency
- [ ] No hardcoded hex colors (`#A855F7`, `#FFC107`, etc.)
- [ ] All theme colors use Tailwind classes
- [ ] Opacity variations used where appropriate
- [ ] Gradients use theme variables

### Accessibility
- [ ] Text contrast meets WCAG AA (4.5:1 for normal text)
- [ ] Focus rings visible and clear
- [ ] Hover states distinguishable
- [ ] Color not the only indicator (use icons/text too)

### Responsive
- [ ] Theme colors work on mobile
- [ ] Touch targets large enough (min 44x44px)
- [ ] Interactive states work on touch devices

### Theme Switch Test
To verify your component is theme-agnostic:

1. Open `/app/globals.css`
2. Change to a different color theme
3. Hard refresh browser
4. Check your component still looks good

---

## 🔧 Troubleshooting

### Colors Don't Update After Changing CSS

**Solution:**
```bash
# 1. Clear Next.js cache
rm -rf .next

# 2. Restart dev server
pnpm dev

# 3. Hard refresh browser
# Mac: Cmd+Shift+R
# Windows: Ctrl+Shift+F5
```

---

### Dark Mode Shows Different Colors

**Problem:** You only updated one section in `globals.css`

**Solution:** Update BOTH blocks:
- Lines 6-8 (light mode)
- Lines 27-29 (dark mode inside `@media`)

Both should have the same color values!

---

### Some Elements Still Show Old Colors

**Cause:** Hardcoded hex values in the component

**Find them:**
```bash
# Search for hardcoded gold colors
grep -r "#FFC107\|#ffcd38\|#e6ad06" app/ components/
```

**Fix:**
Replace hardcoded values with theme classes:
- `text-[#FFC107]` → `text-primary`
- `bg-[#FFC107]` → `bg-primary`
- etc.

---

### Colors Look Washed Out / Too Bright

**Adjust opacity:**
```tsx
// Too bright?
<div className="bg-primary/50">  {/* Use 50% instead of 100% */}

// Too faded?
<div className="bg-primary">  {/* Use 100% instead of 10% */}
```

---

### Focus Ring Not Visible

**Add explicit focus styles:**
```tsx
<button className="
  focus:outline-none 
  focus:ring-2 
  focus:ring-primary 
  focus:ring-offset-2 
  focus:ring-offset-zinc-950
">
  Button
</button>
```

---

### Hover State Not Working

**Common issues:**
```tsx
// ❌ Wrong - missing hover: prefix
<button className="bg-primary bg-primary-hover">

// ✅ Correct
<button className="bg-primary hover:bg-primary-hover">

// ❌ Wrong - transition not defined
<button className="bg-primary hover:bg-primary-hover">

// ✅ Correct - with transition
<button className="bg-primary hover:bg-primary-hover transition-colors">
```

---

## 🎓 Quick Reference Card

**Copy this to your desk:**

```
THEME COLOR USAGE CHEAT SHEET
================================

TEXT:           text-primary
BACKGROUND:     bg-primary
HOVER BG:       hover:bg-primary-hover
BORDER:         border-primary
FOCUS RING:     focus:ring-primary
SHADOW:         shadow-primary/20
OPACITY:        bg-primary/10 (10%)

NEVER USE:      #A855F7, #FFC107, etc.
ALWAYS USE:     text-primary, bg-primary, etc.

TO CHANGE THEME:
1. Edit /app/globals.css (lines 6-8 AND 27-29)
2. rm -rf .next
3. pnpm dev
4. Hard refresh browser
```

---

## 📞 Need Help?

**Quick Checks:**
1. Did you update BOTH light and dark mode in `globals.css`?
2. Did you clear the `.next` cache?
3. Did you hard refresh the browser?
4. Are you using `text-primary` instead of `text-[#A855F7]`?

**Still stuck?**
- Check existing components for examples
- Search codebase for similar patterns
- Review the Common Patterns section above

---

**Last Updated:** 2026-06-02  
**Theme System Version:** 1.0  
**Current Coverage:** 88% (226 of 256 instances converted)

---

## 🎉 Summary

**For Theme Changes:** Edit 2 places in `globals.css`, clear cache, refresh.  
**For New Features:** Use `text-primary`, `bg-primary`, etc. Never hardcode hex colors.  
**Test:** Switch theme colors and verify your component still looks good.

**That's it!** 🚀

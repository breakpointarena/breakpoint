# 🎨 Gradient System Guide

## Overview

This application uses a **golden/amber gradient theme** with animated transitions throughout. All buttons, cards, badges, and interactive elements feature gradient backgrounds, borders, and glow effects.

---

## 🌈 Available Gradients

### Primary Gradient (Gold → Dark Orange)
```css
--gradient-primary: linear-gradient(135deg, #FFC107 0%, #FF8F00 100%);
```
**Usage**: Primary buttons, CTAs, important headings, locked status

### Secondary Gradient (Cyan → Turquoise)
```css
--gradient-secondary: linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%);
```
**Usage**: Secondary actions, info badges, confirmed status, links

### Accent Gradient (Amber → Red)
```css
--gradient-accent: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
```
**Usage**: Warnings, highlights, cancelled status, special offers

### Success Gradient (Green)
```css
--gradient-success: linear-gradient(135deg, #10B981 0%, #059669 100%);
```
**Usage**: Success states, confirmations, checked-in status, positive actions

### Dark Gradient
```css
--gradient-dark: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
```
**Usage**: Card backgrounds, dark panels

### Animated Gradient
```css
--gradient-animated: linear-gradient(270deg, #FFC107, #FF8F00, #FFAB00, #FFD54F);
```
**Usage**: Hero sections, special animations (shifts continuously in golden tones)

---

## 🛠️ Utility Classes

### Gradient Backgrounds

```jsx
<div className="bg-gradient-primary">Primary Gradient</div>
<div className="bg-gradient-secondary">Secondary Gradient</div>
<div className="bg-gradient-accent">Accent Gradient</div>
<div className="bg-gradient-success">Success Gradient</div>
<div className="bg-gradient-animated">Animated Gradient</div>
```

### Gradient Text

```jsx
<h1 className="text-gradient-primary">Gradient Heading</h1>
<p className="text-gradient-secondary">Gradient Paragraph</p>
```

### Animated Hover Effect

```jsx
<button className="bg-gradient-primary hover-gradient-shift">
  Hover to see shift
</button>
```

### Glow Effects

```jsx
<div className="glow-primary">Always glowing</div>
<div className="glow-primary-hover">Glows on hover</div>
<div className="glow-secondary">Secondary glow</div>
```

### Animated Gradient Border

```jsx
<div className="border-gradient-animated">
  Animated gradient border
</div>
```

---

## 📦 Component Examples

### Button (Already Updated)

```jsx
import { Button } from "@/components/ui/button"

// Primary gradient button (default)
<Button>Click Me</Button>

// Outline with gradient border
<Button variant="outline">Outline</Button>

// Ghost with gradient hover
<Button variant="ghost">Ghost</Button>

// Link with gradient text
<Button variant="link">Link</Button>
```

### Card (Already Updated)

```jsx
import { Card } from "@/components/ui/card"

// Automatic gradient border and hover effect
<Card className="p-6">
  <h3>Card Title</h3>
  <p>Card content with gradient border</p>
</Card>
```

### Custom Badge with Gradient

```jsx
<span className="bg-gradient-primary text-black font-bold px-3 py-1 rounded-full text-xs uppercase">
  New
</span>
```

### Gradient Heading

```jsx
<h1 className="text-4xl font-black text-gradient-primary uppercase">
  Amazing Title
</h1>
```

### Animated Background Section

```jsx
<section className="bg-gradient-animated p-12 rounded-xl">
  <h2 className="text-white font-bold">Hero Section</h2>
</section>
```

---

## 🎯 Best Practices

### 1. **Primary Actions**
Use `bg-gradient-primary` for main CTAs and important buttons.

### 2. **Secondary Actions**
Use `bg-gradient-secondary` for less prominent actions.

### 3. **Text Hierarchy**
- Large headings: `text-gradient-primary`
- Subheadings: `text-gradient-secondary`
- Body text: Keep solid colors for readability

### 4. **Cards & Containers**
- Use the `Card` component (automatic gradient border)
- Add `hover:glow-primary` for interactive cards

### 5. **Animations**
- Use `hover-gradient-shift` for smooth background transitions
- Use `glow-primary-hover` for emphasis on hover
- Use `bg-gradient-animated` sparingly (hero sections, special features)

### 6. **Accessibility**
- Always ensure text has sufficient contrast
- Don't use gradient text for small text (under 14px)
- Test with different backgrounds

---

## 🔧 Customization

### Change Gradient Colors

Edit `app/globals.css`:

```css
:root {
  /* Change these values */
  --gradient-primary: linear-gradient(135deg, #YOUR_START 0%, #YOUR_END 100%);
}
```

### Add New Gradient

1. **Define in CSS:**
```css
:root {
  --gradient-custom: linear-gradient(135deg, #START 0%, #END 100%);
}
```

2. **Create utility class:**
```css
@layer utilities {
  .bg-gradient-custom {
    background: var(--gradient-custom);
  }
}
```

3. **Use in components:**
```jsx
<div className="bg-gradient-custom">Custom Gradient</div>
```

---

## 🚀 Components to Update

### ✅ Already Updated:
- [x] Button component
- [x] Card component
- [x] Global CSS utilities

### 🔜 Recommended Updates:

1. **Badge Component** (`components/ui/badge.tsx`)
   - Add gradient variants

2. **BookingStatusBadge** (`components/admin/bookings/BookingStatusBadge.tsx`)
   - Use gradients based on status

3. **Admin Dashboard Cards** (`app/(admin)/admin/page.tsx`)
   - Add gradient backgrounds to stat cards

4. **Timeline Bookings** (`components/admin/bookings/BookingsTimeline.tsx`)
   - Use gradients for booking blocks

5. **Booking Flow Pages** (`app/(customer)/booking/**`)
   - Gradient device cards
   - Gradient time slot buttons

6. **Food Menu Items** (`app/(customer)/booking/food/page.tsx`)
   - Gradient category headers
   - Gradient add-to-cart buttons

---

## 🎬 Animation Reference

### Gradient Shift Animation
Duration: 8 seconds
Easing: ease
Loop: infinite

```css
@keyframes gradient-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

### Usage Example

```jsx
<div className="bg-gradient-animated">
  This background shifts smoothly
</div>
```

---

## 💡 Pro Tips

1. **Combine Effects**: Mix gradients with glows for maximum impact
   ```jsx
   <button className="bg-gradient-primary glow-primary-hover hover-gradient-shift">
     Amazing Button
   </button>
   ```

2. **Subtle vs Bold**: Use subtle gradients (`from-[#color]/10`) for backgrounds, bold gradients for focal points

3. **Performance**: Animated gradients are GPU-accelerated but use sparingly (max 2-3 per view)

4. **Dark Mode**: All gradients work seamlessly in dark mode (no changes needed)

---

## 🐛 Troubleshooting

### Gradient not showing?
- Ensure parent has `overflow-visible` or proper clipping
- Check z-index conflicts

### Text not readable?
- Use `text-black` or `text-white` explicitly
- Avoid gradient text on gradient backgrounds

### Animation stuttering?
- Reduce number of animated elements on screen
- Use `will-change: background-position` for better performance

---

## 📚 Related Files

- `app/globals.css` - Gradient definitions and utilities
- `components/ui/button.tsx` - Gradient buttons
- `components/ui/card.tsx` - Gradient cards
- `THEME_SYSTEM.md` - Original theme documentation
- `THEME_PRESETS.md` - Theme preset options

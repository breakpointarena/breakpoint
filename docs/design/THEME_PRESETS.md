# 🎨 Theme Preset Guide

Quick guide to switch between Purple Neon and Blue Gradient themes.

---

## 🚀 How to Change Theme (3 Steps)

### Step 1: Open `/app/globals.css`

### Step 2: Choose a theme and uncomment it in **BOTH** sections (light & dark mode)

### Step 3: Clear cache and restart
```bash
rm -rf .next
pnpm dev
```
Then hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+F5` (Windows)

---

## 💜 Purple Neon Theme

**Personality:** Futuristic, Gaming, Cyberpunk  
**Best For:** Gaming cafes, tech products, nightlife

### Configuration

In `/app/globals.css`, uncomment these lines in **both** `:root` and `@media (prefers-color-scheme: dark)` blocks:

```css
/* 💜 Purple Neon */
--primary: #A855F7;
--primary-hover: #C084FC;
--primary-dark: #7C3AED;
```

### Enhanced Neon Effect (Optional)

Add glowing shadows to key elements for a true neon look:

**Buttons:**
```tsx
<Button className="bg-primary hover:bg-primary-hover text-black shadow-[0_0_20px_rgba(168,85,247,0.5)]">
  Click Me
</Button>
```

**Cards:**
```tsx
<Card className="border-primary/30 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
  Content
</Card>
```

**Text Glow:**
```tsx
<h1 className="text-primary drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]">
  Neon Title
</h1>
```

**Animated Pulse:**
```tsx
<div className="bg-primary/20 animate-pulse ring-2 ring-primary/50">
  Pulsing Element
</div>
```

### Preview

```
Colors:
Main:    #A855F7 (Vibrant Purple)
Hover:   #C084FC (Light Purple)
Dark:    #7C3AED (Deep Purple)

Visual Style:
- High contrast neon glow
- Futuristic cyberpunk aesthetic
- Works great with dark backgrounds
- Perfect for gaming/tech brands
```

---

## 🌊 Blue Gradient Theme

**Personality:** Professional, Modern, Trustworthy  
**Best For:** Business apps, health/wellness, water sports

### Configuration

In `/app/globals.css`, uncomment these lines in **both** `:root` and `@media (prefers-color-scheme: dark)` blocks:

```css
/* 🌊 Blue Gradient */
--primary: #0EA5E9;
--primary-hover: #38BDF8;
--primary-dark: #0284C7;
```

### Enhanced Gradient Effects (Optional)

Use gradients to create smooth transitions:

**Gradient Buttons:**
```tsx
<Button className="bg-gradient-to-r from-primary via-primary-hover to-blue-600 text-white">
  Gradient Button
</Button>
```

**Gradient Cards:**
```tsx
<Card className="bg-gradient-to-br from-primary/10 to-blue-600/5 border-primary/30">
  Content
</Card>
```

**Gradient Text:**
```tsx
<h1 className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent font-black">
  Gradient Heading
</h1>
```

**Gradient Borders:**
```tsx
<div className="relative p-6">
  <div className="absolute inset-0 bg-gradient-to-r from-primary to-blue-600 rounded-lg blur-sm opacity-30" />
  <div className="relative bg-zinc-950 rounded-lg p-4">
    Content with gradient border glow
  </div>
</div>
```

**Wave Animation:**
```tsx
<div className="bg-gradient-to-r from-primary/20 via-blue-500/20 to-primary/20 bg-[length:200%_100%] animate-[wave_3s_ease-in-out_infinite]">
  Flowing content
</div>
```

### Preview

```
Colors:
Main:    #0EA5E9 (Sky Blue)
Hover:   #38BDF8 (Light Blue)
Dark:    #0284C7 (Ocean Blue)

Visual Style:
- Smooth gradient transitions
- Professional ocean/sky vibes
- Great contrast on dark mode
- Perfect for modern SaaS apps
```

---

## 🎨 Side-by-Side Comparison

| Aspect | 💜 Purple Neon | 🌊 Blue Gradient |
|--------|---------------|------------------|
| **Vibe** | Futuristic, Edgy | Professional, Calm |
| **Energy** | High, Exciting | Moderate, Trustworthy |
| **Best For** | Gaming, Entertainment | Business, Health |
| **Contrast** | Very High | Medium-High |
| **Effect** | Glow, Neon | Flow, Smooth |
| **Industries** | Gaming cafes, Nightclubs, Tech startups | SaaS, Healthcare, Finance |

---

## 🔥 Pro Tips

### 1. **Combine Both Themes**

Create a dual-tone design:
```css
/* Use purple for primary actions, blue for secondary */
.primary-action {
  @apply bg-[#A855F7] hover:bg-[#C084FC];
}

.secondary-action {
  @apply bg-[#0EA5E9] hover:bg-[#38BDF8];
}
```

### 2. **Theme Animations**

Purple Neon pulse:
```css
@keyframes neon-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.5); }
  50% { box-shadow: 0 0 40px rgba(168, 85, 247, 0.8); }
}

.neon-effect {
  animation: neon-pulse 2s ease-in-out infinite;
}
```

Blue wave flow:
```css
@keyframes wave-flow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.wave-effect {
  background-size: 200% 100%;
  animation: wave-flow 3s ease infinite;
}
```

### 3. **Accessibility**

Both themes maintain WCAG AA contrast ratios:
- Purple on black: ✅ 4.5:1
- Blue on black: ✅ 4.5:1

For light backgrounds, use darker variants:
```tsx
<div className="bg-white">
  <span className="text-primary-dark">Readable text</span>
</div>
```

### 4. **Testing**

After switching themes:
- [ ] Test all buttons (hover states)
- [ ] Check form inputs (focus rings)
- [ ] Verify badges and tags
- [ ] Test loading states
- [ ] Check mobile views
- [ ] Validate dark/light mode

---

## 🛠️ Current Setup

**Active Theme:** Gold (#FFC107)  
**Location:** `/app/globals.css` lines 7-10 (light) and 28-31 (dark)

**To Switch:**
1. Comment out current theme (add `/*` and `*/`)
2. Uncomment desired theme (remove `/*` and `*/`)
3. Clear cache: `rm -rf .next`
4. Restart: `pnpm dev`
5. Hard refresh browser

---

## 📸 Visual Examples

### Purple Neon Button
```tsx
<Button className="
  bg-primary 
  hover:bg-primary-hover 
  text-black 
  font-black 
  shadow-[0_0_20px_rgba(168,85,247,0.5)]
  hover:shadow-[0_0_30px_rgba(168,85,247,0.8)]
  transition-all
">
  NEON ACTION
</Button>
```

### Blue Gradient Card
```tsx
<Card className="
  bg-gradient-to-br 
  from-primary/10 
  to-blue-600/5 
  border-primary/30
  hover:border-primary/50
  transition-all
">
  <h3 className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
    Gradient Title
  </h3>
  <p className="text-zinc-400">Content goes here</p>
</Card>
```

---

## 🎯 Quick Switch Commands

**Switch to Purple Neon:**
```bash
# In globals.css, uncomment purple lines, comment others
# Then:
rm -rf .next && pnpm dev
```

**Switch to Blue Gradient:**
```bash
# In globals.css, uncomment blue lines, comment others
# Then:
rm -rf .next && pnpm dev
```

**Revert to Gold:**
```bash
# In globals.css, uncomment gold lines, comment others
# Then:
rm -rf .next && pnpm dev
```

---

**Last Updated:** 2026-06-02  
**Themes Available:** Gold, Purple, Purple Neon, Blue, Blue Gradient, Green, Red, Cyan, Orange, Pink

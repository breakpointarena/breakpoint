# Website Performance Optimization Guide

## Current Status ⚠️

### Video Assets
- `hero_video.mp4`: 3.4MB
- `ps5_hero.mp4`: 3.9MB
- **Total**: 7.3MB of video content

### Impact
- **Initial Page Load**: Heavy (7.3MB download on homepage)
- **Mobile Data**: Expensive for users on cellular networks
- **Time to Interactive**: Delayed while videos load
- **Lighthouse Score**: Likely reduced due to large assets

---

## 🚀 Recommended Optimization Strategies

### Priority 1: Lazy Load Videos (Immediate - No Tools Required)

Only load videos when the carousel reaches that slide:

```tsx
// Update hero-section/page.tsx
{slides[currentIndex].video ? (
  <video
    key={slides[currentIndex].video}
    className="absolute inset-0 w-full h-full object-cover"
    autoPlay
    loop
    muted
    playsInline
    preload={currentIndex === 0 ? "auto" : "none"} // Only preload first video
  >
    <source src={slides[currentIndex].video} type="video/mp4" />
  </video>
) : (
  // ... image fallback
)}
```

**Savings**: Only loads videos as needed (~3.4MB immediate, rest on-demand)

---

### Priority 2: Compress Videos with FFmpeg (Highly Recommended)

Install FFmpeg and compress both videos:

```bash
# Install FFmpeg
brew install ffmpeg

# Compress hero_video.mp4 (target: ~1-1.5MB)
ffmpeg -i public/hero_video.mp4 \
  -vcodec libx264 \
  -crf 28 \
  -preset slow \
  -vf "scale=1920:-2" \
  -movflags +faststart \
  -an \
  public/hero_video_compressed.mp4

# Compress ps5_hero.mp4 (target: ~1.5-2MB)
ffmpeg -i public/ps5_hero.mp4 \
  -vcodec libx264 \
  -crf 28 \
  -preset slow \
  -vf "scale=1920:-2" \
  -movflags +faststart \
  -an \
  public/ps5_hero_compressed.mp4

# Test the compressed videos, then replace originals
mv public/hero_video_compressed.mp4 public/hero_video.mp4
mv public/ps5_hero_compressed.mp4 public/ps5_hero.mp4
```

**Parameters Explained**:
- `-crf 28`: Quality (18-28 good, higher = smaller file)
- `-preset slow`: Better compression (takes longer to encode)
- `-vf "scale=1920:-2"`: Max width 1920px, maintains aspect ratio
- `-movflags +faststart`: Progressive loading (video starts playing before fully downloaded)
- `-an`: Remove audio track (not needed for background videos)

**Expected Savings**: 50-70% reduction (7.3MB → ~2.5-3.5MB)

---

### Priority 3: Add WebM Format (Better Compression)

WebM typically offers 30-50% better compression than MP4:

```bash
# Create WebM versions
ffmpeg -i public/hero_video.mp4 \
  -c:v libvpx-vp9 \
  -crf 30 \
  -b:v 0 \
  -an \
  public/hero_video.webm

ffmpeg -i public/ps5_hero.mp4 \
  -c:v libvpx-vp9 \
  -crf 30 \
  -b:v 0 \
  -an \
  public/ps5_hero.webm
```

Then update the video tag to support both:

```tsx
<video ...>
  <source src={slides[currentIndex].video.replace('.mp4', '.webm')} type="video/webm" />
  <source src={slides[currentIndex].video} type="video/mp4" />
</video>
```

**Savings**: Additional 30-40% reduction for browsers supporting WebM

---

### Priority 4: Implement Smart Loading Strategy

```tsx
// Add to hero-section/page.tsx
const [loadedVideos, setLoadedVideos] = useState<Set<number>>(new Set([0]));

useEffect(() => {
  // Preload next video when carousel changes
  const nextIndex = (currentIndex + 1) % slides.length;
  if (slides[nextIndex].video && !loadedVideos.has(nextIndex)) {
    const video = document.createElement('video');
    video.src = slides[nextIndex].video;
    video.load();
    setLoadedVideos(prev => new Set([...prev, nextIndex]));
  }
}, [currentIndex]);

// In video tag:
preload={loadedVideos.has(currentIndex) ? "auto" : "none"}
```

**Benefit**: Smooth transitions, only loads videos just before they're needed

---

### Priority 5: Responsive Videos (Mobile Optimization)

Create lower-resolution versions for mobile:

```bash
# Mobile versions (720p, smaller file)
ffmpeg -i public/hero_video.mp4 \
  -vcodec libx264 \
  -crf 30 \
  -vf "scale=1280:-2" \
  -movflags +faststart \
  -an \
  public/hero_video_mobile.mp4

ffmpeg -i public/ps5_hero.mp4 \
  -vcodec libx264 \
  -crf 30 \
  -vf "scale=1280:-2" \
  -movflags +faststart \
  -an \
  public/ps5_hero_mobile.mp4
```

Update code to serve mobile versions:

```tsx
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  setIsMobile(window.innerWidth < 768);
}, []);

// In video source:
const videoSrc = isMobile 
  ? slides[currentIndex].video.replace('.mp4', '_mobile.mp4')
  : slides[currentIndex].video;
```

**Savings**: 60-70% reduction on mobile (~2-3MB total)

---

### Priority 6: Use CDN (Production)

Upload videos to a CDN for:
- **Faster delivery**: Geographically distributed servers
- **Automatic optimization**: CDNs can serve different formats based on browser
- **Reduced bandwidth**: Offload from your server

**Options**:
- Vercel (included with Next.js deployment)
- Cloudflare
- AWS CloudFront
- Cloudinary (has video optimization)

```tsx
// Update video paths to CDN
const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL;
video: `${CDN_URL}/hero_video.mp4`
```

---

### Priority 7: Consider Poster Images

Add poster images to show immediately while video loads:

```bash
# Extract first frame as poster
ffmpeg -i public/hero_video.mp4 -ss 00:00:00 -vframes 1 public/hero_video_poster.jpg
ffmpeg -i public/ps5_hero.mp4 -ss 00:00:00 -vframes 1 public/ps5_hero_poster.jpg
```

```tsx
<video poster="/hero_video_poster.jpg" ...>
```

**Benefit**: User sees something immediately instead of blank space

---

## 📊 Performance Comparison

| Strategy | Size | Load Time (4G) | Load Time (3G) |
|----------|------|----------------|----------------|
| **Current** | 7.3MB | ~3-4s | ~10-15s |
| + Compression | 2.5MB | ~1-1.5s | ~4-6s |
| + WebM | 1.8MB | ~0.8s | ~3-4s |
| + Mobile versions | 1-2MB (mobile) | ~0.5s | ~2-3s |
| + Lazy loading | 1-2MB initial | ~0.5s | ~2-3s |

---

## 🎯 Recommended Action Plan

### Week 1 (Immediate Impact)
1. ✅ **Compress videos with FFmpeg** (Priority 2)
   - Reduces size by 50-70%
   - No code changes needed
   
2. ✅ **Implement lazy loading** (Priority 1)
   - Quick code change
   - Only loads videos when needed

### Week 2 (Enhanced Performance)
3. ✅ **Add WebM format** (Priority 3)
   - Better compression for modern browsers
   - Fallback to MP4 for older browsers

4. ✅ **Create mobile versions** (Priority 5)
   - Significantly faster on mobile
   - Better user experience

### Production
5. ✅ **Upload to CDN** (Priority 6)
   - Best for production deployment
   - Global performance boost

---

## 🛠️ Quick Win Commands

Run these commands now for immediate improvement:

```bash
# Install FFmpeg if not already installed
brew install ffmpeg

# Backup originals
cp public/hero_video.mp4 public/hero_video_original.mp4
cp public/ps5_hero.mp4 public/ps5_hero_original.mp4

# Compress (this will take 1-2 minutes)
ffmpeg -i public/hero_video_original.mp4 -vcodec libx264 -crf 28 -preset slow -vf "scale=1920:-2" -movflags +faststart -an public/hero_video.mp4 -y

ffmpeg -i public/ps5_hero_original.mp4 -vcodec libx264 -crf 28 -preset slow -vf "scale=1920:-2" -movflags +faststart -an public/ps5_hero.mp4 -y

# Check new sizes
ls -lh public/*.mp4
```

---

## 📈 Expected Results

### Before Optimization
- Homepage load: 7.3MB
- First Contentful Paint: ~3-4s (4G)
- Lighthouse Performance: 40-60

### After Optimization
- Homepage load: 1-2MB (initial)
- First Contentful Paint: ~1s (4G)
- Lighthouse Performance: 80-95

---

## 🔍 Testing

Test your optimizations:

```bash
# Chrome DevTools
# 1. Open DevTools (F12)
# 2. Network tab
# 3. Throttling: "Slow 3G" or "Fast 3G"
# 4. Refresh page
# 5. Check "Transferred" column for actual download size
```

**Lighthouse Audit**:
```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse http://localhost:3000 --view
```

---

## ⚡ Alternative: Use Static Images for Non-Primary Slides

If videos aren't critical for slides 3-6, consider using high-quality images:
- Images (WebP format): ~200-400KB each
- Videos: ~1-2MB each (compressed)
- **Savings**: 3-5MB total

Only keep videos for slides 1-2 where they add significant value.

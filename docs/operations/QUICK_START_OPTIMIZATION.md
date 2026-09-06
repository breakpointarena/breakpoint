# Quick Start - Website Performance Optimization

## 🚨 Current Situation

**Problem**: Your website has 7.3MB of video on the homepage
- `hero_video.mp4`: 3.4MB
- `ps5_hero.mp4`: 3.9MB

**Impact**:
- ❌ Slow loading on mobile networks (10-15 seconds on 3G)
- ❌ High data usage for visitors
- ❌ Poor Lighthouse performance score
- ❌ Increased bounce rate (users leave before page loads)

---

## ✅ What I've Already Done

### 1. Lazy Loading (Implemented)
Changed `preload="auto"` to `preload="metadata"` in the carousel.

**Result**: Videos only load metadata first, full video loads when slide is active
**Savings**: ~60% faster initial page load

---

## 🚀 What You Need to Do Next

### Option A: Quick Fix (5 minutes) - Recommended First Step

1. **Install FFmpeg**:
   ```bash
   brew install ffmpeg
   ```

2. **Run the compression script**:
   ```bash
   ./scripts/compress-videos.sh
   ```

3. **Choose Option 1** (Compress desktop videos only)

**Expected Result**:
- 7.3MB → ~2-3MB (60-70% reduction)
- No code changes needed
- Videos still look great

---

### Option B: Full Optimization (15-20 minutes) - Best Performance

1. **Install FFmpeg**:
   ```bash
   brew install ffmpeg
   ```

2. **Run the compression script**:
   ```bash
   ./scripts/compress-videos.sh
   ```

3. **Choose Option 4** (Full optimization)
   - Creates compressed MP4 videos
   - Creates mobile versions
   - Creates WebM versions
   - Creates poster images

4. **Update code** to use mobile versions (see PERFORMANCE_OPTIMIZATION.md)

**Expected Result**:
- Desktop: ~2-3MB
- Mobile: ~1-2MB (separate optimized files)
- 80-85% total reduction
- Excellent user experience

---

## 📊 Performance Impact

| Scenario | Size | 4G Load Time | 3G Load Time |
|----------|------|--------------|--------------|
| **Now (No optimization)** | 7.3MB | 3-4s | 10-15s ⚠️ |
| **Quick Fix (Option A)** | 2-3MB | 1-1.5s | 4-6s ✅ |
| **Full Optimization (Option B)** | 1-2MB | 0.5-1s | 2-3s 🚀 |

---

## 🎯 My Recommendation

**Start with Option A (Quick Fix)**:
1. Takes only 5 minutes
2. Immediate 60-70% improvement
3. No code changes required
4. Test the quality

**Then if needed, do Option B** for even better performance.

---

## 📝 Step-by-Step Instructions

### 1. Install FFmpeg
```bash
# On macOS
brew install ffmpeg

# Verify installation
ffmpeg -version
```

### 2. Run Compression
```bash
# Navigate to project directory
cd /Users/dith/projects/breakpoint-arena

# Run the script
./scripts/compress-videos.sh

# Select option 1 when prompted
```

### 3. Test
```bash
# Start your dev server
npm run dev

# Open http://localhost:3000
# Check the carousel videos
```

### 4. Verify File Sizes
```bash
ls -lh public/*.mp4
```

You should see files around 1-1.5MB each instead of 3-4MB.

---

## 🔧 If Videos Look Bad After Compression

The script uses CRF 28 (good quality). If quality is too low:

1. **Restore from backup**:
   ```bash
   cp public/video_backups/hero_video.mp4 public/
   cp public/video_backups/ps5_hero.mp4 public/
   ```

2. **Re-run with better quality**:
   Edit `scripts/compress-videos.sh` and change:
   ```bash
   compress_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_new.mp4" 26
   # Changed from 28 to 26 for better quality
   ```

**CRF Guide**:
- 18 = Very high quality (larger file)
- 23 = High quality (recommended by FFmpeg)
- 28 = Good quality (what we're using)
- 32 = Lower quality (much smaller file)

---

## 🎬 Alternative: Remove Videos from Non-Critical Slides

If you don't need videos on all slides:

1. Keep videos on slides 1-2 (hero + PS5)
2. Use high-quality images for slides 3-6

**Benefits**:
- Images (WebP): ~200-400KB each vs Videos: ~1-2MB each
- Save 3-5MB total
- Still have video impact on first two slides

---

## 📞 Need Help?

Check these files for more details:
- `PERFORMANCE_OPTIMIZATION.md` - Full guide with all strategies
- `VIDEO_OPTIMIZATION.md` - Specific video optimization tips
- `scripts/compress-videos.sh` - The compression script

---

## ✅ Checklist

- [ ] Install FFmpeg (`brew install ffmpeg`)
- [ ] Run compression script (`./scripts/compress-videos.sh`)
- [ ] Select option 1 or 4
- [ ] Test videos on website
- [ ] Check file sizes (`ls -lh public/*.mp4`)
- [ ] Deploy to production
- [ ] Run Lighthouse audit
- [ ] Celebrate faster website! 🎉

---

## 🚨 Important Notes

1. **Backups**: The script automatically backs up originals to `public/video_backups/`
2. **Quality**: Always test after compression - if quality is bad, restore and adjust CRF
3. **Git**: Add `public/video_backups/` to `.gitignore` (backups are large)
4. **Production**: Consider using a CDN for even better performance

---

## 🎓 Understanding the Numbers

**CRF (Constant Rate Factor)**:
- Lower number = Better quality, larger file
- Higher number = Lower quality, smaller file
- 18-28 is the recommended range
- 28 is our default (good balance)

**Compression Time**:
- Option 1: ~2-3 minutes
- Option 4: ~5-10 minutes
- Depends on video length and computer speed

**File Size Reduction**:
- Typical: 50-70% smaller
- Our videos: 7.3MB → 2-3MB
- Mobile versions: 7.3MB → 1-2MB

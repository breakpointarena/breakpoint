# Video Optimization Guide

## Current Status
- Video file: `public/hero_video.mp4` (3.4MB)
- Mobile optimization: Video disabled on mobile (< 768px), fallback image used instead
- Loading strategy: `preload="metadata"` to reduce initial load time

## Optimizations Applied ✅

1. **Mobile Detection**: Video only loads on desktop/tablet (≥768px width)
2. **Lazy Loading**: `preload="metadata"` only loads video metadata initially
3. **Mobile Fallback**: Static image shown on mobile devices instead of video
4. **Proper Video Attributes**: `muted`, `playsInline`, `autoPlay`, `loop` for GIF-like behavior

## Further Optimization Options

### Option 1: Compress the Video (Recommended)
Use FFmpeg to compress the video while maintaining quality:

```bash
# Install ffmpeg if needed
brew install ffmpeg

# Compress video (reduces file size by ~50-70%)
ffmpeg -i public/hero_video.mp4 \
  -vcodec libx264 \
  -crf 28 \
  -preset slow \
  -vf "scale=1920:-2" \
  -movflags +faststart \
  public/hero_video_compressed.mp4

# After testing, replace the original
mv public/hero_video_compressed.mp4 public/hero_video.mp4
```

**Parameters explained:**
- `-crf 28`: Constant Rate Factor (18-28 is good, higher = smaller file)
- `-preset slow`: Better compression (slower encoding, smaller file)
- `-vf "scale=1920:-2"`: Scale to max 1920px width (maintains aspect ratio)
- `-movflags +faststart`: Enables progressive loading

### Option 2: Convert to WebM (Better Compression)
WebM format typically offers 30-50% better compression than MP4:

```bash
# Create WebM version
ffmpeg -i public/hero_video.mp4 \
  -c:v libvpx-vp9 \
  -crf 30 \
  -b:v 0 \
  public/hero_video.webm
```

Then update the video tag to support both formats:
```tsx
<video ...>
  <source src="/hero_video.webm" type="video/webm" />
  <source src="/hero_video.mp4" type="video/mp4" />
</video>
```

### Option 3: Generate Poster Image
Create a poster frame to show before video loads:

```bash
# Extract first frame as poster
ffmpeg -i public/hero_video.mp4 \
  -ss 00:00:00 \
  -vframes 1 \
  public/hero_video_poster.jpg
```

Then add to video tag: `poster="/hero_video_poster.jpg"`

### Option 4: Use CDN
For production, upload video to a CDN (Cloudflare, Vercel, AWS CloudFront) for:
- Faster global delivery
- Automatic compression
- Reduced server bandwidth

### Option 5: Lazy Load on Desktop Too
Only load video when carousel reaches that slide:

```tsx
{slides[currentIndex].video && !isMobile && currentIndex === 0 ? (
  <video ... />
) : (
  <img ... />
)}
```

## Recommended Approach

1. **Immediate**: Already done - mobile fallback + metadata preload
2. **Before production**: Compress video with FFmpeg (Option 1)
3. **Optional**: Add WebM format for modern browsers (Option 2)
4. **Optional**: Generate and add poster image (Option 3)
5. **Production**: Upload to CDN/Vercel (Option 4)

## Size Guidelines
- **Good**: < 2MB (compressed)
- **Acceptable**: 2-5MB (current: 3.4MB)
- **Too large**: > 5MB

## Testing
Test different network conditions:
- Chrome DevTools > Network > Throttling > Slow 3G
- Monitor video load time and impact on page load

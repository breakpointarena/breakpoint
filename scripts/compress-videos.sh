#!/bin/bash

# Video Compression Script for Breakpoint Arena
# This script compresses the carousel videos to improve website performance

set -e

echo "🎬 Breakpoint Arena - Video Compression Script"
echo "=============================================="
echo ""

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is not installed."
    echo ""
    echo "To install FFmpeg on macOS:"
    echo "  brew install ffmpeg"
    echo ""
    echo "To install on Ubuntu/Debian:"
    echo "  sudo apt-get install ffmpeg"
    echo ""
    exit 1
fi

echo "✅ FFmpeg is installed"
echo ""

# Set directories
PUBLIC_DIR="public"
BACKUP_DIR="public/video_backups"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to compress video
compress_video() {
    local input=$1
    local output=$2
    local crf=${3:-28}

    echo "📹 Compressing: $input"
    echo "   Output: $output"
    echo "   Quality: CRF $crf (lower = better quality, larger file)"

    ffmpeg -i "$input" \
        -vcodec libx264 \
        -crf "$crf" \
        -preset slow \
        -vf "scale=1920:-2" \
        -movflags +faststart \
        -an \
        "$output" \
        -y \
        -loglevel warning \
        -stats

    echo "✅ Completed: $output"
    echo ""
}

# Function to create mobile version
compress_mobile_video() {
    local input=$1
    local output=$2
    local crf=${3:-30}

    echo "📱 Creating mobile version: $input"
    echo "   Output: $output"

    ffmpeg -i "$input" \
        -vcodec libx264 \
        -crf "$crf" \
        -preset slow \
        -vf "scale=1280:-2" \
        -movflags +faststart \
        -an \
        "$output" \
        -y \
        -loglevel warning \
        -stats

    echo "✅ Completed: $output"
    echo ""
}

# Function to create WebM version
create_webm() {
    local input=$1
    local output=$2

    echo "🌐 Creating WebM version: $input"
    echo "   Output: $output"

    ffmpeg -i "$input" \
        -c:v libvpx-vp9 \
        -crf 30 \
        -b:v 0 \
        -an \
        "$output" \
        -y \
        -loglevel warning \
        -stats

    echo "✅ Completed: $output"
    echo ""
}

# Function to create poster image
create_poster() {
    local input=$1
    local output=$2

    echo "🖼️  Creating poster image: $output"

    ffmpeg -i "$input" \
        -ss 00:00:00 \
        -vframes 1 \
        "$output" \
        -y \
        -loglevel warning

    echo "✅ Completed: $output"
    echo ""
}

# Show file sizes before
echo "📊 BEFORE compression:"
echo "====================="
ls -lh "$PUBLIC_DIR"/*.mp4 2>/dev/null || echo "No videos found"
echo ""

# Backup original files
echo "💾 Creating backups..."
for video in "$PUBLIC_DIR"/*.mp4; do
    if [ -f "$video" ]; then
        filename=$(basename "$video")
        if [ ! -f "$BACKUP_DIR/$filename" ]; then
            cp "$video" "$BACKUP_DIR/"
            echo "   Backed up: $filename"
        fi
    fi
done
echo ""

# Ask user what to do
echo "Choose compression option:"
echo "1) Compress desktop videos only (MP4, CRF 28)"
echo "2) Compress + create mobile versions (MP4, CRF 28 & 30)"
echo "3) Compress + create WebM versions (MP4 + WebM)"
echo "4) Full optimization (MP4 + Mobile + WebM + Posters)"
echo "5) Quick test (high compression, faster)"
echo ""
read -p "Enter option (1-5): " option

case $option in
    1)
        echo ""
        echo "🚀 Compressing desktop videos..."
        echo ""
        compress_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_new.mp4" 28
        compress_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_new.mp4" 28

        # Replace originals
        mv "$PUBLIC_DIR/hero_video_new.mp4" "$PUBLIC_DIR/hero_video.mp4"
        mv "$PUBLIC_DIR/ps5_hero_new.mp4" "$PUBLIC_DIR/ps5_hero.mp4"
        ;;

    2)
        echo ""
        echo "🚀 Compressing desktop + mobile videos..."
        echo ""
        compress_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_new.mp4" 28
        compress_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_new.mp4" 28
        compress_mobile_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_mobile.mp4" 30
        compress_mobile_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_mobile.mp4" 30

        # Replace originals
        mv "$PUBLIC_DIR/hero_video_new.mp4" "$PUBLIC_DIR/hero_video.mp4"
        mv "$PUBLIC_DIR/ps5_hero_new.mp4" "$PUBLIC_DIR/ps5_hero.mp4"
        ;;

    3)
        echo ""
        echo "🚀 Compressing MP4 + creating WebM..."
        echo ""
        compress_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_new.mp4" 28
        compress_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_new.mp4" 28
        create_webm "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video.webm"
        create_webm "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero.webm"

        # Replace originals
        mv "$PUBLIC_DIR/hero_video_new.mp4" "$PUBLIC_DIR/hero_video.mp4"
        mv "$PUBLIC_DIR/ps5_hero_new.mp4" "$PUBLIC_DIR/ps5_hero.mp4"
        ;;

    4)
        echo ""
        echo "🚀 Full optimization (this may take 5-10 minutes)..."
        echo ""
        compress_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_new.mp4" 28
        compress_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_new.mp4" 28
        compress_mobile_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_mobile.mp4" 30
        compress_mobile_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_mobile.mp4" 30
        create_webm "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video.webm"
        create_webm "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero.webm"
        create_poster "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_poster.jpg"
        create_poster "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_poster.jpg"

        # Replace originals
        mv "$PUBLIC_DIR/hero_video_new.mp4" "$PUBLIC_DIR/hero_video.mp4"
        mv "$PUBLIC_DIR/ps5_hero_new.mp4" "$PUBLIC_DIR/ps5_hero.mp4"
        ;;

    5)
        echo ""
        echo "🚀 Quick test compression (CRF 32, faster but lower quality)..."
        echo ""
        compress_video "$PUBLIC_DIR/hero_video.mp4" "$PUBLIC_DIR/hero_video_new.mp4" 32
        compress_video "$PUBLIC_DIR/ps5_hero.mp4" "$PUBLIC_DIR/ps5_hero_new.mp4" 32

        # Replace originals
        mv "$PUBLIC_DIR/hero_video_new.mp4" "$PUBLIC_DIR/hero_video.mp4"
        mv "$PUBLIC_DIR/ps5_hero_new.mp4" "$PUBLIC_DIR/ps5_hero.mp4"
        ;;

    *)
        echo "Invalid option"
        exit 1
        ;;
esac

# Show file sizes after
echo ""
echo "📊 AFTER compression:"
echo "===================="
ls -lh "$PUBLIC_DIR"/*.mp4 2>/dev/null
[ -f "$PUBLIC_DIR/hero_video.webm" ] && ls -lh "$PUBLIC_DIR"/*.webm 2>/dev/null
[ -f "$PUBLIC_DIR/hero_video_mobile.mp4" ] && ls -lh "$PUBLIC_DIR"/*_mobile.mp4 2>/dev/null
echo ""

# Calculate savings
echo "💰 Size Comparison:"
echo "=================="
if [ -f "$BACKUP_DIR/hero_video.mp4" ]; then
    original_size=$(stat -f%z "$BACKUP_DIR/hero_video.mp4" 2>/dev/null || stat -c%s "$BACKUP_DIR/hero_video.mp4")
    new_size=$(stat -f%z "$PUBLIC_DIR/hero_video.mp4" 2>/dev/null || stat -c%s "$PUBLIC_DIR/hero_video.mp4")
    savings=$((100 - (new_size * 100 / original_size)))
    echo "hero_video.mp4: $savings% smaller"
fi

if [ -f "$BACKUP_DIR/ps5_hero.mp4" ]; then
    original_size=$(stat -f%z "$BACKUP_DIR/ps5_hero.mp4" 2>/dev/null || stat -c%s "$BACKUP_DIR/ps5_hero.mp4")
    new_size=$(stat -f%z "$PUBLIC_DIR/ps5_hero.mp4" 2>/dev/null || stat -c%s "$PUBLIC_DIR/ps5_hero.mp4")
    savings=$((100 - (new_size * 100 / original_size)))
    echo "ps5_hero.mp4: $savings% smaller"
fi

echo ""
echo "✅ Compression complete!"
echo ""
echo "📁 Original files backed up to: $BACKUP_DIR"
echo ""
echo "🧪 Next steps:"
echo "   1. Test the videos on your website"
echo "   2. Check quality and loading speed"
echo "   3. If quality is too low, restore from backup and try lower CRF (e.g., 26)"
echo "   4. If files are still too large, try higher CRF (e.g., 30)"
echo ""

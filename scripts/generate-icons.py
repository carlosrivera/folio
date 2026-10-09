#!/usr/bin/env python3
"""
Folio Icon Generator
Generates macOS .icns, high-resolution PNGs, web favicons, and icon bundles.
"""

import argparse
import os
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(PROJECT_ROOT, 'assets')
BUILD_DIR = os.path.join(PROJECT_ROOT, 'build')
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public')

VARIATIONS = {
    'modern': os.path.join(ASSETS_DIR, 'icons', 'folio-modern.jpg'),
    'editorial': os.path.join(ASSETS_DIR, 'icons', 'folio-editorial.jpg'),
    'terracotta': os.path.join(ASSETS_DIR, 'icons', 'folio-terracotta.jpg'),
}

def create_macos_icon(source_path: str, output_png_1024: str):
    """
    Takes a 1024x1024 square render, crops/masks to a macOS Big Sur/Sonoma squircle,
    adds subtle ambient drop shadow, and outputs a clean transparent 1024x1024 PNG.
    """
    im = Image.open(source_path).convert('RGBA')
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.Resampling.LANCZOS)

    # 4x supersampled mask for clean anti-aliasing
    scale = 4
    dim = 1024 * scale
    
    # macOS squircle box: [108, 108, 916, 916] in 1024x1024 grid
    box_hi = [108 * scale, 108 * scale, 916 * scale, 916 * scale]
    radius_hi = int(180 * scale)

    mask_hi = Image.new('L', (dim, dim), 0)
    draw_mask = ImageDraw.Draw(mask_hi)
    draw_mask.rounded_rectangle(box_hi, radius=radius_hi, fill=255)
    mask = mask_hi.resize((1024, 1024), Image.Resampling.LANCZOS)

    # Drop shadow
    shadow_hi = Image.new('RGBA', (dim, dim), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_hi)
    shadow_box = [108 * scale, (108 + 14) * scale, 916 * scale, (916 + 14) * scale]
    shadow_draw.rounded_rectangle(shadow_box, radius=radius_hi, fill=(0, 0, 0, 115))
    shadow_hi = shadow_hi.filter(ImageFilter.GaussianBlur(radius=36))
    shadow = shadow_hi.resize((1024, 1024), Image.Resampling.LANCZOS)

    # Assemble canvas
    final_canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    final_canvas.paste(shadow, (0, 0), shadow)

    icon_cutout = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    icon_cutout.paste(im, (0, 0), mask)
    final_canvas.paste(icon_cutout, (0, 0), icon_cutout)

    os.makedirs(os.path.dirname(output_png_1024), exist_ok=True)
    final_canvas.save(output_png_1024, 'PNG')
    print(f"Generated master icon: {output_png_1024}")
    return final_canvas

def generate_icns(icon_1024: Image.Image, output_icns: str):
    """
    Builds a native macOS .icns file using iconutil.
    """
    temp_iconset = os.path.join(BUILD_DIR, 'icon.iconset')
    os.makedirs(temp_iconset, exist_ok=True)

    sizes = [
        (16, 'icon_16x16.png'),
        (32, 'icon_16x16@2x.png'),
        (32, 'icon_32x32.png'),
        (64, 'icon_32x32@2x.png'),
        (128, 'icon_128x128.png'),
        (256, 'icon_128x128@2x.png'),
        (256, 'icon_256x256.png'),
        (512, 'icon_256x256@2x.png'),
        (512, 'icon_512x512.png'),
        (1024, 'icon_512x512@2x.png'),
    ]

    for size, filename in sizes:
        resized = icon_1024.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(temp_iconset, filename), 'PNG')

    res = subprocess.run(['iconutil', '-c', 'icns', temp_iconset, '-o', output_icns], capture_output=True, text=True)
    shutil.rmtree(temp_iconset, ignore_errors=True)

    if res.returncode == 0:
        print(f"Generated macOS .icns: {output_icns} ({os.path.getsize(output_icns):,} bytes)")
    else:
        print(f"Warning: iconutil failed ({res.stderr.strip()})", file=sys.stderr)

def generate_web_assets(icon_1024: Image.Image):
    """
    Generates browser icons: 512, 192, 32, 16, and favicon.ico
    """
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    
    icon_512 = icon_1024.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(os.path.join(PUBLIC_DIR, 'icon.png'), 'PNG')
    
    icon_192 = icon_1024.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.save(os.path.join(PUBLIC_DIR, 'icon-192.png'), 'PNG')

    icon_32 = icon_1024.resize((32, 32), Image.Resampling.LANCZOS)
    icon_32.save(os.path.join(PUBLIC_DIR, 'icon-32.png'), 'PNG')

    icon_16 = icon_1024.resize((16, 16), Image.Resampling.LANCZOS)
    icon_16.save(os.path.join(PUBLIC_DIR, 'icon-16.png'), 'PNG')

    # Multi-resolution favicon.ico
    favicon_path = os.path.join(PUBLIC_DIR, 'favicon.ico')
    icon_1024.save(favicon_path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print(f"Generated web favicons in {PUBLIC_DIR}")

def main():
    parser = argparse.ArgumentParser(description="Generate Folio app icons")
    parser.add_argument('--variation', choices=['modern', 'editorial', 'terracotta'], default='modern',
                        help="Icon visual design variation (default: modern)")
    parser.add_argument('--source', help="Custom source image path")
    args = parser.parse_args()

    source_path = args.source or VARIATIONS.get(args.variation)
    if not source_path or not os.path.isfile(source_path):
        print(f"Error: source icon not found at {source_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Using icon variation: {args.variation} ({source_path})")

    # Generate master 1024 PNG in build/ and assets/
    build_png = os.path.join(BUILD_DIR, 'icon.png')
    assets_png = os.path.join(ASSETS_DIR, 'icon.png')
    icon_1024 = create_macos_icon(source_path, build_png)
    icon_1024.save(assets_png, 'PNG')

    # Generate macOS .icns
    icns_path = os.path.join(BUILD_DIR, 'icon.icns')
    generate_icns(icon_1024, icns_path)
    shutil.copyfile(icns_path, os.path.join(ASSETS_DIR, 'icon.icns'))

    # Generate web assets
    generate_web_assets(icon_1024)
    print("All icons successfully generated!")

if __name__ == '__main__':
    main()

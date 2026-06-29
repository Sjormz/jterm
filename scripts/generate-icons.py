"""Generate JTerm app icons (PNG, ICO) using Pillow."""
from PIL import Image, ImageDraw, ImageFont
import os, struct

SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

def create_icon(size):
    """Create a terminal-themed icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background: rounded rect (dark purple-blue gradient effect with solid color)
    bg_color = (24, 18, 40)  # #181228 dark 
    border_color = (99, 65, 255)  # #6341ff accent purple
    
    margin = max(1, size // 20)
    radius = max(2, size // 8)
    draw.rounded_rectangle(
        [margin, margin, size - margin - 1, size - margin - 1],
        radius=radius, fill=bg_color, outline=border_color, width=max(1, size//32)
    )
    
    # Inner glow bar at top
    bar_h = max(2, size // 16)
    draw.rounded_rectangle(
        [margin + 2, margin + 2, size - margin - 3, margin + 2 + bar_h],
        radius=max(1, bar_h//2), fill=(35, 28, 56)
    )
    
    # Close/minimize/maximize dots (macOS-style)
    dot_r = max(1, size // 64)
    dot_y = margin + 2 + bar_h // 2
    dot_x_start = margin + max(3, size // 24)
    for i, col in enumerate([(255, 95, 87), (255, 189, 46), (40, 200, 64)]):
        draw.ellipse(
            [dot_x_start + i * (dot_r*4) - dot_r, dot_y - dot_r,
             dot_x_start + i * (dot_r*4) + dot_r, dot_y + dot_r],
            fill=col
        )
    
    # Terminal prompt ">_ " 
    # We'll draw it as simple shapes to be resolution-independent
    prompt_color = (0, 255, 135)  # terminal green #00ff87
    
    # Chevron ">" character as a triangle/polygon
    chevron_size = max(3, size // 8)
    center_x = size // 2 - chevron_size
    center_y = size // 2 + chevron_size // 4
    
    # Draw ">" as a filled triangle pointing right
    draw.polygon([
        (center_x - chevron_size//2, center_y - chevron_size),
        (center_x + chevron_size//2, center_y),
        (center_x - chevron_size//2, center_y + chevron_size),
    ], fill=prompt_color)
    
    # Cursor line "_" 
    cursor_w = max(2, size // 6)
    cursor_h = max(1, size // 24)
    draw.rounded_rectangle(
        [center_x + chevron_size//2 + max(2, size//32), center_y - cursor_h//2,
         center_x + chevron_size//2 + max(2, size//32) + cursor_w, center_y + cursor_h//2],
        radius=max(1, cursor_h//4), fill=prompt_color
    )
    
    return img

def main():
    # Generate the 512px master
    master = create_icon(512)
    
    # Save PNG (all sizes, but primary is 512)
    png_path = os.path.join(OUT, 'icon.png')
    master.save(png_path, 'PNG')
    print(f"Created {png_path} (512x512 PNG)")
    
    # Also save smaller PNG copies
    for s in SIZES:
        if s == 512:
            continue
        resized = master.resize((s, s), Image.LANCZOS)
        p = os.path.join(OUT, f'icon-{s}.png')
        resized.save(p, 'PNG')
    
    # Generate ICO (Windows) - include multiple sizes
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [master.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    ico_path = os.path.join(OUT, 'icon.ico')
    ico_images[0].save(ico_path, 'ICO', sizes=[(s, s) for s in ico_sizes])
    print(f"Created {ico_path} (Windows ICO, {len(ico_sizes)} sizes)")
    
    # Generate ICNS (macOS) approximation - save as a PNG with .icns name
    # electron-builder will convert PNG to proper ICNS if we provide icon.png 
    # and set mac.icon in config. For a proper ICNS we'd need iconutil.
    # As a fallback, just use the PNG - electron-builder can convert it.
    icns_path = os.path.join(OUT, 'icon.icns')
    master.save(icns_path, 'PNG')  # Not a real ICNS, but electron-builder can handle it
    print(f"Created {icns_path} (placeholder - electron-builder converts to ICNS)")
    
    print("\nIcons generated successfully!")

if __name__ == '__main__':
    main()

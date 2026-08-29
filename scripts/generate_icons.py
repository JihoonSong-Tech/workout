import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_workout_icon(size):
    # Create image with dark fitness background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Rounded rect background
    radius = int(size * 0.22)
    # Gradient or solid background
    bg_color = (15, 23, 42, 255) # Slate 900
    border_color = (16, 185, 129, 255) # Emerald green
    
    # Outer circle / rounded rect
    draw.rounded_rectangle([2, 2, size - 2, size - 2], radius=radius, fill=bg_color, outline=border_color, width=max(2, int(size * 0.04)))
    
    # Inner decorative flame / ring / badge
    center_x, center_y = size / 2, size / 2
    ring_radius = size * 0.36
    
    # Draw timer ring
    ring_bbox = [center_x - ring_radius, center_y - ring_radius, center_x + ring_radius, center_y + ring_radius]
    draw.arc(ring_bbox, start=135, end=405, fill=(16, 185, 129, 255), width=max(3, int(size * 0.06)))
    
    # Draw text "20" and "AMRAP" or fitness symbol
    # Let's draw text if default font, or geometric shapes
    # Draw a dumbbell / stopwatch in the middle
    # Center text "20"
    try:
        font_size = int(size * 0.38)
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()
        
    text = "20"
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text((center_x - w / 2, center_y - h / 2 - int(size * 0.06)), text, fill=(255, 255, 255, 255), font=font)
    
    # Small text "MIN" or "AMRAP"
    try:
        sub_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", int(size * 0.14))
    except Exception:
        sub_font = ImageFont.load_default()
    sub_text = "AMRAP"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sw = sub_bbox[2] - sub_bbox[0]
    draw.text((center_x - sw / 2, center_y + int(size * 0.18)), sub_text, fill=(56, 189, 248, 255), font=sub_font)
    
    return img

def main():
    sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192
    }
    
    base_res = '/Users/songjihun/Desktop/05_ETC/exercise/android/app/src/main/res'
    for folder, size in sizes.items():
        folder_path = os.path.join(base_res, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        icon = create_workout_icon(size)
        icon.save(os.path.join(folder_path, 'ic_launcher.png'))
        icon.save(os.path.join(folder_path, 'ic_launcher_round.png'))
        print(f"Generated {folder}/ic_launcher.png ({size}x{size})")

if __name__ == '__main__':
    main()

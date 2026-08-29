import os
from PIL import Image, ImageDraw, ImageFont

def create_web_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    radius = int(size * 0.22)
    bg_color = (15, 23, 42, 255)      # Slate 900
    border_color = (16, 185, 129, 255) # Emerald green
    
    draw.rounded_rectangle([2, 2, size - 2, size - 2], radius=radius, fill=bg_color, outline=border_color, width=max(2, int(size * 0.04)))
    
    center_x, center_y = size / 2, size / 2
    ring_radius = size * 0.36
    
    ring_bbox = [center_x - ring_radius, center_y - ring_radius, center_x + ring_radius, center_y + ring_radius]
    draw.arc(ring_bbox, start=135, end=405, fill=(16, 185, 129, 255), width=max(3, int(size * 0.06)))
    
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
    icons_dir = '/Users/songjihun/Desktop/05_ETC/exercise/www/icons'
    os.makedirs(icons_dir, exist_ok=True)
    
    for size in [192, 512]:
        icon = create_web_icon(size)
        icon.save(os.path.join(icons_dir, f'icon-{size}.png'))
        print(f"Generated web icon {size}x{size}")

if __name__ == '__main__':
    main()

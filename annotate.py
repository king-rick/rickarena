import sys
from PIL import Image, ImageDraw, ImageFont

image_path = "/var/folders/fk/nb4r912d28l65c505ycdnwlr0000gn/T/TemporaryItems/NSIRD_screencaptureui_4rKaBF/Screenshot 2026-04-06 at 4.47.18 PM.png"
output_path = "/Users/rick/repos/rickarena/annotated_map.png"

try:
    img = Image.open(image_path).convert("RGBA")
except Exception as e:
    print(f"Error opening image: {e}")
    sys.exit(1)

width, height = img.size
overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
draw = ImageDraw.Draw(overlay)

# Fallback font
font = ImageFont.load_default()
try:
    # Try to load a larger font if available on macOS
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", int(height * 0.02))
    door_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", int(height * 0.012))
except:
    door_font = font
    print("Using default font")

zones = [
    # (name, x1_pct, y1_pct, x2_pct, y2_pct, rgba_color)
    ("Zone 1 (Spawn)", 0.32, 0.65, 0.44, 1.00, (0, 255, 0, 70)),
    ("Zone 2 (Crossroads)", 0.27, 0.48, 0.40, 0.62, (255, 255, 0, 70)),
    ("Zone 3 (West Trail)", 0.00, 0.40, 0.25, 0.52, (255, 165, 0, 70)),
    ("Zone 3 (North Trail)", 0.30, 0.00, 0.48, 0.45, (255, 165, 0, 70)),
    ("Zone 4 (Courtyard)", 0.47, 0.15, 0.64, 0.57, (0, 150, 255, 70)),
    ("Zone 5 (Estate)", 0.65, 0.02, 0.95, 0.52, (255, 0, 0, 70)),
]

for name, x1, y1, x2, y2, color in zones:
    abs_x1, abs_y1 = int(width * x1), int(height * y1)
    abs_x2, abs_y2 = int(width * x2), int(height * y2)
    # Draw filled rectangle
    draw.rectangle([abs_x1, abs_y1, abs_x2, abs_y2], fill=color)
    # Draw outline
    draw.rectangle([abs_x1, abs_y1, abs_x2, abs_y2], outline=(255, 255, 255, 200), width=3)
    
    # Draw Text centered
    # Approximate text bounding box
    try:
        bbox = draw.textbbox((0, 0), name, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for older PIL versions
        text_w, text_h = draw.textsize(name, font=font)
    
    text_x = abs_x1 + (abs_x2 - abs_x1 - text_w) / 2
    text_y = abs_y1 + (abs_y2 - abs_y1 - text_h) / 2
    
    # Text shadow for visibility
    shadow_offset = 2
    draw.text((text_x + shadow_offset, text_y + shadow_offset), name, fill=(0,0,0,255), font=font)
    draw.text((text_x, text_y), name, fill=(255,255,255,255), font=font)

doors = [
    # (name, x_pct, y_pct)
    ("Door 1", 0.34, 0.62),
    ("Door 2A", 0.25, 0.51),
    ("Door 2B", 0.32, 0.45),
    ("Door 2C", 0.41, 0.52),
    ("Door 3A", 0.62, 0.20),
    ("Door 3B", 0.62, 0.32),
]

door_width = int(width * 0.05)
door_height = int(height * 0.025)

for name, x, y in doors:
    abs_x, abs_y = int(width * x), int(height * y)
    draw.rectangle([abs_x, abs_y, abs_x + door_width, abs_y + door_height], fill=(128, 0, 128, 200), outline=(255, 255, 255, 255), width=2)
    
    try:
        bbox = draw.textbbox((0, 0), name, font=door_font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        text_w, text_h = draw.textsize(name, font=door_font)
        
    text_x = abs_x + (door_width - text_w) / 2
    text_y = abs_y + (door_height - text_h) / 2
    draw.text((text_x, text_y), name, fill=(255, 255, 255, 255), font=door_font)

# Composite and save
final = Image.alpha_composite(img, overlay)
final = final.convert("RGB") # Remove alpha for PNG/JPEG if desired, or keep RGBA
final.save(output_path, "PNG")
print(f"Successfully saved annotated map to {output_path}")

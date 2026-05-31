"""
Generate EduTutor.AI app icon — an amber orb on transparent background.

Single radial-gradient sphere mirroring the splash + Chamber-design orb. No
text, no wordmark — minimal. Looks polished at 16px (taskbar) AND 256px
(installer hero). Saved as a multi-resolution Windows .ico embedding
16/24/32/48/64/128/256 px PNG layers so Windows picks the right size
for context.

Run:
  python make-icon.py
Produces:
  build/icon.ico  (multi-res Windows icon)
  build/icon.png  (256px reference PNG for cross-platform/macOS later)
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

# Chamber design palette (from docs/design-spec + splash.html):
#   accent amber   #E8A87C  ~  (232, 168, 124)
#   deep core      #FDE2BC  ~  (253, 226, 188) — warm highlight at top-left
#   mid amber      #E6A26B  ~  (230, 162, 107)
#   shadow         #C4774A  ~  (196, 119,  74)
#   abyss          #2A1810  ~  ( 42,  24,  16) — far-edge fade to near-black
# These match the .orb radial-gradient in splash.html exactly so the icon
# reads as "the same orb as the splash" even at 16px taskbar size.

def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(len(c1)))

def orb_color(r_norm, hl_dist):
    """Radial gradient orb colour given normalised distance from center (r_norm)
    and distance from the specular highlight (hl_dist)."""
    # Three-stop radial: center -> mid -> rim
    if r_norm < 0.32:
        base = lerp((253, 226, 188), (230, 162, 107), r_norm / 0.32)
    elif r_norm < 0.62:
        base = lerp((230, 162, 107), (196, 119, 74), (r_norm - 0.32) / 0.30)
    else:
        base = lerp((196, 119, 74), (42, 24, 16), (r_norm - 0.62) / 0.38)
    # Add specular highlight (warm white) in the top-left quadrant
    if hl_dist < 0.30:
        hl_t = 1.0 - (hl_dist / 0.30)
        base = lerp(base, (255, 245, 220), hl_t * 0.35)
    return base + (255,)


def make_orb(size):
    """Render the orb at the requested size with a soft amber halo."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # The orb itself sits at 78% of the canvas — leaving room for the halo
    # to bloom around it without being cropped at the icon edge.
    radius = size * 0.39
    cx, cy = size / 2.0, size / 2.0
    # Specular highlight centre — top-left of the orb (35°, ~40% from center).
    hx, hy = cx - radius * 0.28, cy - radius * 0.32

    px = img.load()
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            d = math.sqrt(dx * dx + dy * dy)
            if d > radius:
                continue
            r_norm = d / radius
            hdx = x - hx
            hdy = y - hy
            hl_dist = math.sqrt(hdx * hdx + hdy * hdy) / radius
            px[x, y] = orb_color(r_norm, hl_dist)

    # Halo (soft amber glow around the orb). Render as separate layer and
    # composite — gives a real bloom rather than a hard ring.
    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    halo_radius = radius * 1.55
    # Layer multiple translucent circles for a soft Gaussian-ish glow
    for i in range(14, 0, -1):
        a = int(48 * (i / 14.0) ** 2.5)  # falloff
        r = halo_radius * (1.0 - (i / 14.0) * 0.55)
        hd.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            fill=(232, 168, 124, a),
        )
    halo = halo.filter(ImageFilter.GaussianBlur(radius=size * 0.05))

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out = Image.alpha_composite(out, halo)
    out = Image.alpha_composite(out, img)
    return out


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "build")
    os.makedirs(out_dir, exist_ok=True)

    # Render the master 512px and the per-layer sizes Windows expects.
    sizes = [16, 24, 32, 48, 64, 128, 256]
    layers = []
    for s in sizes:
        print(f"  rendering orb {s}x{s}…")
        layers.append(make_orb(s))

    # Master PNG (used for macOS .icns later, and for the GitHub release page).
    master = make_orb(512)
    master_path = os.path.join(out_dir, "icon.png")
    master.save(master_path, "PNG")
    print(f"saved master PNG -> {master_path}")

    # Multi-resolution Windows .ico. PIL embeds every layer at the requested
    # sizes — Windows picks the correct one for context (taskbar, installer,
    # window title) without scaling.
    ico_path = os.path.join(out_dir, "icon.ico")
    layers[-1].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=layers[:-1],
    )
    print(f"saved Windows ICO -> {ico_path}  ({len(sizes)} layers)")


if __name__ == "__main__":
    main()

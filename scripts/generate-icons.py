"""Generate the project's original, simple list icon using only Python stdlib."""
from pathlib import Path
import struct
import zlib

root = Path(__file__).resolve().parents[1] / "extension" / "icons"
root.mkdir(exist_ok=True)
for size in (16, 48, 128):
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            u, v = (x + .5) / size, (y + .5) / size
            radius = .19
            cx, cy = min(max(u, radius), 1-radius), min(max(v, radius), 1-radius)
            inside = (u-cx)**2 + (v-cy)**2 <= radius**2
            ink = any((.39 <= u <= .79 and abs(v-row) < .033) or ((u-.25)**2+(v-row)**2 < .034**2) for row in (.29,.5,.71))
            pixels.extend((248,250,248,255) if ink else (35,124,103,255) if inside else (0,0,0,0))
    def chunk(tag, data):
        return struct.pack('>I',len(data)) + tag + data + struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(pixels,9)) + chunk(b'IEND',b'')
    (root / f'icon{size}.png').write_bytes(png)

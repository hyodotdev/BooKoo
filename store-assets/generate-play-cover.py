"""Render the R80 cover from native screenshot textures, without redrawing UI.

Run: Blender --background --python store-assets/generate-play-cover.py -- en-US
Only local artwork is written. No store upload, backend, or device access.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "store-assets/marketing/2026-10-09-cover"
LOCALE_CROPS = {
    "en-US": (0, 234),
    "ko-KR": (173, 234),
    "ja": (0, 234),
    "zh-CN": (53, 234),
    "id": (0, 234),
}
arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
APPLE_CONFIG = json.loads((ROOT / 'store-assets/apple-gallery-config.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('locale', nargs='?', default='en-US', choices=set(LOCALE_CROPS) | {value['directory'] for value in APPLE_CONFIG['locales'].values()})
parser.add_argument('--sources', default='store-assets/marketing/2026-09-13/sources')
parser.add_argument('--output', default='store-assets/marketing/2026-10-09-cover')
parser.add_argument('--crop-config')
parser.add_argument('--family', choices=[family['directory'] for family in APPLE_CONFIG['families']])
parser.add_argument('--creative', action='store_true')
options = parser.parse_args(arguments)
locale = options.locale
OUTPUT = ROOT / options.output
source = ROOT / options.sources / f'{locale}-calendar.png'
if (options.family or options.creative) and not options.crop_config:
    raise ValueError('Apple covers require inspected native source crops')
if options.crop_config:
    crops = json.loads((ROOT / options.crop_config).read_text())
    LOCALE_CROPS[locale] = (crops[locale]['calendar']['top'], crops[locale]['calendar']['bottom'])
if not source.is_file():
    raise FileNotFoundError(source)
family = next((value for value in APPLE_CONFIG['families'] if value['directory'] == options.family), None)
destination = OUTPUT / locale / (family['directory'] if family else '') / ('creative.png' if options.creative else '01-intro.png')
destination.parent.mkdir(parents=True, exist_ok=True)


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def color(hex_color):
    return tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1,)


def material(name, hex_color, roughness=0.5, metallic=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color(hex_color)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return result


def round_points(width, height, radius, steps=20):
    points = []
    for cx, cy, initial_angle in (
        (width / 2 - radius, height / 2 - radius, 0),
        (-width / 2 + radius, height / 2 - radius, 90),
        (-width / 2 + radius, -height / 2 + radius, 180),
        (width / 2 - radius, -height / 2 + radius, 270),
    ):
        for step in range(steps + 1):
            angle = math.radians(initial_angle + 90 * step / steps)
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def rounded_slab(name, width, height, radius, bottom, top, mat, parent=None):
    outline = round_points(width, height, radius)
    count = len(outline)
    vertices = [(x, y, bottom) for x, y in outline] + [(x, y, top) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    bevel = obj.modifiers.new("Machined edge", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def screen_material():
    result = bpy.data.materials.new("Unmodified native calendar pixels")
    result.use_nodes = True
    nodes = result.node_tree.nodes
    nodes.clear()
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(source), check_existing=True)
    texture.interpolation = "Linear"
    emission = nodes.new("ShaderNodeEmission")
    output = nodes.new("ShaderNodeOutputMaterial")
    result.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    result.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    return result, texture.image.size[:]


def phone(name, x, y, angle):
    parent = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(parent)
    parent.location = (x, y, 0.18)
    parent.rotation_euler.z = math.radians(angle)
    width = 2.78
    height = width * cropped_height / source_width
    body_height = height + 0.5
    rounded_slab(f"{name} silver sides", 3.08, body_height, 0.4, 0, 0.27, silver, parent)
    rounded_slab(f"{name} white face", 3.06, body_height - 0.02, 0.39, 0.27, 0.325, white, parent)
    rounded_slab(f"{name} glass rim", width + 0.035, height + 0.035, 0.135, 0.325, 0.331, silver, parent)
    # Small glass corners leave the capture's demo status-bar text visible.
    outline = round_points(width, height, 0.12)
    # The native image remains untouched. UV coordinates exclude only the
    # documented system/debug top inset and bottom test-ad/navigation inset.
    mesh = bpy.data.meshes.new(f"{name} screen mesh")
    mesh.from_pydata([(px, py, 0.337) for px, py in outline], [], [tuple(range(len(outline)))])
    mesh.update()
    uv = mesh.uv_layers.new(name="Native screenshot crop")
    for face in mesh.polygons:
        for loop_index in face.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            u = (vertex.x + width / 2) / width
            v = (vertex.y + height / 2) / height
            uv.data[loop_index].uv = (u, (bottom_crop + v * cropped_height) / source_height)
    obj = bpy.data.objects.new(f"{name} native calendar", mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(native_screen)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.05)
    camera_dot = bpy.context.object
    camera_dot.name = f"{name} front camera"
    camera_dot.parent = parent
    camera_dot.location = (0, body_height / 2 - 0.115, 0.327)
    camera_dot.scale.z = 0.16
    camera_dot.data.materials.append(black)
    for index, (side_y, length) in enumerate(((1.8, 0.53), (0.8, 0.8))):
        button = rounded_slab(f"{name} side button {index}", 0.065, length, 0.028, 0.08, 0.18, silver, parent)
        button.location = (-1.55, side_y, 0)
    port = rounded_slab(f"{name} charging port", 0.45, 0.105, 0.045, 0, 0.012, black, parent)
    port.rotation_euler.x = math.radians(90)
    port.location = (0, -body_height / 2 - 0.005, 0.145)
    for hole_x in (-0.97, -0.85, -0.73, -0.61, 0.61, 0.73, 0.85, 0.97):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.027)
        hole = bpy.context.object
        hole.name = f"{name} speaker hole"
        hole.parent = parent
        hole.location = (hole_x, -body_height / 2 - 0.008, 0.145)
        hole.scale.y = 0.15
        hole.data.materials.append(black)
    return parent


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = APPLE_CONFIG['creative']['width'] if options.creative else family['width'] if family else 1080
scene.render.resolution_y = APPLE_CONFIG['creative']['height'] if options.creative else family['height'] if family else 1920
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.compression = 100
scene.render.filepath = str(destination)
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7

white = material("Warm white ceramic frame", "#F3F5F7", roughness=0.28)
silver = material("Satin silver edges", "#D5DADE", roughness=0.32, metallic=0.65)
black = material("Front camera glass", "#1F2632", roughness=0.15)
mint = material("BooKoo mint ground", "#15CBA7", roughness=1)
native_screen, (source_width, source_height) = screen_material()
top_crop, bottom_crop = LOCALE_CROPS[locale]
cropped_height = source_height - top_crop - bottom_crop

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.02))
bpy.context.object.name = "Mint seamless ground"
bpy.context.object.data.materials.append(mint)
phone("Hero phone", 0.6, -1.8, 25)
phone("Cropped companion phone", 4.3, 0.4, 25)

bpy.ops.object.light_add(type="AREA", location=(-5, 3, 10))
light = bpy.context.object
light.name = "Softbox upper left"
light.data.energy = 550
light.data.shape = "DISK"
light.data.size = 6
light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.camera_add(location=(0, -8, 18))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 11.3
camera.data.lens = 45
scene.camera = camera

# A camera-facing exact alpha logo is a graphic overlay in the 3D scene.
logo = bpy.data.materials.new("Original white BooKoo mark")
logo.use_nodes = True
nodes = logo.node_tree.nodes
nodes.clear()
texture = nodes.new("ShaderNodeTexImage")
texture.image = bpy.data.images.load(str(ROOT / "assets/adaptive-icon-foreground.png"))
transparent = nodes.new("ShaderNodeBsdfTransparent")
emission = nodes.new("ShaderNodeEmission")
emission.inputs["Color"].default_value = (1, 1, 1, 1)
mix = nodes.new("ShaderNodeMixShader")
output = nodes.new("ShaderNodeOutputMaterial")
logo.node_tree.links.new(texture.outputs["Alpha"], mix.inputs[0])
logo.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
logo.node_tree.links.new(emission.outputs[0], mix.inputs[2])
logo.node_tree.links.new(mix.outputs[0], output.inputs["Surface"])
rotation = camera.rotation_euler.to_quaternion()
up = rotation @ Vector((0, 1, 0))
right = rotation @ Vector((1, 0, 0))
forward = rotation @ Vector((0, 0, -1))
bpy.ops.mesh.primitive_plane_add(size=1.75)
mark = bpy.context.object
mark.name = "BooKoo white pig mark"
mark.rotation_euler = camera.rotation_euler
mark.location = camera.location + forward * 8 + up * (1.9 if options.creative else 3.8)
if options.creative:
    # R92: leave generous green space between the upper-left mark and phones.
    mark.location += right * -3.85
mark.data.materials.append(logo)
mark.visible_shadow = False

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / f"cover-{locale}{'-' + options.family if options.family else ''}{'-creative' if options.creative else ''}.blend"))
bpy.ops.render.render(write_still=True)
print(f"Cover rendered: {destination}")

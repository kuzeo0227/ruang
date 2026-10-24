"""Shared helpers for rendering the window views in Blender (Cycles on the CPU).

A view script builds its scene around a viewpoint at a floor's height, renders an equirectangular
band from EL_MIN to EL_MAX degrees with the sky left transparent, and saves the linear colour (with
alpha) and the mist pass as .npy files. tools/views/make_band.py then adds the haze, tone-maps and
writes public/backdrops/<view>/.

Axes: x east, y north, z up, in metres. The band's centre column faces north, east is three quarters
of the way across, south is at both edges (the app reads this as uNorth = 0.5).

Run a view (Blender 4.2):
  blender -b --factory-startup --python tools/views/city.py -- --out DIR [--width 6144] [--samples 64] [--pass day|night]
"""

import math
import os
import sys

import bpy
import numpy as np


def parse_args(**defaults):
    """--key value pairs after '--' on Blender's command line, typed after the defaults."""
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    out = dict(defaults)
    i = 0
    while i < len(argv):
        tok = argv[i].lstrip('-')
        if '=' in tok:
            key, val = tok.split('=', 1)
            i += 1
        else:
            key, val = tok, argv[i + 1] if i + 1 < len(argv) else ''
            i += 2
        key = key.replace('-', '_')
        base = defaults.get(key)
        out[key] = type(base)(val) if base is not None and not isinstance(base, str) else val
    return out


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_render(sc, width, el_min, el_max, samples, eye_height, window=None):
    """Cycles on the CPU, an equirectangular camera at eye_height covering el_min..el_max degrees.

    width is for the full 360 degrees. window = (lon0, lon1, lat0, lat1) in degrees renders only that
    part at the same angular resolution, for quick previews (bearings, so 0 is north).
    """
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 3
    sc.cycles.transmission_bounces = 3
    sc.cycles.transparent_max_bounces = 12
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    sc.render.film_transparent = True
    lon0, lon1, lat0, lat1 = window if window else (-180, 180, el_min, el_max)
    sc.render.resolution_x = int(round(width * (lon1 - lon0) / 360))
    sc.render.resolution_y = int(round(width * (lat1 - lat0) / 360))
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.frame_current = 1

    data = bpy.data.cameras.new('panorama')
    data.type = 'PANO'
    data.panorama_type = 'EQUIRECTANGULAR'
    data.latitude_min = math.radians(lat0)
    data.latitude_max = math.radians(lat1)
    # With the camera facing north, longitude is the compass bearing (east +90, left edge = minimum).
    data.longitude_min = math.radians(lon0)
    data.longitude_max = math.radians(lon1)
    data.clip_start = 0.1
    data.clip_end = 250000
    cam = bpy.data.objects.new('panorama', data)
    sc.collection.objects.link(cam)
    cam.location = (0, 0, eye_height)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam

    sc.view_layers[0].use_pass_mist = True
    return cam


def world_sky(sc, sun_elevation, sun_azimuth, strength=1.0, air=1.0, dust=1.0, ozone=1.0, altitude=100):
    """Nishita sky for the day pass. Azimuth is a compass bearing (0 north, 90 east)."""
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = False
    sky.sun_elevation = math.radians(sun_elevation)
    # Blender's sun_rotation turns the sun about +z from +x towards +y; a bearing is from +y towards +x.
    sky.sun_rotation = math.radians(90 - sun_azimuth)
    sky.altitude = altitude
    sky.air_density = air
    sky.dust_density = dust
    sky.ozone_density = ozone
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return w


def world_black(sc):
    w = bpy.data.worlds.new('night')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    return w


def sun_lamp(sc, elevation, azimuth, strength=4.0, angle_deg=0.6, color=(1.0, 0.96, 0.9)):
    data = bpy.data.lights.new('sun', 'SUN')
    data.energy = strength
    data.angle = math.radians(angle_deg)
    data.color = color
    obj = bpy.data.objects.new('sun', data)
    sc.collection.objects.link(obj)
    el = math.radians(elevation)
    az = math.radians(azimuth)
    # Light travels along the lamp's -z; point it from the sun's direction towards the ground.
    d = (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))
    obj.rotation_euler = (0, 0, 0)
    obj.rotation_mode = 'QUATERNION'
    from mathutils import Vector

    obj.rotation_quaternion = Vector(d).to_track_quat('Z', 'Y')
    return obj


def mist(sc, start, depth):
    w = sc.world
    w.mist_settings.start = start
    w.mist_settings.depth = depth
    w.mist_settings.falloff = 'LINEAR'


def render_to_npy(sc, out_dir, name):
    """Render, then save <name>_rgba.npy (linear, premultiplied) and <name>_mist.npy (0 near .. 1 far)."""
    os.makedirs(out_dir, exist_ok=True)
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new('CompositorNodeRLayers')
    comp = nt.nodes.new('CompositorNodeComposite')
    nt.links.new(rl.outputs['Image'], comp.inputs['Image'])
    fo = nt.nodes.new('CompositorNodeOutputFile')
    fo.base_path = out_dir
    fo.format.file_format = 'OPEN_EXR'
    fo.format.color_depth = '32'
    fo.format.exr_codec = 'ZIP'
    fo.format.color_mode = 'RGBA'
    fo.file_slots.clear()
    fo.file_slots.new(f'{name}_rgba_')
    fo.file_slots.new(f'{name}_mist_')
    nt.links.new(rl.outputs['Image'], fo.inputs[0])
    nt.links.new(rl.outputs['Mist'], fo.inputs[1])
    bpy.ops.render.render(write_still=False)
    for slot in ('rgba', 'mist'):
        path = os.path.join(out_dir, f'{name}_{slot}_{sc.frame_current:04d}.exr')
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        arr = px.reshape(h, w, 4)[::-1]  # bpy rows run bottom-up
        np.save(os.path.join(out_dir, f'{name}_{slot}.npy'), arr if slot == 'rgba' else arr[..., 0].copy())
        bpy.data.images.remove(img)
        os.remove(path)


# ---------------------------------------------------------------- materials


def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out


def principled(nt, color=(0.5, 0.5, 0.5, 1), rough=0.6, metal=0.0, spec=0.5):
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    return p


def simple_mat(name, color, rough=0.7, metal=0.0, spec=0.5, emit=None, emit_strength=0.0):
    m, nt, out = node_mat(name)
    p = principled(nt, color, rough, metal, spec)
    if emit is not None:
        p.inputs['Emission Color'].default_value = emit
        p.inputs['Emission Strength'].default_value = emit_strength
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def math_node(nt, op, a=None, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def vmath(nt, op, a=None, b=None):
    n = nt.nodes.new('ShaderNodeVectorMath')
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (tuple, list)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n


def mix_rgb(nt, fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    n.blend_type = blend
    for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(v, (int, float)):
            sock.default_value = v
        elif isinstance(v, (tuple, list)):
            sock.default_value = v
        else:
            nt.links.new(v, sock)
    return n.outputs[2]


def mix_float(nt, fac, a, b):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'FLOAT'
    for sock, v in ((n.inputs[0], fac), (n.inputs[2], a), (n.inputs[3], b)):
        if isinstance(v, (int, float)):
            sock.default_value = v
        else:
            nt.links.new(v, sock)
    return n.outputs[0]


# ---------------------------------------------------------------- geometry


def mesh_object(name, verts, faces, mat=None, attrs=None, smooth=False, collection=None):
    """A mesh from numpy-friendly vertex and face lists, with optional per-face float/colour attributes."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if smooth:
        me.shade_smooth()
    if attrs:
        for key, values in attrs.items():
            values = np.asarray(values, dtype=np.float32)
            if values.ndim == 2:
                a = me.color_attributes.new(key, 'FLOAT_COLOR', 'FACE')
                a.data.foreach_set('color', values.reshape(-1))
            else:
                a = me.attributes.new(key, 'FLOAT', 'FACE')
                a.data.foreach_set('value', values)
    obj = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(obj)
    if mat is not None:
        me.materials.append(mat)
    return obj


class MeshBuilder:
    """Accumulates boxes, prisms and polygons into one mesh, with a per-face colour and value."""

    def __init__(self):
        self.v = []
        self.f = []
        self.col = []
        self.val = []

    def _face(self, idx, col, val):
        self.f.append(idx)
        self.col.append(col)
        self.val.append(val)

    def quad(self, a, b, c, d, col=(1, 1, 1, 1), val=0.0):
        n = len(self.v)
        self.v += [a, b, c, d]
        self._face((n, n + 1, n + 2, n + 3), col, val)

    def box(self, x0, y0, z0, x1, y1, z1, col=(1, 1, 1, 1), val=0.0, top_col=None, bottom=False):
        """Axis-aligned box; faces wind outwards."""
        p = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        n = len(self.v)
        self.v += p
        sides = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        for s in sides:
            self._face(tuple(n + i for i in s), col, val)
        self._face((n + 4, n + 5, n + 6, n + 7), top_col or col, val)
        if bottom:
            self._face((n + 3, n + 2, n + 1, n + 0), col, val)

    def rotated_box(self, cx, cy, w, d, z0, z1, angle, col=(1, 1, 1, 1), val=0.0, top_col=None):
        c, s = math.cos(angle), math.sin(angle)
        corners = []
        for px, py in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)):
            corners.append((cx + px * c - py * s, cy + px * s + py * c))
        n = len(self.v)
        self.v += [(x, y, z0) for x, y in corners] + [(x, y, z1) for x, y in corners]
        for i in range(4):
            j = (i + 1) % 4
            self._face((n + i, n + j, n + 4 + j, n + 4 + i), col, val)
        self._face((n + 4, n + 5, n + 6, n + 7), top_col or col, val)

    def gable_house(self, cx, cy, w, d, h, roof_h, angle, wall=(1, 1, 1, 1), roof=(0.6, 0.3, 0.2, 1), val=0.0):
        """A row of houses: walls to h, a pitched roof along the long side (w)."""
        c, s = math.cos(angle), math.sin(angle)

        def P(px, py, z):
            return (cx + px * c - py * s, cy + px * s + py * c, z)

        hw, hd = w / 2, d / 2
        n = len(self.v)
        self.v += [P(-hw, -hd, 0), P(hw, -hd, 0), P(hw, hd, 0), P(-hw, hd, 0), P(-hw, -hd, h), P(hw, -hd, h), P(hw, hd, h), P(-hw, hd, h)]
        for i in range(4):
            j = (i + 1) % 4
            self._face((n + i, n + j, n + 4 + j, n + 4 + i), wall, val)
        r0 = len(self.v)
        e = 0.4  # eaves
        self.v += [P(-hw - e, -hd - e, h - 0.2), P(hw + e, -hd - e, h - 0.2), P(hw + e, 0, h + roof_h), P(-hw - e, 0, h + roof_h), P(hw + e, hd + e, h - 0.2), P(-hw - e, hd + e, h - 0.2)]
        self._face((r0, r0 + 1, r0 + 2, r0 + 3), roof, val)
        self._face((r0 + 3, r0 + 2, r0 + 4, r0 + 5), roof, val)
        # Gable ends.
        g = len(self.v)
        self.v += [P(-hw, -hd, h), P(-hw, hd, h), P(-hw, 0, h + roof_h), P(hw, hd, h), P(hw, -hd, h), P(hw, 0, h + roof_h)]
        self.f.append((g, g + 2, g + 1))
        self.col.append(wall)
        self.val.append(val)
        self.f.append((g + 3, g + 5, g + 4))
        self.col.append(wall)
        self.val.append(val)

    def terrace(self, cx, cy, n, d, h, roof_h, angle, walls, roofs, porch=True):
        """n terraced houses side by side along the local x axis, each with its own roof colour and a car porch."""
        c, s = math.cos(angle), math.sin(angle)
        w = 6.5
        for k in range(n):
            px = (k - (n - 1) / 2) * w
            x, y = cx + px * c, cy + px * s
            self.gable_house(x, y, w, d, h, roof_h, angle, walls[k % len(walls)], roofs[k % len(roofs)])
            if porch:
                # A flat porch roof over the drive, in front of the house.
                fx, fy = x + (-(d / 2 + 2.6)) * -s, y + (-(d / 2 + 2.6)) * c
                self.rotated_box(fx, fy, w - 0.6, 5.0, 2.7, 2.95, angle, col=(0.32, 0.32, 0.33, 1), top_col=(0.36, 0.36, 0.37, 1))

    def build(self, name, mat, collection=None):
        return mesh_object(name, self.v, self.f, mat, {'col': self.col, 'val': self.val}, collection=collection)


def instancer(name, positions, scales, rotations, instance_obj, collection=None):
    """Instances instance_obj at each position (geometry nodes), with per-point scale and z rotation."""
    positions = np.asarray(positions, dtype=np.float32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(positions))
    me.vertices.foreach_set('co', positions.reshape(-1))
    sc_attr = me.attributes.new('inst_scale', 'FLOAT_VECTOR', 'POINT')
    sc_attr.data.foreach_set('vector', np.asarray(scales, dtype=np.float32).reshape(-1))
    rot_attr = me.attributes.new('inst_rot', 'FLOAT', 'POINT')
    rot_attr.data.foreach_set('value', np.asarray(rotations, dtype=np.float32))
    obj = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(obj)
    mod = obj.modifiers.new('instances', 'NODES')
    ng = bpy.data.node_groups.new(name + '_gn', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nodes, links = ng.nodes, ng.links
    gin = nodes.new('NodeGroupInput')
    gout = nodes.new('NodeGroupOutput')
    inst = nodes.new('GeometryNodeInstanceOnPoints')
    info = nodes.new('GeometryNodeObjectInfo')
    info.inputs['Object'].default_value = instance_obj
    info.inputs['As Instance'].default_value = True
    sca = nodes.new('GeometryNodeInputNamedAttribute')
    sca.data_type = 'FLOAT_VECTOR'
    sca.inputs['Name'].default_value = 'inst_scale'
    rot = nodes.new('GeometryNodeInputNamedAttribute')
    rot.data_type = 'FLOAT'
    rot.inputs['Name'].default_value = 'inst_rot'
    comb = nodes.new('ShaderNodeCombineXYZ')
    links.new(rot.outputs['Attribute'], comb.inputs['Z'])
    links.new(gin.outputs['Geometry'], inst.inputs['Points'])
    links.new(info.outputs['Geometry'], inst.inputs['Instance'])
    links.new(sca.outputs['Attribute'], inst.inputs['Scale'])
    links.new(comb.outputs['Vector'], inst.inputs['Rotation'])
    links.new(inst.outputs['Instances'], gout.inputs['Geometry'])
    mod.node_group = ng
    instance_obj.hide_render = True
    instance_obj.hide_viewport = True
    return obj


def polar(bearing_deg, dist):
    """Plan position from a compass bearing (degrees from north, clockwise) and a distance."""
    b = math.radians(bearing_deg)
    return dist * math.sin(b), dist * math.cos(b)


def instancer3(name, positions, scales, eulers, index, source, collection=None):
    """Instances the objects of `source` (a collection kept out of the scene), one per point.

    Each point picks source object index[i] (objects in name order), scaled by scales[i] (xyz) and
    turned by eulers[i] (XYZ Euler angles, radians).
    """
    positions = np.asarray(positions, dtype=np.float32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(positions))
    me.vertices.foreach_set('co', positions.reshape(-1))
    for key, kind, vals in (
        ('inst_scale', 'FLOAT_VECTOR', np.asarray(scales, dtype=np.float32).reshape(-1)),
        ('inst_euler', 'FLOAT_VECTOR', np.asarray(eulers, dtype=np.float32).reshape(-1)),
        ('inst_index', 'INT', np.asarray(index, dtype=np.int32)),
    ):
        a = me.attributes.new(key, kind, 'POINT')
        a.data.foreach_set('vector' if kind == 'FLOAT_VECTOR' else 'value', vals)
    obj = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(obj)
    mod = obj.modifiers.new('instances', 'NODES')
    ng = bpy.data.node_groups.new(name + '_gn', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nodes, links = ng.nodes, ng.links
    gin = nodes.new('NodeGroupInput')
    gout = nodes.new('NodeGroupOutput')
    inst = nodes.new('GeometryNodeInstanceOnPoints')
    info = nodes.new('GeometryNodeCollectionInfo')
    info.inputs['Collection'].default_value = source
    info.inputs['Separate Children'].default_value = True
    info.inputs['Reset Children'].default_value = True
    inst.inputs['Pick Instance'].default_value = True

    def attr(key, dtype):
        n = nodes.new('GeometryNodeInputNamedAttribute')
        n.data_type = dtype
        n.inputs['Name'].default_value = key
        return n.outputs['Attribute']

    links.new(gin.outputs['Geometry'], inst.inputs['Points'])
    links.new(info.outputs['Instances'], inst.inputs['Instance'])
    links.new(attr('inst_index', 'INT'), inst.inputs['Instance Index'])
    links.new(attr('inst_scale', 'FLOAT_VECTOR'), inst.inputs['Scale'])
    links.new(attr('inst_euler', 'FLOAT_VECTOR'), inst.inputs['Rotation'])
    links.new(inst.outputs['Instances'], gout.inputs['Geometry'])
    mod.node_group = ng
    return obj


def hidden_collection(name):
    """A collection for instance sources: not linked to the scene, so it is never rendered itself."""
    return bpy.data.collections.new(name)


class TubeBuilder:
    """Tapered tubes along polylines (trunks, branches, stems), merged into one mesh."""

    def __init__(self):
        self.v = []
        self.f = []

    def tube(self, pts, radii, sides=8, cap=False):
        pts = np.asarray(pts, dtype=np.float64)
        n = len(pts)
        # Rotation-minimising frames, so the rings don't twist.
        t = np.gradient(pts, axis=0)
        t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
        ref = np.array([0.0, 0.0, 1.0]) if abs(t[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        u = np.cross(t[0], ref)
        u /= np.linalg.norm(u)
        ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
        base = len(self.v)
        for i in range(n):
            if i:
                u = u - t[i] * np.dot(u, t[i])
                u /= np.linalg.norm(u) + 1e-9
            w = np.cross(t[i], u)
            ring = pts[i] + radii[i] * (np.outer(np.cos(ang), u) + np.outer(np.sin(ang), w))
            self.v.extend(ring.tolist())
        for i in range(n - 1):
            for j in range(sides):
                a = base + i * sides + j
                b = base + i * sides + (j + 1) % sides
                self.f.append((a, b, b + sides, a + sides))
        if cap:
            self.f.append(tuple(base + (n - 1) * sides + j for j in range(sides)))

    def build(self, name, mat, collection=None, smooth=True):
        return mesh_object(name, self.v, self.f, mat, smooth=smooth, collection=collection)

#!/usr/bin/env python3
"""A mechanically coherent, original belt-drive turntable. Blender 4.2+.

blender -b --factory-startup --python models/turntables/classic_belt_drive/build.py
Optional: -- --outdir /absolute/path --skip-preview
Units: meters. Front: -Y. Export: glTF +Y up. No external assets/add-ons.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = Path(ARGS[ARGS.index('--outdir') + 1]).resolve() if '--outdir' in ARGS else HERE
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
# Works with distribution Blender builds without OpenImageDenoise.
scene.cycles.use_denoising = False
scene.render.resolution_x = 1500
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Warm studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.64, .61, .54, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
scene.view_settings.view_transform = 'AgX'

def mat(name, color, metal=0, rough=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

silver = mat('Satin-machined aluminium', (.57, .59, .58), .88, .26)
darkmetal = mat('Graphite anodised aluminium', (.045, .052, .052), .72, .3)
rubber = mat('Soft black elastomer', (.012, .014, .014), 0, .78)
vinyl = mat('Deep black vinyl', (.012, .014, .017), .19, .23)
groove = mat('Groove highlights', (.027, .03, .033), .4, .33)
gold = mat('Brass bearing and gold pins', (.46, .29, .09), .8, .26)
label = mat('Burnt orange paper label', (.58, .145, .064), 0, .86)
cream = mat('Letterpress ivory', (.84, .79, .66), 0, .65)
red = mat('Cartridge terracotta', (.39, .07, .036), .15, .32)
copper = mat('Motor copper windings', (.52, .2, .07), .78, .29)
wood = mat('Oiled American walnut', (.23, .11, .054), 0, .38)

# An original, deterministic grain texture, packed into both deliverables.
n = 512
y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n
rng = np.random.default_rng(17)
warp = y * 220 + 2.8 * np.sin(x * 8 + y * 14) + .7 * np.sin(x * 24 + y * 40)
grain = .55*np.sin(warp) + .18*np.sin(warp*3.13) + .12*np.sin(warp*8.4)
grain += rng.normal(0, .12, (n, n))
grain += .8*np.sin(y*22 + x*.7)
rgba = np.ones((n,n,4), dtype=np.float32)
for i, base in enumerate((.29, .145, .077)):
    rgba[:,:,i] = np.clip(base * (1 + grain * .19), 0, 1)
img = bpy.data.images.new('Original walnut grain', width=n, height=n)
img.pixels.foreach_set(rgba.ravel())
img.pack()
tex = wood.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img
wood.node_tree.links.new(tex.outputs['Color'], wood.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

groups = {}
metadata = []
def group(key, title, offset, origin=(0,0,0)):
    o = bpy.data.objects.new(key, None)
    scene.collection.objects.link(o)
    o.location = origin
    o['partId'] = key
    o['explode'] = offset
    groups[key] = o
    metadata.append({'id': key, 'name': title, 'explode': offset})
    return key

def finish(o, name, material, key, bevel=0):
    o.name = name
    if material: o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('Soft machined edges', 'BEVEL')
        b.width = bevel
        b.segments = 3
        o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    for p in o.data.polygons: p.use_smooth = True
    if key:
        world = o.matrix_world.copy()
        o.parent = groups[key]
        o.matrix_world = world
    return o

def box(name, loc, size, material, key, bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, material, key, bevel)

def cyl(name, loc, radius, depth, material, key, vertices=96, bevel=.0006):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, name, material, key, bevel)

def rod(name, a, b, radius, material, key):
    a,b = Vector(a), Vector(b)
    o = cyl(name, (a+b)/2, radius, (a-b).length, material, key, 32, .0002)
    o.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    return o

def ring(name, loc, major, minor, material, key, segments=128):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=8, location=loc, major_radius=major, minor_radius=minor)
    return finish(bpy.context.object, name, material, key)

def tube(name, points, radius, material, key):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions='3D'; c.bevel_depth=radius; c.bevel_resolution=2
    s = c.splines.new('POLY'); s.points.add(len(points)-1)
    for p,co in zip(s.points,points): p.co=(*co,1)
    o=bpy.data.objects.new(name,c); scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return finish(o,name,material,key)

def text(name, body, loc, size, material, key, rotation=(0,0,0)):
    c=bpy.data.curves.new(name,'FONT'); c.body=body; c.size=size; c.align_x='CENTER'; c.extrude=.00002
    o=bpy.data.objects.new(name,c); scene.collection.objects.link(o); o.location=loc; o.rotation_euler=rotation
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH')
    finish(o,name,material,key)

cx,cy = -.052, .002
group('feet', 'Isolation feet', [0,-.85,0])
for i,(x,y) in enumerate(((-.173,-.12),(.173,-.12),(-.173,.12),(.173,.12))):
    cyl(f'Foot {i+1} rubber sole',(x,y,.012),.018,.012,rubber,'feet')
    cyl(f'Foot {i+1} aluminium collar',(x,y,.022),.019,.01,darkmetal,'feet')
    ring(f'Foot {i+1} trim',(x,y,.024),.0185,.0006,silver,'feet',64)

group('plinth', 'Walnut plinth', [0,-.32,0])
box('Solid walnut cabinet',(0,0,.048),(.45,.35,.044),wood,'plinth',.005)
box('Recessed bottom chassis',(0,0,.027),(.434,.332,.006),darkmetal,'plinth',.002)
text('Front maker mark','P H O N O G R A P H',(.11,-.176,.045),.004,cream,'plinth',(math.pi/2,0,0))
cyl('Speed selector',(-.19,-.132,.074),.011,.009,darkmetal,'plinth')
box('Selector indicator',(-.19,-.139,.079),(.001,.006,.0005),cream,'plinth',0)
text('33 speed engraving','33',(-.206,-.114,.0705),.004,cream,'plinth')
text('45 speed engraving','45',(-.174,-.114,.0705),.004,cream,'plinth')
for x in (.14,.165):
    o=cyl('Gold plated RCA socket',(x,.178,.045),.004,.012,gold,'plinth',32)
    o.rotation_euler=(math.pi/2,0,0)

group('bearing', 'Main bearing', [0,.07,0])
cyl('Bearing brass housing',(cx,cy,.057),.012,.036,gold,'bearing')
cyl('Hardened steel spindle',(cx,cy,.096),.0035,.069,silver,'bearing',48)
ring('Bearing thrust collar',(cx,cy,.071),.012,.0015,darkmetal,'bearing',64)

group('motor', 'Isolated drive motor', [-.58,.38,-.3])
mx,my=-.16,.093
cyl('Motor isolation cradle',(mx,my,.071),.024,.006,rubber,'motor')
cyl('Motor housing',(mx,my,.083),.02,.021,darkmetal,'motor')
for z in (.076,.08,.084,.088): ring('Copper motor winding',(mx,my,z),.0201,.0012,copper,'motor',64)
cyl('Motor cap',(mx,my,.095),.021,.004,silver,'motor')
cyl('Motor axle',(mx,my,.103),.002,.016,silver,'motor',32)
cyl('33 pulley',(mx,my,.102),.006,.005,gold,'motor',64)
cyl('45 pulley',(mx,my,.108),.0081,.005,gold,'motor',64)
for dx in (-.029,.029):
    cyl('Motor mounting screw',(mx+dx,my,.073),.002,.004,silver,'motor',24)

group('drive', 'Belt & subplatter', [0,.53,0], (cx,cy,.094))
cyl('Subplatter hub',(cx,cy,.092),.049,.019,darkmetal,'drive',128)
cyl('Subplatter machined face',(cx,cy,.103),.05,.004,silver,'drive',128)
# External tangents of the two unequal pulley circles: real belt routing.
c1=Vector((cx,cy)); c2=Vector((mx,my)); r1=.0498; r2=.0067
d=(c2-c1).length; angle=math.atan2(my-cy,mx-cx); alpha=math.acos((r1-r2)/d)
points=[]
for a in np.linspace(angle+alpha,angle+2*math.pi-alpha,120): points.append((cx+r1*math.cos(a),cy+r1*math.sin(a),.101))
for a in np.linspace(angle-alpha,angle+alpha,48): points.append((mx+r2*math.cos(a),my+r2*math.sin(a),.101))
points.append(points[0])
tube('Continuous elastomer drive belt',points,.0011,rubber,'drive')

group('platter', 'Aluminium platter', [0,1.12,0], (cx,cy,.115))
cyl('Mass loaded aluminium platter',(cx,cy,.115),.151,.019,silver,'platter',192,.0014)
for z in (.108,.112,.116,.12): ring('Lathe-cut platter rim',(cx,cy,z),.151,.00035,darkmetal,'platter',192)
cyl('Platter top inset',(cx,cy,.125),.146,.002,darkmetal,'platter',192)

group('mat', 'Felt mat', [0,1.65,0], (cx,cy,.128))
cyl('Charcoal wool felt mat',(cx,cy,.128),.147,.003,rubber,'mat',192)

group('record', 'The vinyl record', [0,2.22,0], (cx,cy,.131))
cyl('12 inch vinyl LP',(cx,cy,.131),.1524,.0018,vinyl,'record',256,.00035)
# Join the delicate physical rings to keep browser draw calls low.
verts=[]; faces=[]; seg=192
for r in np.linspace(.054,.146,92):
    start=len(verts)
    for j in range(seg):
        a=j*2*math.pi/seg
        for rr in (r-.000055,r+.000055): verts.append((cx+rr*math.cos(a),cy+rr*math.sin(a),.13203))
    for j in range(seg):
        k=start+j*2; nxt=start+((j+1)%seg)*2
        faces.append((k,nxt,nxt+1,k+1))
mesh=bpy.data.meshes.new('Groove bands'); mesh.from_pydata(verts,[],faces); mesh.update()
o=bpy.data.objects.new('Ninety-two visible concentric groove bands',mesh); scene.collection.objects.link(o)
finish(o,o.name,groove,'record')
cyl('Terracotta record label',(cx,cy,.1322),.049,.00025,label,'record',128,0)
ring('Label hairline',(cx,cy,.1324),.044,.00019,cream,'record',128)
text('Record label title','S O F T   F O C U S',(cx,cy+.012,.1325),.005,cream,'record')
text('Record label subtitle','THE LISTENING ROOM',(cx,cy+.002,.1325),.003,cream,'record')
text('Record label edition','SIDE A     /     33 1/3',(cx,cy-.018,.1325),.003,cream,'record')
cyl('Record centre hole',(cx,cy,.1327),.0037,.0004,darkmetal,'record',48,0)

ax,ay=.158,.105
group('tonearm', 'Tonearm & counterweight', [1.0,.82,-.06], (ax,ay,.106))
cyl('Tonearm mounting flange',(ax,ay,.076),.023,.01,darkmetal,'tonearm')
cyl('Precision tonearm pillar',(ax,ay,.1165),.012,.077,silver,'tonearm')
ring('Tonearm bearing trim',(ax,ay,.144),.013,.0015,gold,'tonearm',64)
box('Gimbal bridge',(ax,ay,.154),(.037,.017,.024),darkmetal,'tonearm',.003)
rod('Gimbal horizontal axle',(ax-.022,ay,.154),(ax+.022,ay,.154),.0035,silver,'tonearm')
# Arm is parked at the outside edge; browser rotates the entire group for playback.
rod('Polished aluminium arm tube',(ax,ay+.052,.16),(ax-.018,ay-.166,.16),.0042,silver,'tonearm')
o=cyl('Adjustable counterweight',(ax+.003,ay+.045,.16),.018,.031,darkmetal,'tonearm')
o.rotation_euler=(math.pi/2,0,0)
for yy in (ay+.031,ay+.059):
    o=ring('Counterweight satin ring',(ax+.003,yy,.16),.0179,.0008,silver,'tonearm',64); o.rotation_euler=(math.pi/2,0,0)
box('Arm rest',(.153,-.032,.1155),(.012,.012,.085),darkmetal,'tonearm',.002)
rod('Cueing lever',(.18,.074,.137),(.191,.057,.162),.0014,silver,'tonearm')
box('Headshell',(.138,-.076,.157),(.018,.034,.005),darkmetal,'tonearm',.002)
rod('Finger lift',(.145,-.087,.161),(.164,-.096,.17),.0012,silver,'tonearm')
for yy in (-.068,-.08): cyl('Headshell screw',(.138,yy,.161),.0018,.003,silver,'tonearm',24)

group('cartridge', 'Cartridge & diamond stylus', [1.15,.87,.85], (.138,-.078,.121))
box('Cartridge body floor',(.138,-.078,.141),(.014,.022,.003),red,'cartridge',.0008)
for xx in (.1318,.1442): box('Cartridge body side wall',(xx,-.078,.147),(.0016,.022,.011),red,'cartridge',.0006)
box('Cartridge body rear wall',(.138,-.0675,.147),(.014,.001,.011),red,'cartridge',.0004)
box('Generator pole bridge',(.138,-.071,.15),(.01,.002,.004),darkmetal,'cartridge',.0004)
for xx in (.1345,.1415):
    rod('Fixed coil iron core',(xx,-.080,.148),(xx,-.073,.148),.0008,darkmetal,'cartridge')
    for yy in np.linspace(-.0795,-.0735,11):
        o=ring('Fixed copper generator coil',(xx,float(yy),.148),.0015,.00023,copper,'cartridge',24)
        o.rotation_euler=(math.pi/2,0,0)
box('Moving magnet',(.138,-.082,.145),(.0025,.003,.003),darkmetal,'cartridge',.0003)
rod('Boron cantilever',(.138,-.081,.141),(.136,-.092,.134),.00055,gold,'cartridge')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.001,location=(.136,-.092,.133))
finish(bpy.context.object,'Diamond stylus tip',silver,'cartridge')
for i, color in enumerate(((.5,.02,.01),(.02,.25,.04),(.02,.05,.4),(.7,.7,.65))):
    m=mat('Signal wire '+str(i),color,.1,.4)
    xx=.133+i*.0033
    tube('Fine cartridge lead',[(xx,-.065,.149),(xx,-.06,.147),(xx,-.055,.155)],.0004,m,'cartridge')

group('cover', 'Acrylic dust cover', [0,2.9,-.5])
glass=mat('Lightly smoked acrylic',(.64,.69,.67),0,.12)
p=glass.node_tree.nodes['Principled BSDF']; p.inputs['Transmission Weight'].default_value=.92; p.inputs['IOR'].default_value=1.49
box('Dust cover top',(0,0,.206),(.46,.36,.003),glass,'cover',.002)
box('Dust cover front',(0,-.179,.162),(.46,.003,.088),glass,'cover',.001)
box('Dust cover rear',(0,.179,.162),(.46,.003,.088),glass,'cover',.001)
for x in (-.229,.229): box('Dust cover side',(x,0,.162),(.003,.36,.088),glass,'cover',.001)
for x in (-.15,.15): box('Dust cover hinge',(x,.18,.086),(.028,.017,.022),darkmetal,'cover',.002)

# Export the parts only, before adding the presentation studio.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'model.glb'),export_format='GLB',use_selection=True,export_extras=True,export_apply=True,export_yup=True)
metadata_doc={
  'id':'classic_belt_drive', 'name':'The modern classic', 'version':1,
  'description':'Original educational interpretation of a manual belt-drive hi-fi turntable; not a replica of a commercial product.',
  'units':'meters','dimensions_m':{'width':.45,'depth':.35,'height':.208},
  'gltf_up':'+Y','front':'+Z','web_display_scale':10,
  'parts':metadata,'notes':['Visible grooves are enlarged for legibility.','Motor and cartridge internals are simplified.','Signal amplification and speakers are external to this deck.']
}
(OUT/'metadata.json').write_text(json.dumps(metadata_doc,indent=2)+'\n')

# Studio setup remains in the editable .blend, never in the interactive GLB.
for obj in [groups['cover'], *groups['cover'].children_recursive]: obj.hide_render=True
floor=mat('Studio paper',(.72,.69,.62),0,.9)
box('Studio floor',(0,0,-.012),(200,200,.01),floor,None,0)
def light(name,loc,energy,size,color):
    d=bpy.data.lights.new(name,'AREA'); d.energy=energy; d.shape='DISK'; d.size=size; d.color=color
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=loc
    o.rotation_euler=(Vector((0,0,.07))-o.location).to_track_quat('-Z','Y').to_euler()
light('Large softbox',(-.4,-.3,.9),45,.7,(1,.92,.81))
light('Cool rim',(.25,.4,.7),32,.5,(.83,.9,1))
light('Front fill',(.5,-.5,.35),12,.4,(1,.95,.87))
d=bpy.data.cameras.new('Product portrait'); cam=bpy.data.objects.new('Product portrait',d); scene.collection.objects.link(cam)
cam.location=(.53,-.69,.61); cam.rotation_euler=(Vector((0,0,.073))-cam.location).to_track_quat('-Z','Y').to_euler()
d.type='ORTHO'; d.ortho_scale=.66; scene.camera=cam
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'model.blend'))
if '--skip-preview' not in ARGS:
    scene.render.filepath=str(OUT/'preview.png'); bpy.ops.render.render(write_still=True)
if OUT == HERE:
    import shutil
    public=ROOT/'public'/'models'; public.mkdir(parents=True,exist_ok=True)
    shutil.copy2(OUT/'model.glb', public/'classic-belt-drive.glb')
    shutil.copy2(OUT/'metadata.json', public/'classic-belt-drive.json')
    if (OUT/'preview.png').exists(): shutil.copy2(OUT/'preview.png',public/'classic-belt-drive.png')
print('Turntable model built:',OUT)

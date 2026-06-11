#!/usr/bin/env python3
"""Build a floor-plan DXF (site meters) from NavVis as-built orthophotos.
Layers:
  NAVVIS-PLAN-0 / -1     : georeferenced orthophoto image underlays (ground / first), per building
  NAVVIS-FOOTPRINT       : building emprises
  NAVVIS-ROOM-0 / -1     : 6190 room centroids + area/Hsp labels
  LOT-TRACE-0 / -1       : empty — for the user to draw lot boundaries over the real plan
Images referenced by relative path 'orthophotos/underlay/<name>.png' (keep folder layout).
"""
import json, os, ezdxf

ROOT="/Users/dragan/Documents/cad-mcp"; EXP=os.path.join(ROOT,"navvis_export")
geo=json.load(open(os.path.join(EXP,"orthophotos/georef.json")))
api=json.load(open(os.path.join(EXP,"raw/api_geometry.json")))
sm=api["site_model"]["body"]
rooms=json.load(open(os.path.join(EXP,"areas/areas_6190_rooms.json")))

doc=ezdxf.new("R2018"); doc.header["$INSUNITS"]=6  # meters
msp=doc.modelspace()
for lyr,col in [("NAVVIS-PLAN-0",8),("NAVVIS-PLAN-1",8),("NAVVIS-FOOTPRINT",5),
                ("NAVVIS-ROOM-0",3),("NAVVIS-ROOM-1",3),("LOT-TRACE-0",1),("LOT-TRACE-1",1),
                ("NAVVIS-NOTES",7)]:
    doc.layers.add(lyr,color=col)

# image underlays
for name,g in geo.items():
    floor="0" if name.endswith("_0") else "1"
    idef=doc.add_image_def(filename=f"orthophotos/underlay/{name}.png", size_in_pixel=(g["px"],g["py"]))
    msp.add_image(insert=(g["world_xmin"],g["world_ymin"]),
                  size_in_units=(g["world_xmax"]-g["world_xmin"], g["world_ymax"]-g["world_ymin"]),
                  image_def=idef, rotation=0, dxfattribs={"layer":f"NAVVIS-PLAN-{floor}"})

# footprints
for b in sm:
    ring=b["scs_polygon"]["coordinates"][0]
    msp.add_lwpolyline(ring, close=True, dxfattribs={"layer":"NAVVIS-FOOTPRINT"})

# 6190 rooms per floor
for r in rooms:
    fl="0" if r["floor"]=="+0" else "1"
    p=(r["nx"],r["ny"])
    msp.add_circle(p, radius=0.3, dxfattribs={"layer":f"NAVVIS-ROOM-{fl}"})
    txt=f"{r['id']} {r['area_m2']:.1f}m2" + (f" H{r['hsp_m']:.1f}" if r['hsp_m'] else "")
    msp.add_text(txt, height=0.35, dxfattribs={"layer":f"NAVVIS-ROOM-{fl}"}).set_placement((p[0]+0.4,p[1]))

note=("FERME DU TEMPLE — plans as-built NavVis (orthophotos, coupe horizontale ~1.2 m au-dessus du sol, "
      "coordonnees site metres, EPSG:8370). PLAN-0 = rez, PLAN-1 = etage. Tracer les lots sur LOT-TRACE-*. "
      "Aires 6190 indicatives. F19/F18/G25 = volumes non cloisonnes a redecouper.")
msp.add_mtext(note, dxfattribs={"layer":"NAVVIS-NOTES","char_height":0.5}).set_location((-43,-52),attachment_point=1)

out=os.path.join(EXP,"ferme_du_temple_PLANS_navvis_local_m.dxf")
doc.saveas(out)
print("wrote",out)
print("images:",len(geo),"footprints:",len(sm),"rooms:",len(rooms))

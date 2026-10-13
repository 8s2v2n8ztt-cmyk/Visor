"""Import the official workbook and ArcGIS service areas. Requires openpyxl.

Usage: python scripts/update_data.py workbook.xlsx areas.json
"""
import collections
import json
import math
import pathlib
import sys
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]

def text(value):
    return " ".join(str(value).split()) if value is not None else "S/I"

def write(path, value):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")

def signed_area(ring):
    x,y = ring[0]
    return sum((a[0]-x)*(b[1]-y)-(b[0]-x)*(a[1]-y) for a,b in zip(ring,ring[1:])) / 2

def contains(ring, point):
    x,y = point
    inside = False
    for a,b in zip(ring,ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside

def convert_rings(source):
    # ArcGIS may list several outer rings and interior holes in any order.
    # Establish containment, then emit RFC 7946 outer CCW / inner CW rings.
    rings = []
    for ring in source:
        points = [[float(p[0]), float(p[1])] for p in ring]
        assert all(math.isfinite(x) and math.isfinite(y) and -110 < x < -65 and -57 < y < -17 for x,y in points)
        if points[0] != points[-1]:
            points.append(points[0])
        assert len(points) >= 4 and len(set(map(tuple,points))) >= 3
        assert abs(signed_area(points)) > 0
        rings.append(points)
    sizes = [abs(signed_area(r)) for r in rings]
    parents = []
    for i,ring in enumerate(rings):
        candidates = [j for j,other in enumerate(rings) if sizes[j] > sizes[i] and contains(other,ring[0])]
        parents.append(min(candidates,key=lambda j:sizes[j]) if candidates else None)
    def depth(i):
        return 0 if parents[i] is None else depth(parents[i])+1
    polygons = []
    for i,ring in enumerate(rings):
        if depth(i)%2:
            continue
        outer = ring if signed_area(ring)>0 else ring[::-1]
        holes = [r if signed_area(r)<0 else r[::-1] for j,r in enumerate(rings) if parents[j]==i]
        polygons.append([outer,*holes])
    assert sum(len(p) for p in polygons)==len(rings)
    return {"type":"Polygon","coordinates":polygons[0]} if len(polygons)==1 else {"type":"MultiPolygon","coordinates":polygons}

book = openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)
rows = list(book["BD_OFICIAL"].values)
headers = rows[0]
systems = []
fields = {"name":"NOMBRE_OFICIAL_SISTEMA","region":"REGIÓN","province":"PROVINCIA","commune":"COMUNA","classification":"CLASIFICACIÓN_ART_106_D50","pointType":"PUNTO_REFERENCIA_COORDENADAS","settlementType":"TIPO_ASENTAMIENTO","technicalCondition":"CONDICIÓN_TÉCNICA_APR","generator":"GRUP_ELECTRO_EMER_AP","telemetry":"TELEMETRIA"}
for rownum,row in enumerate(rows[1:],2):
    r = dict(zip(headers,row))
    if not r["MXLOCATION"]:
        continue
    lon,lat = r["COORD_GEOGRÁFICAS_LONGITUD_SIRGAS_CHILE"],r["COORD_GEOGRÁFICAS_LATITUD_SIRGAS_CHILE"]
    assert isinstance(lon,(int,float)) and isinstance(lat,(int,float)) and -110<lon<-65 and -57<lat<-17
    system = {"id":text(r["MXLOCATION"]),**{k:text(r[v]) for k,v in fields.items()},"year":r["AÑO_PUESTA_EN_MARCHA"],"connections":r["N°_ARRANQUES"],"beneficiaries":r["BENEFICIARIOS_ESTIMADOS"],"utm":{"east":r["COORD_ESTE_DATUM_WGS84"],"north":r["COORD_NORTE_DATUM_WGS84"],"zone":r["HUSO"]},"originalZone":r["HUSO"],"location":{"lat":lat,"lng":lon},"coordinateStatus":"VALIDADA_PARA_VISOR","sourceRow":rownum}
    if system["region"] == "ARAUCANÍA" and system["province"] == "CAUTIN":
        system["province"] = "CAUTÍN"
    assert all(isinstance(system[k],(int,float)) and system[k]>=0 for k in ["connections","beneficiaries"])
    systems.append(system)
by_id = {s["id"]:s for s in systems}
assert len(by_id)==len(systems), "Duplicate SSR IDs"
files = {"ARICA Y PARINACOTA":"arica-y-parinacota","TARAPACÁ":"tarapaca","ANTOFAGASTA":"antofagasta","ATACAMA":"atacama","COQUIMBO":"coquimbo","VALPARAÍSO":"valparaiso","METROPOLITANA":"metropolitana","O'HIGGINS":"ohiggins","MAULE":"maule","ÑUBLE":"nuble","BIOBÍO":"biobio","ARAUCANÍA":"araucania","LOS RÍOS":"los-rios","LOS LAGOS":"los-lagos","AYSÉN":"aysen","MAGALLANES":"magallanes"}
areas = json.loads(pathlib.Path(sys.argv[2]).read_text())
collections_by_region = {region:[] for region in files}
bounds = []
for feature in areas:
    id = text(feature["attributes"]["ID_SSR"])
    assert id in by_id, f"Unmatched area: {id}"
    geometry = convert_rings(feature["geometry"]["rings"])
    collections_by_region[by_id[id]["region"]].append({"type":"Feature","properties":{"id":id},"geometry":geometry})
    points = [p for ring in feature["geometry"]["rings"] for p in ring]
    bounds.append({"id":id,"b":[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]})
assert len({b["id"] for b in bounds})==len(bounds), "Duplicate area IDs"
systems.sort(key=lambda s:(s["region"],s["name"],s["id"]))
chunk = math.ceil(len(systems)/4)
for i in range(4):
    write(f"src/data/ssr-oficiales-{i+1}.json",systems[i*chunk:(i+1)*chunk])
for region,features in collections_by_region.items():
    write(f"public/data/areas-servicio/{files[region]}.geojson",{"type":"FeatureCollection","features":features})
write("public/data/areas-servicio/bounds.json",sorted(bounds,key=lambda b:b["id"]))
write("src/data/area-service-ids.json",sorted(b["id"] for b in bounds))
summary = {"systems":len(systems),"connections":sum(s["connections"] for s in systems),"beneficiaries":sum(s["beneficiaries"] for s in systems),"areas":len(areas),"withoutArea":len(systems)-len(bounds),"regions":{r:{"systems":sum(s["region"]==r for s in systems),"areas":len(f)} for r,f in collections_by_region.items()}}
print(json.dumps(summary,ensure_ascii=False,indent=2))

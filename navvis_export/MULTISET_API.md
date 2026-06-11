# multiset.ai REST API — exploration (2026-06-09)

Explored at user request. Base: `https://api.multiset.ai/v1`. Docs: https://docs.multiset.ai/basics/rest-api-docs

## What it is
A **Visual Positioning System (VPS)** platform. A "Map" = an uploaded scan used for AR/localization.
Maps can be grouped (MapSet), versioned/aligned (Map Version), queried for localization, and their
files downloaded.

## Auth — M2M (blocker for us)
`POST https://api.multiset.ai/v1/m2m/token`
- Header `Authorization: Basic base64(clientId:clientSecret)`, body `{clientId, clientSecret}`.
- Returns `{token, expiresOn}` (JWT, 30 min). All other calls use `Authorization: Bearer <token>`.
- Probed live: token endpoint → 400 "Authorization header is required and should start with Basic";
  `/vps/map` → 401 "Authorization header missing". **API reachable; we have no clientId/clientSecret.**

## Endpoints relevant to getting geometry/areas
| Method | Path | Use |
|---|---|---|
| GET | `/vps/map` | **list all maps** in the account (mapCode, name, status…) |
| GET | `/vps/map/{mapCode}` | **map details** incl. `spatialMetrics`: total area, floor count, **per-floor `area_sqm`, elevation, num_captures, bounds [x,y] min/max**; `location` (lng/lat/alt); `heading`; `storage` bytes; `offlineBundleStatus`/`offlineBundle` (download availability); `thumbnail` |
| GET | `/file` | download a map file (spec in filelink.yaml; not fully documented) |
| POST | `/file/upload-url` | signed URL to PUT a file, e.g. `<accountId>/<mapId>/Mesh/TexturedMesh.glb` → maps carry a **textured mesh (.glb)** |
| POST | `/map-version` | create a version (align two maps); `MVER_…` / `MAP_…` codes |
| GET | `/map-version/{versionCode}` | version state (scans, relative poses, active map, status) |
| POST/PUT/DELETE | `/map-version/...` | add / activate / remove maps in a version |

## Verdict for the Ferme du Temple task
- **NavVis IVION (the twin holding our scan) makes ZERO calls to multiset.ai** — they are *separate,
  unrelated* platforms. The scan is on NavVis, not (as far as we can see) on multiset.
- **No multiset credentials** exist in Gmail or Drive (searched).
- IF the scan were also uploaded to a multiset account we can access, this API would be a *clean*
  path: `spatialMetrics` gives per-floor areas+bounds directly, and `/file` + the `.glb` mesh would
  give sliceable geometry for floor plans / façade / coupe — much easier than scraping the viewer.
- Without a multiset account + clientId/clientSecret + the Ferme du Temple `mapCode`, this path is
  not actionable. Pending user input.
